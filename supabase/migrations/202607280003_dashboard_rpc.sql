-- Hanyu dashboard and time logging RPC functions

create or replace function public.log_study_time(p_ms integer)
returns table(time_spent_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_ms is null or p_ms < 0 then
    raise exception 'ms must be non-negative';
  end if;

  insert into public.user_stats (user_id, date, time_spent_ms)
  values (v_user_id, v_today, p_ms)
  on conflict (user_id, date)
  do update set
    time_spent_ms = public.user_stats.time_spent_ms + excluded.time_spent_ms,
    updated_at = now();

  return query
  select us.time_spent_ms
  from public.user_stats us
  where us.user_id = v_user_id and us.date = v_today;
end;
$$;

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
  v_learning_curve jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*)::integer
  into v_cards_total
  from public.srs_cards
  where user_id = v_user_id;

  select count(*)::integer
  into v_cards_due
  from public.srs_cards
  where user_id = v_user_id and next_review_at <= now();

  select coalesce(jsonb_object_agg(status, count_value), '{}'::jsonb)
  into v_cards_by_status
  from (
    select status, count(*)::integer as count_value
    from public.srs_cards
    where user_id = v_user_id
    group by status
  ) grouped;

  select
    cards_reviewed,
    cards_new,
    exercises_done,
    readings_done,
    time_spent_ms
  into
    v_today_cards_reviewed,
    v_today_cards_new,
    v_today_exercises_done,
    v_today_readings_done,
    v_today_time_spent_ms
  from public.user_stats
  where user_id = v_user_id and date = v_today;

  if not found then
    v_today_cards_reviewed := 0;
    v_today_cards_new := 0;
    v_today_exercises_done := 0;
    v_today_readings_done := 0;
    v_today_time_spent_ms := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', day.date::text,
        'activity', day.cards_reviewed + day.exercises_done + day.readings_done
      )
      order by day.date
    ),
    '[]'::jsonb
  )
  into v_heatmap
  from (
    select date, cards_reviewed, exercises_done, readings_done
    from public.user_stats
    where user_id = v_user_id and date >= (v_today - 90)
    order by date
  ) day;

  select coalesce(sum(time_spent_ms), 0)::integer
  into v_week_ms
  from public.user_stats
  where user_id = v_user_id and date >= (v_today - 7);

  select coalesce(sum(time_spent_ms), 0)::integer
  into v_all_time_ms
  from public.user_stats
  where user_id = v_user_id;

  select coalesce(jsonb_object_agg(type, count_value), '{}'::jsonb)
  into v_exercise_by_type
  from (
    select type, count(*)::integer as count_value
    from public.generated_exercises
    group by type
  ) grouped;

  select count(*)::integer
  into v_reading_total
  from public.generated_readings;

  select array_agg(stats.date order by stats.date desc)
  into v_active_dates
  from (
    select date
    from public.user_stats
    where user_id = v_user_id
      and (cards_reviewed > 0 or exercises_done > 0 or readings_done > 0)
    order by date desc
    limit 365
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
    'cards', jsonb_build_object(
      'total', v_cards_total,
      'due', v_cards_due,
      'by_status', v_cards_by_status
    ),
    'today', jsonb_build_object(
      'cards_reviewed', v_today_cards_reviewed,
      'cards_new', v_today_cards_new,
      'exercises_done', v_today_exercises_done,
      'readings_done', v_today_readings_done,
      'time_spent_ms', v_today_time_spent_ms
    ),
    'heatmap', v_heatmap,
    'streak', jsonb_build_object(
      'current', v_current_streak,
      'longest', v_longest_streak
    ),
    'learning_curve', v_learning_curve,
    'exercise_stats', jsonb_build_object(
      'by_type', v_exercise_by_type,
      'accuracy', null
    ),
    'reading_stats', jsonb_build_object(
      'total', v_reading_total,
      'avg_score', null
    ),
    'time', jsonb_build_object(
      'today_ms', v_today_time_spent_ms,
      'week_ms', v_week_ms,
      'all_time_ms', v_all_time_ms
    )
  );
end;
$$;

grant execute on function public.log_study_time(integer) to authenticated;
grant execute on function public.get_dashboard() to authenticated;
