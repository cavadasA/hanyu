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

-- Devuelve el historial que la analítica necesita, sin calcular ninguna
-- métrica: el cálculo vive en packages/domain, probado con fixtures. Duplicarlo
-- aquí sería la tercera vez que este proyecto mantiene dos implementaciones de
-- la misma fórmula, y las dos anteriores costaron un plan entero cada una.
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
        'grade', e.payload->>'grade',
        'skill', e.skill,
        'phase_before', e.payload->>'phase_before'
      ))
      from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'review_rated'
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
        'pinyin_shown', p.pinyin_shown
      ))
      from public.reading_progress p
      where p.user_id = auth.uid()
        and p.finished_at is not null
        and p.started_at is not null
    ), '[]'::jsonb),
    'skill_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', s.target_id,
        'skill', s.skill,
        'stability', s.stability,
        'suspended', s.suspended,
        'last_reviewed_at', s.last_reviewed_at
      ))
      from public.learner_skill_state s
      where s.user_id = auth.uid() and s.target_kind = 'word'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.learning_report(integer) from public;
grant execute on function public.learning_report(integer) to authenticated;
