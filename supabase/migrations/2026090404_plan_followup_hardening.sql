-- Follow-up for databases that already applied 2026090403.
-- Keep the completion threshold and active-unit ordering identical on upgrades.

create or replace function public.unit_completion_stability_days()
returns numeric
language sql
immutable
as $$
  select 21::numeric;
$$;

create or replace function public.mark_grammar_studied(p_grammar_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion_stability_days integer := public.unit_completion_stability_days()::integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.grammar_points where id = p_grammar_id) then
    raise exception 'Grammar point not found';
  end if;

  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, difficulty, stability, reps,
    learning_steps, scheduled_days, elapsed_days, fsrs_state, suspended
  ) values (
    auth.uid(), 'grammar', p_grammar_id, 'recognition', null,
    v_completion_stability_days, 1, 0, v_completion_stability_days, 0,
    'review', false
  )
  on conflict (user_id, target_kind, target_id, skill) do update
    set stability = greatest(
          coalesce(learner_skill_state.stability, 0),
          v_completion_stability_days
        ),
        fsrs_state = 'review',
        suspended = false,
        updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload)
  values (
    auth.uid(), 'grammar_studied', 'grammar', p_grammar_id, 'recognition', '{}'::jsonb
  );
end;
$$;

revoke all on function public.mark_grammar_studied(bigint) from public;
grant execute on function public.mark_grammar_studied(bigint) to authenticated;

drop function if exists public.active_unit(numeric);

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
  with progress as (
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
      )::integer as settled_items
    from public.unit u
    left join public.unit_word uw on uw.hsk_level = u.hsk_level and uw.code = u.code
    left join public.grammar_points gp on gp.hsk_level = u.hsk_level and gp.code = u.code
    left join public.learner_skill_state s
      on s.user_id = auth.uid()
     and s.target_kind = 'word'
     and s.target_id = uw.word_id
     and s.skill = 'recognition'
    where u.hsk_level <= (
      select current_level from public.user_settings where user_id = auth.uid()
    )
    group by u.hsk_level, u.code, u.title, u.order_idx, gp.id, u.patterns
  ),
  incomplete as (
    select * from progress
    where total_items > 0 and settled_items < total_items
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
