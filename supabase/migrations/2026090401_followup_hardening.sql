-- Follow-up hardening for the queue, counters, reading catalog, and legacy RPCs.
-- This migration is deliberately after every 20260903xx migration so a clean
-- reset and an already deployed database converge on the same API surface.

begin;

alter table public.reading
  add column if not exists target_words text[] not null default '{}'::text[],
  add column if not exists target_grammar text[] not null default '{}'::text[];

-- Backfill existing catalog rows when this migration is applied after a seed;
-- the generated seed repeats the same idempotent operation after inserting
-- the target metadata.
insert into public.content_teaches (content_id, target_kind, target_id, role)
select distinct ci.id, 'word'::public.learning_target_kind, w.id, 'target'::public.teaches_role
from public.reading r
join public.content_item ci on ci.source_table = 'reading' and ci.source_id = r.slug
cross join lateral unnest(coalesce(r.target_words, '{}'::text[])) target(hanzi)
join lateral (
  select w.id
  from public.words w
  where w.hanzi = target.hanzi and w.hsk_level <= r.hsk_level
  order by w.hsk_level desc, coalesce(w.sense_index, 0), w.id
  limit 1
) w on true
on conflict (content_id, target_kind, target_id) do update set role = excluded.role;

insert into public.content_teaches (content_id, target_kind, target_id, role)
select distinct ci.id, 'grammar'::public.learning_target_kind, g.id, 'target'::public.teaches_role
from public.reading r
join public.content_item ci on ci.source_table = 'reading' and ci.source_id = r.slug
cross join lateral unnest(coalesce(r.target_grammar, '{}'::text[])) target(code)
join public.grammar_points g
  on g.code = target.code
 and g.hsk_level = case when target.code = '2.6.1' then 1 else r.hsk_level end
on conflict (content_id, target_kind, target_id) do update set role = excluded.role;

-- A new card has no due date by design. Only a scheduled, non-new state is due.
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
        and s.fsrs_state <> 'new'
        and s.next_review_at is not null
        and s.next_review_at <= now()
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
        and s.fsrs_state <> 'new'
        and s.next_review_at is not null
        and s.next_review_at <= now()
    ) as due_count
  from public.decks d
  where d.user_id = auth.uid();
$$;

-- Reserve the introduction allowance first. Otherwise a full review backlog
-- can consume the entire session forever and new cards never enter the queue.
create or replace function public.build_review_queue(
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition',
  p_limit integer default null
)
returns table(
  card_id uuid,
  user_id uuid,
  word_id bigint,
  skill public.learning_skill,
  is_new boolean,
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.user_settings;
  v_today date := (now() at time zone 'utc')::date;
  v_introduced integer;
  v_reviewed integer;
  v_new_allowance integer;
  v_review_allowance integer;
  v_session integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings from public.user_settings where user_id = v_user_id;
  if not found then
    raise exception 'Settings not found';
  end if;

  v_session := least(
    greatest(1, coalesce(p_limit, v_settings.session_size)),
    v_settings.session_size
  );

  select coalesce(cards_new, 0), coalesce(cards_reviewed, 0)
  into v_introduced, v_reviewed
  from public.user_stats
  where user_id = v_user_id and date = v_today;

  v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));
  v_review_allowance := greatest(0, v_settings.review_limit_per_day - coalesce(v_reviewed, 0));

  return query
  with scope as (
    select distinct dc.word_id
    from public.deck_cards dc
    join public.decks d on d.id = dc.deck_id
    where d.user_id = v_user_id
      and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
  ),
  new_cards as (
    select
      sc.id as card_id, sc.user_id, w.id as word_id, p_skill as skill, true as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, coalesce(s.fsrs_state, 'new') as fsrs_state,
      s.next_review_at, s.last_reviewed_at, coalesce(s.version, 0) as version
    from public.words w
    join scope on scope.word_id = w.id
    join public.srs_cards sc on sc.user_id = v_user_id and sc.word_id = w.id
    left join public.learner_skill_state s
      on s.user_id = v_user_id and s.target_kind = 'word'
     and s.target_id = w.id and s.skill = p_skill
    where coalesce(s.fsrs_state, 'new') = 'new'
      and coalesce(s.suspended, false) = false
    order by
      case when w.hsk_level = v_settings.current_level then 0 else 1 end,
      w.hsk_level,
      coalesce(w.frequency, 2147483647),
      w.id
    limit least(v_session, v_new_allowance)
  ),
  due_reviews as (
    select
      sc.id as card_id, sc.user_id, s.target_id as word_id, s.skill, false as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, s.fsrs_state,
      s.next_review_at, s.last_reviewed_at, s.version
    from public.learner_skill_state s
    join public.srs_cards sc on sc.user_id = s.user_id and sc.word_id = s.target_id
    where s.user_id = v_user_id
      and s.target_kind = 'word'
      and s.skill = p_skill
      and not s.suspended
      and s.fsrs_state <> 'new'
      and s.next_review_at is not null
      and s.next_review_at <= now()
      and s.target_id in (select word_id from scope)
    order by s.next_review_at asc
    limit least(v_review_allowance, greatest(0, v_session - (select count(*) from new_cards)))
  )
  select * from due_reviews
  union all
  select * from new_cards;
end;
$$;

revoke all on function public.build_review_queue(uuid, public.learning_skill, integer) from public;
grant execute on function public.build_review_queue(uuid, public.learning_skill, integer) to authenticated;

-- Dashboard counters must use the same due predicate as count_deck_cards.
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
  v_heatmap jsonb := '[]'::jsonb;
  v_exercise_by_type jsonb := '{}'::jsonb;
  v_reading_total integer := 0;
  v_week_ms integer := 0;
  v_all_time_ms integer := 0;
  v_active_dates date[];
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_run integer := 1;
  v_count integer := 0;
  i integer;
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
    and fsrs_state <> 'new'
    and next_review_at is not null
    and next_review_at <= now();

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', day.date::text,
        'activity', day.cards_reviewed + day.exercises_done + day.readings_done
      ) order by day.date
    ), '[]'::jsonb
  ) into v_heatmap
  from (
    select date, cards_reviewed, exercises_done, readings_done
    from public.user_stats
    where user_id = v_user_id and date >= (v_today - 90)
    order by date
  ) day;

  select coalesce(sum(time_spent_ms), 0)::integer into v_week_ms
  from public.user_stats where user_id = v_user_id and date >= (v_today - 7);

  select coalesce(sum(time_spent_ms), 0)::integer into v_all_time_ms
  from public.user_stats where user_id = v_user_id;

  select coalesce(jsonb_object_agg(type, count_value), '{}'::jsonb)
  into v_exercise_by_type
  from (
    select type, count(*)::integer as count_value
    from public.generated_exercises group by type
  ) grouped;

  select count(*)::integer into v_reading_total from public.reading;

  select array_agg(stats.date order by stats.date desc) into v_active_dates
  from (
    select date from public.user_stats
    where user_id = v_user_id
      and (cards_reviewed > 0 or exercises_done > 0 or readings_done > 0)
    order by date desc limit 365
  ) stats;

  v_count := coalesce(array_length(v_active_dates, 1), 0);
  if v_count > 0 then
    v_longest_streak := 1;
    if v_active_dates[1] = v_today or v_active_dates[1] = v_today - 1 then
      v_current_streak := 1;
      if v_count > 1 then
        for i in 2..v_count loop
          if v_active_dates[i - 1] - v_active_dates[i] = 1 then
            v_current_streak := v_current_streak + 1;
          else
            exit;
          end if;
        end loop;
      end if;
    end if;
    if v_count > 1 then
      for i in 2..v_count loop
        if v_active_dates[i - 1] - v_active_dates[i] = 1 then
          v_run := v_run + 1;
          v_longest_streak := greatest(v_longest_streak, v_run);
        else
          v_run := 1;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'cards', jsonb_build_object('total', v_cards_total, 'due', v_cards_due, 'by_status', v_cards_by_status),
    'today', jsonb_build_object(
      'cards_reviewed', coalesce(v_today_cards_reviewed, 0),
      'cards_new', coalesce(v_today_cards_new, 0),
      'exercises_done', coalesce(v_today_exercises_done, 0),
      'readings_done', coalesce(v_today_readings_done, 0),
      'time_spent_ms', coalesce(v_today_time_spent_ms, 0)
    ),
    'heatmap', v_heatmap,
    'streak', jsonb_build_object('current', v_current_streak, 'longest', v_longest_streak),
    'learning_curve', '[]'::jsonb,
    'exercise_stats', jsonb_build_object('by_type', v_exercise_by_type, 'accuracy', null),
    'reading_stats', jsonb_build_object('total', v_reading_total, 'avg_score', null),
    'time', jsonb_build_object(
      'today_ms', coalesce(v_today_time_spent_ms, 0),
      'week_ms', v_week_ms,
      'all_time_ms', v_all_time_ms
    )
  );
end;
$$;

grant execute on function public.get_dashboard() to authenticated;

-- The starter-deck API was revived by 0302 after 0207 removed it. Keep the
-- public surface unambiguous on both clean and already upgraded databases.
drop function if exists public.create_starter_deck(text, integer);

-- There are no production callers for this compatibility scheduler anymore.
drop function if exists public.get_due_cards(integer, uuid, public.learning_skill);
drop function if exists public.get_due_cards(integer, uuid);

commit;
