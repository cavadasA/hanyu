-- supabase/migrations/2026090603_fix_ambiguous_user_id.sql
--
-- 1. Fixes "column reference user_id is ambiguous" in dashboard queue and unit functions.
-- When a PL/pgSQL function declares `returns table (..., user_id uuid, ...)`, PL/pgSQL
-- adds an output variable named `user_id`. Queries like `where user_id = v_user_id`
-- inside the body conflict with the output parameter name unless qualified.
-- We add `#variable_conflict use_column` and explicitly qualify table aliases.
--
-- 2. Fixes "permission denied for table reading_progress" and "permission denied for table decks".
-- Tables created in later migrations (reading_progress, decks, learner_skill_state, etc.)
-- had RLS policies enabled but lacked explicit table-level GRANTs to the `authenticated` role.

-- Permisos de tablas introducidas en migraciones posteriores
grant select, insert, update, delete on public.reading_progress to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.deck_cards to authenticated;
grant select on public.deck_templates, public.deck_template_words to authenticated;
grant select, insert, update on public.learner_skill_state to authenticated;
grant select, insert on public.learning_event to authenticated;
grant select, insert on public.word_context to authenticated;
grant select on public.unit, public.unit_word to authenticated;
grant select on public.grammar_prerequisite to authenticated;
grant select on public.content_item, public.content_teaches, public.exercise_template to authenticated;
grant select on public.exam_structure to authenticated;

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
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_settings public.user_settings;
  v_today date := (now() at time zone 'utc')::date;
  v_introduced integer;
  v_reviewed integer;
  v_new_allowance integer;
  v_review_allowance integer;
  v_session integer;
  v_new_session_cap integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings
  from public.user_settings us
  where us.user_id = v_user_id;

  if not found then
    raise exception 'Settings not found';
  end if;

  v_session := least(
    greatest(1, coalesce(p_limit, v_settings.session_size)),
    v_settings.session_size
  );

  select coalesce(ust.cards_new, 0), coalesce(ust.cards_reviewed, 0)
  into v_introduced, v_reviewed
  from public.user_stats ust
  where ust.user_id = v_user_id and ust.date = v_today;

  v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));
  v_review_allowance := greatest(0, v_settings.review_limit_per_day - coalesce(v_reviewed, 0));
  v_new_session_cap := greatest(0, floor(v_session / 2.0)::integer);

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
    limit least(v_new_allowance, v_new_session_cap)
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
      and s.target_id in (select scope.word_id from scope)
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

create or replace function public.build_review_queue_mode(
  p_mode text,
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
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_settings public.user_settings;
  v_today date := (now() at time zone 'utc')::date;
  v_introduced integer;
  v_new_allowance integer;
  v_session integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_mode not in ('learn', 'review', 'exam') then
    raise exception 'Unknown study mode: %', p_mode;
  end if;

  if p_mode = 'exam' then
    return query
    with scope as (
      select distinct dc.word_id
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where d.user_id = v_user_id
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
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
      and s.target_id in (select scope.word_id from scope)
    order by random()
    limit greatest(1, coalesce(p_limit, 20));
    return;
  end if;

  if p_mode = 'learn' then
    select * into v_settings
    from public.user_settings us
    where us.user_id = v_user_id;

    if not found then
      raise exception 'Settings not found';
    end if;

    v_session := least(
      greatest(1, coalesce(p_limit, v_settings.session_size)),
      v_settings.session_size
    );

    select coalesce(ust.cards_new, 0)
    into v_introduced
    from public.user_stats ust
    where ust.user_id = v_user_id and ust.date = v_today;

    v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));

    return query
    with active as (
      select a.hsk_level, a.code
      from public.active_unit() a
    ),
    scope as (
      select distinct uw.word_id
      from public.unit_word uw
      join active a on a.hsk_level = uw.hsk_level and a.code = uw.code
      join public.deck_cards dc on dc.word_id = uw.word_id
      join public.decks d on d.id = dc.deck_id
      where d.user_id = v_user_id
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
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
    limit least(v_new_allowance, v_session);
    return;
  end if;

  return query
  select q.*
  from public.build_review_queue(p_deck_id, p_skill, p_limit) q
  where not q.is_new;
end;
$$;

revoke all on function public.build_review_queue_mode(text, uuid, public.learning_skill, integer) from public;
grant execute on function public.build_review_queue_mode(text, uuid, public.learning_skill, integer) to authenticated;

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
    select coalesce(us.current_level, 1) from public.user_settings us where us.user_id = auth.uid()
  )
  group by u.hsk_level, u.code, u.title, u.order_idx, gp.id, u.patterns;
$$;

revoke all on function public.unit_progress(numeric) from public;
grant execute on function public.unit_progress(numeric) to authenticated;
