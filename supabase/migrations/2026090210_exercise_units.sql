-- Plan 6: build a practice session from the learner's active curriculum unit.
-- The client owns the pedagogical ordering; this RPC owns scope and deduplication.

create table if not exists public.exam_structure (
  hsk_level integer primary key check (hsk_level between 1 and 6),
  source text not null,
  source_note text,
  total_minutes integer not null,
  answer_sheet_minutes integer not null default 0,
  sections jsonb not null default '[]'::jsonb
);

alter table public.exam_structure enable row level security;

drop policy if exists exam_structure_select_authenticated on public.exam_structure;
create policy exam_structure_select_authenticated on public.exam_structure
for select using (auth.role() = 'authenticated');

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

-- Un error que no vuelve no enseña nada. La cola se calcula del log de eventos
-- en vez de guardarse aparte: así no hay dos verdades que mantener de acuerdo.
create or replace function public.mistake_queue(p_limit integer default 20)
returns table(target_id bigint, misses integer, hits_since integer, distinct_days integer)
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
  )
  select
    a.target_id,
    count(*) filter (where not a.correct)::integer as misses,
    count(*) filter (where a.correct and a.occurred_at > a.last_miss)::integer as hits_since,
    count(distinct date(a.occurred_at)) filter (
      where a.correct and a.occurred_at > a.last_miss
    )::integer as distinct_days
  from attempts a
  where a.last_miss is not null
  group by a.target_id
  having count(*) filter (where a.correct and a.occurred_at > a.last_miss) < 2
      or count(distinct date(a.occurred_at)) filter (
           where a.correct and a.occurred_at > a.last_miss
         ) < 2
  order by max(a.last_miss) desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

revoke all on function public.mistake_queue(integer) from public;
grant execute on function public.mistake_queue(integer) to authenticated;

create or replace function public.build_mock_exam(
  p_level integer,
  p_scope text default 'section'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_structure record;
  v_section jsonb;
  v_part jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_unsupported jsonb := '[]'::jsonb;
  v_section_exercises jsonb;
  v_part_exercises jsonb;
  v_selected_section boolean := false;
  v_question_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_scope not in ('section', 'full') then
    raise exception 'p_scope must be section or full';
  end if;

  select es.hsk_level, es.sections
    into v_structure
  from public.exam_structure es
  where es.hsk_level = p_level;

  if not found then
    raise exception 'No exam structure available for HSK %', p_level;
  end if;

  for v_section in select value from jsonb_array_elements(v_structure.sections)
  loop
    -- A section-scoped mock picks the first official section. The full scope
    -- includes every section in the transcribed structure.
    if p_scope = 'section' and v_selected_section then
      continue;
    end if;
    v_selected_section := true;
    v_section_exercises := '[]'::jsonb;

    for v_part in select value from jsonb_array_elements(v_section->'parts')
    loop
      v_question_count := greatest(0, coalesce((v_part->>'question_count')::integer, 0));

      if nullif(v_part->>'our_type', '') is null then
        v_unsupported := v_unsupported || jsonb_build_array(jsonb_build_object(
          'section', coalesce(v_section->>'title', v_section->>'code'),
          'part', v_part->>'code',
          'reason', 'no_matching_type'
        ));
        continue;
      end if;

      select coalesce(jsonb_agg(to_jsonb(candidate)), '[]'::jsonb)
        into v_part_exercises
      from (
        select ge.id, ge.type, ge.hsk_level, ge.prompt, ge.answer
        from public.generated_exercises ge
        where ge.hsk_level = v_structure.hsk_level
          and ge.type = v_part->>'our_type'
        order by random()
        limit v_question_count
      ) candidate;

      v_section_exercises := v_section_exercises || v_part_exercises;

      if jsonb_array_length(v_part_exercises) < v_question_count then
        v_unsupported := v_unsupported || jsonb_build_array(jsonb_build_object(
          'section', coalesce(v_section->>'title', v_section->>'code'),
          'part', v_part->>'code',
          'reason', 'insufficient_exercises'
        ));
      end if;
    end loop;

    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'code', v_section->>'code',
      'title', v_section->>'title',
      'minutes', (v_section->>'minutes')::integer,
      'exercises', v_section_exercises
    ));
  end loop;

  return jsonb_build_object(
    'hsk_level', v_structure.hsk_level,
    'scope', p_scope,
    'sections', v_sections,
    'unsupported', v_unsupported
  );
end;
$$;

revoke all on function public.build_mock_exam(integer, text) from public;
grant execute on function public.build_mock_exam(integer, text) to authenticated;
