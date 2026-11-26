-- Ejercicios decía «Unidad activa: Repaso HSK 1» mientras Hoy decía 方位名词: cuando
-- la unidad activa no tiene ejercicios propios, build_exercise_session servía un
-- repaso general del nivel y lo titulaba como si fuera otra unidad. Ahora conserva
-- el título de la unidad y devuelve review_fallback = true para que la app diga
-- que es un repaso general mientras la unidad no tenga ejercicios.

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
  v_review_fallback boolean := false;
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

    -- Sin ejercicios propios, repaso general del nivel. Conserva el título de la
    -- unidad (antes decía «Repaso HSK N», que no casaba con la unidad de Hoy) y
    -- lo marca para que la app lo explique.
    if not v_has_specific_exercises then
      v_unit_code := null;
      v_review_fallback := true;
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
    'unit_title', coalesce(v_unit_title, v_unit_code, 'Repaso HSK ' || v_unit_level),
    'review_fallback', v_review_fallback,
    'hsk_level', v_unit_level,
    'length', jsonb_array_length(v_exercises),
    'exercises', v_exercises
  );
end;
$$;

revoke all on function public.build_exercise_session(text, integer, bigint[]) from public;
grant execute on function public.build_exercise_session(text, integer, bigint[]) to authenticated;
