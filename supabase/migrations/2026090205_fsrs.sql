-- Plan 4A: FSRS owns scheduling in learner_skill_state.
--
-- srs_cards remains the identity/membership row for a user's word. The
-- scheduling state is per skill, so it belongs in learner_skill_state. The
-- client is the only place that calculates FSRS; the RPCs below validate and
-- persist the state received from the offline queue.

alter table public.learner_skill_state
  add column if not exists fsrs_state text not null default 'new'
    check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  add column if not exists learning_steps integer not null default 0,
  add column if not exists scheduled_days integer not null default 0,
  add column if not exists elapsed_days integer not null default 0,
  add column if not exists leech boolean not null default false;

-- The values currently in difficulty/stability were produced by SM-2. They
-- have the same names but not the same meaning, so let FSRS initialise them on
-- the next review rather than silently mixing algorithms.
update public.learner_skill_state
set difficulty = null,
    stability = null,
    retrievability = null,
    fsrs_state = case
      when reps = 0 then 'new'
      when next_review_at is null then 'new'
      else 'review'
    end,
    leech = false
where difficulty is not null or stability is not null;

create index if not exists idx_skill_state_due_by_skill
  on public.learner_skill_state(user_id, skill, next_review_at)
  where not suspended;

alter table public.user_settings
  add column if not exists request_retention numeric not null default 0.9
    check (request_retention between 0.7 and 0.97);

-- quality is the historical SM-2 scale. New rows use grade (FSRS 1..4), so
-- quality must be nullable while old history remains intact.
alter table public.review_log
  alter column quality drop not null;

alter table public.review_log
  add column if not exists grade smallint check (grade between 1 and 4);

-- Keep the existing deck-management RPCs valid after the scheduling columns
-- leave srs_cards. Every membership operation creates the recognition state.
create or replace function public.add_deck_from_template(p_template_id uuid)
returns table(deck_id uuid, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tpl public.deck_templates;
  v_deck_id uuid;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_tpl from public.deck_templates where id = p_template_id;
  if not found then
    raise exception 'Template not found';
  end if;

  insert into public.decks (user_id, name, description, source_template_id)
  values (v_user_id, v_tpl.name, v_tpl.description, v_tpl.id)
  returning id into v_deck_id;

  with source_words as (
    select w.id as word_id
    from public.words w
    where v_tpl.hsk_level is not null and w.hsk_level = v_tpl.hsk_level
    union
    select tw.word_id
    from public.deck_template_words tw
    where tw.template_id = v_tpl.id
  ), membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, sw.word_id from source_words sw
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from membership;

  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  insert into public.learner_skill_state (user_id, target_kind, target_id, skill)
  select v_user_id, 'word', dc.word_id, 'recognition'
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, target_kind, target_id, skill) do nothing;

  deck_id := v_deck_id;
  inserted := v_inserted;
  return next;
end;
$$;

create or replace function public.create_starter_deck(
  strategy text default 'hsk2_consolidation',
  p_limit integer default null
)
returns table(inserted integer, total_deck_size integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, coalesce(p_limit, 150));
  v_inserted integer := 0;
  v_deck_id uuid;
  v_levels int[] := case when strategy = 'hsk1_review' then array[1] else array[1,2] end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.decks where user_id = v_user_id and is_default) then
    select id into v_deck_id from public.decks where user_id = v_user_id and is_default;
  else
    insert into public.decks (user_id, name, description, is_default)
    values (v_user_id, 'HSK2 consolidation', 'Your starter deck.', true)
    returning id into v_deck_id;
  end if;

  with candidates as (
    select w.id
    from public.words w
    where w.hsk_level = any(v_levels)
    order by w.hsk_level, coalesce(w.frequency, 2147483647), w.id
    limit v_limit
  ), inserted_cards as (
    insert into public.srs_cards (user_id, word_id)
    select v_user_id, c.id from candidates c
    on conflict (user_id, word_id) do nothing
    returning word_id
  ), membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, c.id from candidates c
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from inserted_cards;

  insert into public.learner_skill_state (user_id, target_kind, target_id, skill)
  select v_user_id, 'word', dc.word_id, 'recognition'
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, target_kind, target_id, skill) do nothing;

  inserted := v_inserted;
  select count(*) into total_deck_size from public.srs_cards where user_id = v_user_id;
  return next;
end;
$$;

create or replace function public.count_deck_cards(
  p_deck_id uuid default null,
  p_due_only boolean default false
)
returns table(deck_id uuid, count bigint)
language sql
security definer
set search_path = public
as $$
  select p_deck_id as deck_id, count(distinct dc.word_id) as count
  from public.deck_cards dc
  join public.decks d on d.id = dc.deck_id and d.user_id = auth.uid()
  where ((p_deck_id is null and d.is_active) or dc.deck_id = p_deck_id)
    and (not p_due_only or exists (
      select 1
      from public.learner_skill_state s
      where s.user_id = auth.uid()
        and s.target_kind = 'word'
        and s.target_id = dc.word_id
        and s.skill = 'recognition'
        and not s.suspended
        and (s.next_review_at is null or s.next_review_at <= now())
    ));
$$;

create or replace function public.get_deck_stats()
returns table(deck_id uuid, word_count bigint, due_count bigint)
language sql
security definer
set search_path = public
as $$
  select d.id as deck_id,
    (select count(*) from public.deck_cards dc where dc.deck_id = d.id) as word_count,
    (
      select count(*)
      from public.deck_cards dc
      join public.learner_skill_state s
        on s.user_id = d.user_id
       and s.target_kind = 'word'
       and s.target_id = dc.word_id
       and s.skill = 'recognition'
      where dc.deck_id = d.id
        and not s.suspended
        and (s.next_review_at is null or s.next_review_at <= now())
    ) as due_count
  from public.decks d
  where d.user_id = auth.uid();
$$;

drop function if exists public.get_due_cards(integer, uuid);

create or replace function public.get_due_cards(
  p_limit integer default 50,
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition'
)
returns table(
  card_id uuid,
  user_id uuid,
  word_id bigint,
  skill public.learning_skill,
  difficulty numeric,
  stability numeric,
  reps integer,
  lapses integer,
  learning_steps integer,
  scheduled_days integer,
  elapsed_days integer,
  fsrs_state text,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  version bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sc.id,
    sc.user_id,
    sc.word_id,
    s.skill,
    s.difficulty,
    s.stability,
    s.reps,
    s.lapses,
    s.learning_steps,
    s.scheduled_days,
    s.elapsed_days,
    s.fsrs_state,
    s.next_review_at,
    s.last_reviewed_at,
    s.version
  from public.learner_skill_state s
  join public.srs_cards sc
    on sc.user_id = s.user_id and sc.word_id = s.target_id
  where s.user_id = auth.uid()
    and s.target_kind = 'word'
    and s.skill = p_skill
    and not s.suspended
    and (s.next_review_at is null or s.next_review_at <= now())
    and exists (
      select 1
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where dc.word_id = sc.word_id
        and d.user_id = auth.uid()
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
  order by s.next_review_at asc nulls first
  limit greatest(1, coalesce(p_limit, 50));
$$;

grant execute on function public.add_deck_from_template(uuid) to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;
grant execute on function public.count_deck_cards(uuid, boolean) to authenticated;
grant execute on function public.get_deck_stats() to authenticated;
grant execute on function public.get_due_cards(integer, uuid, public.learning_skill) to authenticated;

-- The only scheduling writer. The client calculates the state with the domain
-- package; this RPC validates ownership/version/idempotency and stores it.
create or replace function public.apply_review(
  p_card_id uuid,
  p_review_id uuid,
  p_reviewed_at timestamptz,
  p_expected_version bigint,
  p_grade smallint,
  p_skill public.learning_skill,
  p_state jsonb,
  p_prior jsonb
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

  select word_id into v_word_id
  from public.srs_cards
  where id = p_card_id and user_id = v_user_id;

  if not found then
    raise exception 'Card not found';
  end if;

  -- Lock the skill row before the duplicate check. Concurrent reviews for the
  -- same card therefore serialize on one version, including the retry path.
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
    select version into version
    from public.learner_skill_state
    where id = v_state.id;
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
    retrievability   = null,
    reps             = (p_state->>'reps')::integer,
    lapses           = (p_state->>'lapses')::integer,
    learning_steps   = (p_state->>'learning_steps')::integer,
    scheduled_days   = (p_state->>'scheduled_days')::integer,
    elapsed_days     = (p_state->>'elapsed_days')::integer,
    fsrs_state       = p_state->>'state',
    next_review_at   = (p_state->>'due')::timestamptz,
    last_reviewed_at = p_reviewed_at,
    leech            = ((p_state->>'lapses')::integer >= 8),
    suspended        = ((p_state->>'lapses')::integer >= 8),
    version          = v_new_version,
    updated_at       = now()
  where id = v_state.id;

  insert into public.review_log (
    user_id, card_id, reviewed_at, quality, grade,
    client_review_id, client_reviewed_at, prior_snapshot, result_snapshot
  ) values (
    v_user_id, p_card_id, p_reviewed_at, null, p_grade,
    p_review_id, p_reviewed_at,
    p_prior || jsonb_build_object('version', v_state.version, 'skill', p_skill),
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
    jsonb_build_object('grade', p_grade, 'card_id', p_card_id),
    p_review_id
  );

  outcome := 'applied';
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.apply_review(uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb) from public;
grant execute on function public.apply_review(uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb) to authenticated;

-- Revert restores the stored prior snapshot. It does not know or reproduce
-- FSRS, so a future scheduler can change without changing undo semantics.
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
    retrievability   = null,
    reps             = (v_prior->>'reps')::integer,
    lapses           = (v_prior->>'lapses')::integer,
    learning_steps   = (v_prior->>'learning_steps')::integer,
    scheduled_days   = (v_prior->>'scheduled_days')::integer,
    elapsed_days     = (v_prior->>'elapsed_days')::integer,
    fsrs_state       = v_prior->>'state',
    next_review_at   = (v_prior->>'due')::timestamptz,
    last_reviewed_at = nullif(v_prior->>'last_review', '')::timestamptz,
    leech            = coalesce((v_prior->>'leech')::boolean, false),
    suspended        = coalesce((v_prior->>'suspended')::boolean, false),
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

-- The dashboard used to read scheduling columns from srs_cards. Repoint it
-- before those columns are removed so the function remains valid after this
-- migration.
create or replace function public.get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_cards_total integer := 0;
  v_cards_due integer := 0;
  v_cards_by_status jsonb := '{}'::jsonb;
  v_today_cards_reviewed integer := 0;
  v_today_cards_new integer := 0;
  v_today_exercises_done integer := 0;
  v_today_readings_done integer := 0;
  v_today_time_spent_ms integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*)::integer into v_cards_total
  from public.srs_cards where user_id = v_user_id;

  select count(*)::integer into v_cards_due
  from public.learner_skill_state
  where user_id = v_user_id and target_kind = 'word'
    and skill = 'recognition' and not suspended
    and (next_review_at is null or next_review_at <= now());

  select coalesce(jsonb_object_agg(phase, count_value), '{}'::jsonb)
  into v_cards_by_status
  from (
    select case
      when fsrs_state = 'new' then 'new'
      when fsrs_state in ('learning', 'relearning') then 'learning'
      when stability >= 180 then 'mastered'
      else 'review'
    end as phase, count(*)::integer as count_value
    from public.learner_skill_state
    where user_id = v_user_id and target_kind = 'word' and skill = 'recognition'
    group by 1
  ) grouped;

  select cards_reviewed, cards_new, exercises_done, readings_done, time_spent_ms
  into v_today_cards_reviewed, v_today_cards_new, v_today_exercises_done,
       v_today_readings_done, v_today_time_spent_ms
  from public.user_stats where user_id = v_user_id and date = v_today;

  return jsonb_build_object(
    'cards', jsonb_build_object('total', v_cards_total, 'due', v_cards_due, 'by_status', v_cards_by_status),
    'today', jsonb_build_object(
      'cards_reviewed', coalesce(v_today_cards_reviewed, 0),
      'cards_new', coalesce(v_today_cards_new, 0),
      'exercises_done', coalesce(v_today_exercises_done, 0),
      'readings_done', coalesce(v_today_readings_done, 0),
      'time_spent_ms', coalesce(v_today_time_spent_ms, 0)
    ),
    'heatmap', '[]'::jsonb,
    'streak', jsonb_build_object('current', 0, 'longest', 0),
    'learning_curve', '[]'::jsonb,
    'exercise_stats', jsonb_build_object('by_type', '{}'::jsonb, 'accuracy', null),
    'reading_stats', jsonb_build_object('total', 0, 'avg_score', null),
    'time', jsonb_build_object(
      'today_ms', coalesce(v_today_time_spent_ms, 0),
      'week_ms', 0,
      'all_time_ms', 0
    )
  );
end;
$$;

grant execute on function public.get_dashboard() to authenticated;

-- The old RPC signatures are no longer valid. Do not keep a second scheduler
-- behind a compatibility flag: the client/domain package is the only FSRS.
drop function if exists public.review_flashcard(uuid, integer, integer);
drop function if exists public.review_flashcard(uuid, integer, integer, uuid, timestamptz, bigint);

alter table public.srs_cards
  drop column if exists ease_factor,
  drop column if exists interval_days,
  drop column if exists repetitions,
  drop column if exists next_review_at,
  drop column if exists last_reviewed_at,
  drop column if exists status;
