-- supabase/migrations/2026090601_analytics.sql
--
-- La velocidad de lectura con pinyin visible y sin él son dos cosas distintas:
-- con pinyin se está leyendo una transcripción. Sin esta columna, la métrica
-- promedia las dos y no mide ninguna.
alter table public.reading_progress
  add column if not exists pinyin_shown boolean;

-- review_rated no guardaba phase_before. Sin él, la retención observada no
-- puede excluir las tarjetas en aprendizaje y la métrica sale contaminada.
create or replace function public.apply_review(
  p_card_id uuid,
  p_review_id uuid,
  p_reviewed_at timestamptz,
  p_expected_version bigint,
  p_grade smallint,
  p_skill public.learning_skill,
  p_state jsonb,
  p_prior jsonb,
  p_time_ms integer default null
)
returns table(outcome text, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_word_id bigint;
  v_state public.learner_skill_state;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_card_id is null or p_review_id is null or p_reviewed_at is null then
    raise exception 'review identity and timestamp are required';
  end if;
  if p_expected_version is null then
    raise exception 'expected_version must not be null';
  end if;
  if p_grade is null or p_grade < 1 or p_grade > 4 then
    raise exception 'grade must be between 1 and 4';
  end if;
  if p_skill is null then
    raise exception 'skill must not be null';
  end if;
  if p_state is null or p_state->>'due' is null or p_state->>'state' is null then
    raise exception 'state must contain due and state';
  end if;
  if p_prior is null then
    raise exception 'prior state must not be null';
  end if;
  if p_time_ms is not null and p_time_ms < 0 then
    raise exception 'time_ms must be non-negative';
  end if;

  select word_id into v_word_id
  from public.srs_cards
  where id = p_card_id and user_id = v_user_id;

  if not found then
    raise exception 'Card not found';
  end if;

  select * into v_state
  from public.learner_skill_state
  where user_id = v_user_id
    and target_kind = 'word'
    and target_id = v_word_id
    and skill = p_skill
  for update;

  if not found then
    insert into public.learner_skill_state (user_id, target_kind, target_id, skill)
    values (v_user_id, 'word', v_word_id, p_skill)
    on conflict (user_id, target_kind, target_id, skill) do nothing;

    select * into v_state
    from public.learner_skill_state
    where user_id = v_user_id
      and target_kind = 'word'
      and target_id = v_word_id
      and skill = p_skill
    for update;
  end if;

  if exists (
    select 1 from public.review_log
    where user_id = v_user_id and client_review_id = p_review_id
  ) then
    select s.version into version
    from public.learner_skill_state s
    where s.id = v_state.id;
    outcome := 'duplicate';
    return next;
    return;
  end if;

  if v_state.version <> p_expected_version then
    outcome := 'conflict';
    version := v_state.version;
    return next;
    return;
  end if;

  v_new_version := v_state.version + 1;

  update public.learner_skill_state set
    difficulty       = (p_state->>'difficulty')::numeric,
    stability        = (p_state->>'stability')::numeric,
    reps             = (p_state->>'reps')::integer,
    lapses           = (p_state->>'lapses')::integer,
    learning_steps   = (p_state->>'learning_steps')::integer,
    scheduled_days   = (p_state->>'scheduled_days')::integer,
    elapsed_days     = (p_state->>'elapsed_days')::integer,
    fsrs_state       = p_state->>'state',
    next_review_at   = (p_state->>'due')::timestamptz,
    last_reviewed_at = p_reviewed_at,
    leech            = greatest(
      coalesce((p_state->>'lapses')::integer, 0)
        - coalesce(v_state.leech_cleared_lapses, 0),
      0
    ) >= public.leech_lapses_threshold(),
    version          = v_new_version,
    updated_at       = now()
  where id = v_state.id;

  insert into public.review_log (
    user_id, card_id, reviewed_at, quality, grade, time_ms,
    client_review_id, client_reviewed_at, prior_snapshot, result_snapshot
  ) values (
    v_user_id, p_card_id, p_reviewed_at, null, p_grade, p_time_ms,
    p_review_id, p_reviewed_at,
    p_prior || jsonb_build_object(
      'version', v_state.version,
      'skill', p_skill,
      'leech', v_state.leech,
      'suspended', v_state.suspended
    ),
    p_state || jsonb_build_object('version', v_new_version, 'skill', p_skill)
  );

  insert into public.user_stats (user_id, date, cards_reviewed, cards_new)
  values (
    v_user_id,
    (p_reviewed_at at time zone 'utc')::date,
    1,
    case when coalesce(p_prior->>'state', 'new') = 'new' then 1 else 0 end
  )
  on conflict (user_id, date) do update set
    cards_reviewed = public.user_stats.cards_reviewed + 1,
    cards_new = public.user_stats.cards_new + excluded.cards_new,
    updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload, client_event_id)
  values (
    v_user_id,
    'review_rated',
    'word',
    v_word_id,
    p_skill,
    jsonb_build_object(
      'grade', p_grade,
      'card_id', p_card_id,
      'time_ms', p_time_ms,
      'phase_before', p_prior->>'state'
    ),
    p_review_id
  );

  if p_skill = 'recognition' then
    perform public.unlock_derived_skills();
  end if;

  outcome := 'applied';
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.apply_review(
  uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb, integer
) from public;
grant execute on function public.apply_review(
  uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb, integer
) to authenticated;

-- Función compartida de progreso de unidades: unifica la definición de completitud
-- tanto para unidades con vocabulario como puramente gramaticales (patterns).
create or replace function public.unit_progress(
  p_stability_days numeric default public.unit_completion_stability_days()
)
returns table(
  hsk_level integer,
  code text,
  title text,
  order_idx integer,
  grammar_id bigint,
  total_words integer,
  word_count integer,
  settled_words integer,
  pattern_count integer,
  total_items integer,
  settled_items integer,
  completed boolean
)
language sql
security definer
set search_path = public
as $$
  select
    u.hsk_level,
    u.code,
    u.title,
    u.order_idx,
    gp.id as grammar_id,
    count(uw.word_id)::integer as total_words,
    count(uw.word_id)::integer as word_count,
    count(*) filter (
      where uw.word_id is not null
        and (coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false))
    )::integer as settled_words,
    cardinality(u.patterns)::integer as pattern_count,
    (
      count(uw.word_id)::integer + case when cardinality(u.patterns) > 0 then 1 else 0 end
    )::integer as total_items,
    (
      count(*) filter (
        where uw.word_id is not null
          and (coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false))
      )::integer
      + case when cardinality(u.patterns) > 0 and exists (
          select 1
          from public.learner_skill_state gs
          where gs.user_id = auth.uid()
            and gs.target_kind = 'grammar'
            and gs.target_id = gp.id
            and gs.skill = 'recognition'
            and (coalesce(gs.stability, 0) >= p_stability_days or coalesce(gs.suspended, false))
        ) then 1 else 0 end
    )::integer as settled_items,
    (
      (count(uw.word_id)::integer + case when cardinality(u.patterns) > 0 then 1 else 0 end) > 0
      and
      (
        count(*) filter (
          where uw.word_id is not null
            and (coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false))
        )::integer
        + case when cardinality(u.patterns) > 0 and exists (
            select 1
            from public.learner_skill_state gs
            where gs.user_id = auth.uid()
              and gs.target_kind = 'grammar'
              and gs.target_id = gp.id
              and gs.skill = 'recognition'
              and (coalesce(gs.stability, 0) >= p_stability_days or coalesce(gs.suspended, false))
          ) then 1 else 0 end
      ) >= (count(uw.word_id)::integer + case when cardinality(u.patterns) > 0 then 1 else 0 end)
    ) as completed
  from public.unit u
  left join public.unit_word uw on uw.hsk_level = u.hsk_level and uw.code = u.code
  left join public.grammar_points gp on gp.hsk_level = u.hsk_level and gp.code = u.code
  left join public.learner_skill_state s
    on s.user_id = auth.uid()
   and s.target_kind = 'word'
   and s.target_id = uw.word_id
   and s.skill = 'recognition'
  where u.hsk_level <= (
    select coalesce(current_level, 1) from public.user_settings where user_id = auth.uid()
  )
  group by u.hsk_level, u.code, u.title, u.order_idx, gp.id, u.patterns;
$$;

revoke all on function public.unit_progress(numeric) from public;
grant execute on function public.unit_progress(numeric) to authenticated;

-- active_unit consume exactamente la misma lógica de progreso de unidad.
create or replace function public.active_unit(
  p_stability_days numeric default public.unit_completion_stability_days()
)
returns table(
  hsk_level integer,
  code text,
  title text,
  total_words integer,
  settled_words integer,
  word_count integer,
  pattern_count integer,
  grammar_id bigint,
  total_items integer,
  settled_items integer
)
language sql
security definer
set search_path = public
as $$
  with incomplete as (
    select * from public.unit_progress(p_stability_days)
    where not completed and total_items > 0
  )
  select i.hsk_level, i.code, i.title, i.total_words, i.settled_words,
    i.word_count, i.pattern_count, i.grammar_id, i.total_items, i.settled_items
  from incomplete i
  where not exists (
    select 1
    from public.grammar_prerequisite gp
    join incomplete req
      on req.hsk_level = gp.requires_level and req.code = gp.requires_code
    where gp.hsk_level = i.hsk_level and gp.code = i.code
  )
  order by case when i.total_words > 0 then 0 else 1 end,
    i.hsk_level, i.order_idx
  limit 1;
$$;

revoke all on function public.active_unit(numeric) from public;
grant execute on function public.active_unit(numeric) to authenticated;

-- Conteo exacto y sin tope artificial de la cola de errores pendientes.
create or replace function public.mistake_queue_count()
returns integer
language sql
security definer
set search_path = public
as $$
  with attempts as (
    select
      e.target_id,
      e.occurred_at,
      (e.payload->>'correct')::boolean as correct,
      max(case when (e.payload->>'correct')::boolean is false then e.occurred_at end)
        over (partition by e.target_id) as last_miss
    from public.learning_event e
    where e.user_id = auth.uid()
      and e.kind = 'exercise_attempted'
      and e.target_kind = 'word'
      and e.target_id is not null
      and jsonb_typeof(e.payload->'correct') = 'boolean'
  )
  select count(*)::integer
  from (
    select a.target_id
    from attempts a
    join public.words w on w.id = a.target_id
    where a.last_miss is not null
    group by a.target_id
    having count(*) filter (where a.correct and a.occurred_at > a.last_miss) < 2
        or count(distinct date(a.occurred_at)) filter (
             where a.correct and a.occurred_at > a.last_miss
           ) < 2
  ) sub;
$$;

revoke all on function public.mistake_queue_count() from public;
grant execute on function public.mistake_queue_count() to authenticated;

-- Devuelve el historial que la analítica necesita, sin calcular ninguna
-- métrica: el cálculo vive en packages/domain, probado con fixtures.
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
        -- Cuenta caracteres chinos reales (CJK), ignorando signos de puntuación
        'chars', coalesce((
          select sum(length(regexp_replace(s->>'zh', '[^\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]', '', 'g')))::integer
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
        'total', a.total
      ))
      from public.reading_attempts a
      where a.user_id = auth.uid()
        and a.created_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'mistakes_count', public.mistake_queue_count(),
    'syllabus_words_count', (
      select count(*)::integer
      from public.words w
      where w.hsk_level <= (
        select coalesce(us.current_level, 1)
        from public.user_settings us
        where us.user_id = auth.uid()
      )
    ),
    'syllabus_word_ids', coalesce((
      select jsonb_agg(w.id)
      from public.words w
      where w.hsk_level <= (
        select coalesce(us.current_level, 1)
        from public.user_settings us
        where us.user_id = auth.uid()
      )
    ), '[]'::jsonb),
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
