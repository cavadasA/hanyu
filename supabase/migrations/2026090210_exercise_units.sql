-- Plan 6: build a practice session from the learner's active curriculum unit.
-- The client owns the pedagogical ordering; this RPC owns scope and deduplication.

create or replace function public.build_exercise_session(
  p_unit_code text default null,
  p_length integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_code text;
  v_active_level integer;
  v_unit_code text;
  v_unit_level integer;
  v_unit_title text;
  v_length integer := least(20, greatest(1, coalesce(p_length, 8)));
  v_exercises jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select au.code, au.hsk_level
    into v_active_code, v_active_level
  from public.active_unit() au
  limit 1;

  if nullif(trim(coalesce(p_unit_code, '')), '') is null then
    v_unit_code := v_active_code;
    v_unit_level := v_active_level;
  else
    -- Unit codes are curriculum-local and may recur at several levels. Prefer
    -- the active level, then fall back to the highest unlocked matching row.
    select u.code, u.hsk_level
      into v_unit_code, v_unit_level
    from public.unit u
    where u.code = trim(p_unit_code)
      and (v_active_level is null or u.hsk_level <= v_active_level)
    order by (u.hsk_level = v_active_level) desc, u.hsk_level desc, u.order_idx
    limit 1;
  end if;

  if v_unit_code is null or v_unit_level is null then
    raise exception 'No active unit available';
  end if;

  select u.title
    into v_unit_title
  from public.unit u
  where u.code = v_unit_code
    and u.hsk_level = v_unit_level;

  with candidates as (
    select distinct on (ge.prompt->>'slug')
      ge.id,
      ge.type,
      ge.hsk_level,
      ge.prompt,
      ge.answer
    from public.generated_exercises ge
    where ge.hsk_level = v_unit_level
      and ge.prompt->>'unit_code' = v_unit_code
      and nullif(ge.prompt->>'slug', '') is not null
    order by ge.prompt->>'slug', random()
  ), limited as (
    select *
    from candidates
    order by random()
    limit v_length
  )
  select coalesce(jsonb_agg(to_jsonb(limited)), '[]'::jsonb)
    into v_exercises
  from limited;

  return jsonb_build_object(
    'unit_code', v_unit_code,
    'unit_title', coalesce(v_unit_title, v_unit_code),
    'length', jsonb_array_length(v_exercises),
    'exercises', v_exercises
  );
end;
$$;

revoke all on function public.build_exercise_session(text, integer) from public;
grant execute on function public.build_exercise_session(text, integer) to authenticated;
