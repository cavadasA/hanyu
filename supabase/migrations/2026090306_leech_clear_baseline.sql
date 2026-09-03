-- A leech can be forgiven without erasing FSRS history. The baseline records
-- the cumulative lapse count at the time of forgiveness; later reviews use
-- only the lapses above that baseline to derive the flag.
alter table public.learner_skill_state
  add column if not exists leech_cleared_lapses integer not null default 0
    check (leech_cleared_lapses >= 0);

-- Keep this threshold aligned with LEECH_LAPSES in
-- packages/domain/src/scheduling/schedule.ts. SQL is the server-side source
-- for the invariant applied by apply_review and revert_review.
create or replace function public.leech_lapses_threshold()
returns integer
language sql
immutable
as $$
  select 8;
$$;

create or replace function public.clear_leech(
  p_target_kind public.learning_target_kind,
  p_target_id bigint,
  p_skill public.learning_skill
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.learner_skill_state
  set leech = false,
      suspended = false,
      auto_suspended = false,
      leech_cleared_lapses = lapses,
      updated_at = now()
  where user_id = v_user_id
    and target_kind = p_target_kind
    and target_id = p_target_id
    and skill = p_skill;

  if not found then
    raise exception 'Skill state not found';
  end if;
end;
$$;

-- This marker intentionally does not increment version: offline reviews created
-- before the forgiveness must remain applicable and derive leech from this baseline.
revoke all on function public.clear_leech(public.learning_target_kind, bigint, public.learning_skill) from public;
grant execute on function public.clear_leech(public.learning_target_kind, bigint, public.learning_skill) to authenticated;

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
    jsonb_build_object('grade', p_grade, 'card_id', p_card_id, 'time_ms', p_time_ms),
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

create or replace function public.revert_review(p_review_id uuid)
returns table(outcome text, card_id uuid, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_log public.review_log;
  v_word_id bigint;
  v_skill public.learning_skill;
  v_state public.learner_skill_state;
  v_prior jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_log
  from public.review_log
  where client_review_id = p_review_id and user_id = v_user_id;

  if not found then
    outcome := 'not_found';
    card_id := null;
    version := null;
    return next;
    return;
  end if;

  card_id := v_log.card_id;

  select word_id into v_word_id
  from public.srs_cards
  where id = v_log.card_id and user_id = v_user_id;

  if not found then
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  if v_log.reverted_at is not null then
    select s.version into version
    from public.learner_skill_state s
    where s.user_id = v_user_id and s.target_kind = 'word'
      and s.target_id = v_word_id
      and s.skill = coalesce((v_log.result_snapshot->>'skill')::public.learning_skill, 'recognition');
    outcome := 'already_reverted';
    return next;
    return;
  end if;

  v_prior := v_log.prior_snapshot;
  v_result := v_log.result_snapshot;
  if v_prior is null or v_result is null
     or v_result->>'version' is null
     or v_prior->>'due' is null then
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  v_skill := coalesce((v_result->>'skill')::public.learning_skill, 'recognition');

  select * into v_state
  from public.learner_skill_state
  where user_id = v_user_id
    and target_kind = 'word'
    and target_id = v_word_id
    and skill = v_skill
  for update;

  if not found then
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  if v_state.version <> (v_result->>'version')::bigint then
    outcome := 'conflict';
    version := v_state.version;
    return next;
    return;
  end if;

  v_new_version := v_state.version + 1;

  update public.learner_skill_state set
    difficulty       = (v_prior->>'difficulty')::numeric,
    stability        = (v_prior->>'stability')::numeric,
    reps             = (v_prior->>'reps')::integer,
    lapses           = (v_prior->>'lapses')::integer,
    learning_steps   = (v_prior->>'learning_steps')::integer,
    scheduled_days   = (v_prior->>'scheduled_days')::integer,
    elapsed_days     = (v_prior->>'elapsed_days')::integer,
    fsrs_state       = v_prior->>'state',
    next_review_at   = (v_prior->>'due')::timestamptz,
    last_reviewed_at = nullif(v_prior->>'last_review', '')::timestamptz,
    leech            = greatest(
      coalesce((v_prior->>'lapses')::integer, 0)
        - coalesce(v_state.leech_cleared_lapses, 0),
      0
    ) >= public.leech_lapses_threshold(),
    version          = v_new_version,
    updated_at       = now()
  where id = v_state.id;

  update public.review_log set reverted_at = now() where id = v_log.id;

  update public.user_stats set
    cards_reviewed = greatest(0, cards_reviewed - 1),
    cards_new = greatest(0, cards_new - case when v_prior->>'state' = 'new' then 1 else 0 end),
    updated_at = now()
  where user_id = v_user_id
    and date = (v_log.reviewed_at at time zone 'utc')::date;

  select id into v_event_id
  from public.learning_event
  where user_id = v_user_id and client_event_id = p_review_id
  limit 1;

  insert into public.learning_event (
    user_id, kind, target_kind, target_id, skill, payload, reverts_event_id
  ) values (
    v_user_id,
    'review_reverted',
    'word',
    v_word_id,
    v_skill,
    jsonb_build_object('card_id', v_log.card_id, 'client_review_id', p_review_id),
    v_event_id
  );

  outcome := 'reverted';
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.revert_review(uuid) from public;
grant execute on function public.revert_review(uuid) to authenticated;
