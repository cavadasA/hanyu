-- Plan 6 hardening: connect exercises to real vocabulary, make attempts
-- observable, and keep mock exams honest about coverage and time.

alter table public.generated_exercises
  add column if not exists target_word_id bigint references public.words(id) on delete set null;

create index if not exists idx_generated_exercises_target_word
  on public.generated_exercises(target_word_id);

drop function if exists public.build_exercise_session(text, integer);

create or replace function public.build_exercise_session(
  p_unit_code text default null,
  p_length integer default 8,
  p_target_word_ids bigint[] default null
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
  v_target_word_ids bigint[] := coalesce(array_remove(p_target_word_ids, null), '{}'::bigint[]);
  v_has_specific_exercises boolean := false;
  v_exercises jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if cardinality(v_target_word_ids) > 0 then
    select max(ge.hsk_level)
      into v_unit_level
    from public.generated_exercises ge
    where ge.target_word_id = any(v_target_word_ids);

    if v_unit_level is null then
      raise exception 'No exercises available for the requested mistakes';
    end if;

    v_unit_title := 'Cuaderno de errores';
  else
    select au.code, au.hsk_level
      into v_active_code, v_active_level
    from public.active_unit() au
    limit 1;

    if nullif(trim(coalesce(p_unit_code, '')), '') is null then
      v_unit_code := v_active_code;
      v_unit_level := v_active_level;
    else
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
  end if;

  if cardinality(v_target_word_ids) = 0 then
    select exists (
      select 1
      from public.generated_exercises ge
      where ge.hsk_level = v_unit_level
        and (
          ge.prompt->>'unit_code' = v_unit_code
          or exists (
            select 1
            from public.unit_word uw
            where uw.hsk_level = v_unit_level
              and uw.code = v_unit_code
              and uw.word_id = ge.target_word_id
          )
        )
    ) into v_has_specific_exercises;

    if not v_has_specific_exercises then
      v_unit_code := null;
      v_unit_title := 'Repaso HSK ' || v_unit_level;
    end if;
  end if;

  with candidates as (
    select distinct on (ge.prompt->>'slug')
      ge.id,
      ge.type,
      ge.hsk_level,
      ge.target_word_id,
      ge.prompt,
      ge.answer
    from public.generated_exercises ge
    where (
      (
        cardinality(v_target_word_ids) > 0
        and ge.target_word_id = any(v_target_word_ids)
      ) or (
        cardinality(v_target_word_ids) = 0
        and ge.hsk_level = v_unit_level
        and (
          (v_has_specific_exercises and (
            ge.prompt->>'unit_code' = v_unit_code
            or exists (
              select 1
              from public.unit_word uw
              where uw.hsk_level = v_unit_level
                and uw.code = v_unit_code
                and uw.word_id = ge.target_word_id
            )
          ))
          or (not v_has_specific_exercises)
        )
      )
    )
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
    'hsk_level', v_unit_level,
    'length', jsonb_array_length(v_exercises),
    'exercises', v_exercises
  );
end;
$$;

revoke all on function public.build_exercise_session(text, integer, bigint[]) from public;
grant execute on function public.build_exercise_session(text, integer, bigint[]) to authenticated;

drop function if exists public.mistake_queue(integer);

create or replace function public.mistake_queue(p_limit integer default 20)
returns table(
  target_id bigint,
  hanzi text,
  pinyin text,
  meaning_es text,
  meaning_en text,
  misses integer,
  hits_since integer,
  distinct_days integer
)
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
  select
    a.target_id,
    w.hanzi,
    w.pinyin,
    w.meaning_es,
    w.meaning_en,
    count(*) filter (where not a.correct)::integer as misses,
    count(*) filter (where a.correct and a.occurred_at > a.last_miss)::integer as hits_since,
    count(distinct date(a.occurred_at)) filter (
      where a.correct and a.occurred_at > a.last_miss
    )::integer as distinct_days
  from attempts a
  join public.words w on w.id = a.target_id
  where a.last_miss is not null
  group by a.target_id, w.hanzi, w.pinyin, w.meaning_es, w.meaning_en
  having count(*) filter (where a.correct and a.occurred_at > a.last_miss) < 2
      or count(distinct date(a.occurred_at)) filter (
           where a.correct and a.occurred_at > a.last_miss
         ) < 2
  order by max(a.last_miss) desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

revoke all on function public.mistake_queue(integer) from public;
grant execute on function public.mistake_queue(integer) to authenticated;

drop function if exists public.build_mock_exam(integer, text);

create or replace function public.build_mock_exam(
  p_level integer,
  p_scope text default 'section',
  p_section_code text default null
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
  v_part_ids uuid[];
  v_used_exercise_ids uuid[] := '{}'::uuid[];
  v_selected_section boolean := false;
  v_question_count integer;
  v_requested_section text := nullif(trim(coalesce(p_section_code, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_scope is null or p_scope not in ('section', 'full') then
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
    if p_scope = 'section' then
      if v_requested_section is not null and v_section->>'code' <> v_requested_section then
        continue;
      end if;
      if v_requested_section is null and v_selected_section then
        continue;
      end if;
    end if;

    v_selected_section := true;
    v_section_exercises := '[]'::jsonb;

    for v_part in select value from jsonb_array_elements(v_section->'parts')
    loop
      v_question_count := greatest(0, coalesce((v_part->>'question_count')::integer, 0));

      -- The current exercise bank has no audio-backed multiple choice. Do not
      -- present reading questions as if they measured listening.
      if v_section->>'code' = 'listening'
         or nullif(v_part->>'our_type', '') is null then
        v_unsupported := v_unsupported || jsonb_build_array(jsonb_build_object(
          'section', coalesce(v_section->>'title', v_section->>'code'),
          'part', v_part->>'code',
          'reason', 'no_matching_type'
        ));
        continue;
      end if;

      if v_part->>'our_type' not in ('fill_blank', 'matching', 'multiple_choice', 'reorder', 'dictation') then
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
        select ge.id, ge.type, ge.hsk_level, ge.target_word_id, ge.prompt, ge.answer
        from public.generated_exercises ge
        where ge.hsk_level = v_structure.hsk_level
          and ge.type = v_part->>'our_type'
          and ge.id <> all(v_used_exercise_ids)
        order by random()
        limit v_question_count
      ) candidate;

      v_section_exercises := v_section_exercises || v_part_exercises;

      select coalesce(array_agg((item->>'id')::uuid), '{}'::uuid[])
        into v_part_ids
      from jsonb_array_elements(v_part_exercises) item;
      v_used_exercise_ids := v_used_exercise_ids || v_part_ids;

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

  if p_scope = 'section' and not v_selected_section then
    raise exception 'No exam section available for code %', v_requested_section;
  end if;

  return jsonb_build_object(
    'hsk_level', v_structure.hsk_level,
    'scope', p_scope,
    'sections', v_sections,
    'unsupported', v_unsupported
  );
end;
$$;

revoke all on function public.build_mock_exam(integer, text, text) from public;
grant execute on function public.build_mock_exam(integer, text, text) to authenticated;
