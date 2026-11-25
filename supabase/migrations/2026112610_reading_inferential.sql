-- Plan 14: comprensión inferencial medida.
-- Cada intento guarda cuántas de sus preguntas eran inferenciales y cuántas
-- acertó. Los intentos anteriores quedan a 0: entonces todas las preguntas
-- eran literales, así que score/total ya son su comprensión literal.
alter table public.reading_attempts
  add column if not exists inferential_score integer not null default 0,
  add column if not exists inferential_total integer not null default 0;

alter table public.reading_attempts
  drop constraint if exists reading_attempts_inferential_bounds;
alter table public.reading_attempts
  add constraint reading_attempts_inferential_bounds
  check (inferential_score between 0 and inferential_total and inferential_total <= total);

-- learning_report: igual que en 2026090601_analytics.sql, más el desglose
-- inferencial de cada intento.
create or replace function public.learning_report(p_days integer default 90)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurred_at', e.occurred_at,
        -- Mapeo canónico: en la base apply_review guarda grade como 1..4.
        -- La RPC lo transforma a nombres canónicos ('again'..'easy') para la API.
        -- Como defensa en profundidad, stats.ts y retention.ts también soportan '1' por seguridad.
        'grade', case e.payload->>'grade'
          when '1' then 'again'
          when '2' then 'hard'
          when '3' then 'good'
          when '4' then 'easy'
          else e.payload->>'grade'
        end,
        'skill', e.skill,
        'phase_before', e.payload->>'phase_before'
      ))
      from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'review_rated'
        and e.payload->>'grade' is not null
        and e.payload->>'phase_before' is not null
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurred_at', e.occurred_at,
        'skill', e.skill,
        'correct', (e.payload->>'correct')::boolean,
        'mode', e.payload->>'mode'
      ))
      from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'exercise_attempted'
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'lookups', coalesce((
      select count(*) from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'word_looked_up'
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), 0),
    'reading_sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.reading_slug,
        'seconds', extract(epoch from (p.finished_at - p.started_at)),
        'pinyin_shown', p.pinyin_shown,
        -- Cuenta caracteres chinos reales (CJK), ignorando signos de puntuación.
        -- Se usa E'...' para que el lexer de Postgres interprete los escapes \u a UTF-8.
        'chars', coalesce((
          select sum(length(regexp_replace(s->>'zh', E'[^\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]', '', 'g')))::integer
          from jsonb_array_elements(r.sentences) as s
        ), 0)
      ))
      from public.reading_progress p
      left join public.reading r on r.slug = p.reading_slug
      where p.user_id = auth.uid()
        and p.finished_at is not null
        and p.started_at is not null
        and p.finished_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'skill_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', s.target_id,
        'skill', s.skill,
        'stability', s.stability,
        'suspended', s.suspended,
        'last_reviewed_at', s.last_reviewed_at,
        'in_scope', exists (
          select 1 from public.words w
          where w.id = s.target_id
            and w.hsk_level <= (
              select coalesce(us.current_level, 1)
              from public.user_settings us
              where us.user_id = auth.uid()
            )
        )
      ))
      from public.learner_skill_state s
      where s.user_id = auth.uid() and s.target_kind = 'word'
    ), '[]'::jsonb),
    'reading_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', a.created_at,
        'reading_slug', a.reading_slug,
        'score', a.score,
        'total', a.total,
        'inferential_score', a.inferential_score,
        'inferential_total', a.inferential_total
      ))
      from public.reading_attempts a
      where a.user_id = auth.uid()
        and a.created_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'mistakes_count', (
      select count(*)::integer from public.mistake_queue(2147483647)
    ),
    'syllabus_words_count', (
      select count(*)::integer
      from public.words w
      where w.hsk_level <= (
        select coalesce(us.current_level, 1)
        from public.user_settings us
        where us.user_id = auth.uid()
      )
    ),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', p.code,
        'title', p.title,
        'hsk_level', p.hsk_level,
        'total_words', p.total_words,
        'settled_words', p.settled_words,
        'total_items', p.total_items,
        'settled_items', p.settled_items,
        'completed', p.completed
      ) order by p.hsk_level, p.order_idx)
      from public.unit_progress() p
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.learning_report(integer) from public;
grant execute on function public.learning_report(integer) to authenticated;
