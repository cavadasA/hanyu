-- Simulacro HSK 2 con formato 3.0 (Plan 12): formas fijas de examen, corregidas en servidor.
--
-- exam_form guarda cada forma tal como la construye scripts/build-exam.js: el contenido
-- (con las respuestas), la línea de tiempo de 听力 y los medios. Llega vía seed.sql
-- desde server/db/seeds/exam-forms.json. Nadie la lee directamente: el cliente pide la
-- forma con get_exam_form, que quita las respuestas, y la entrega con submit_exam_attempt,
-- que corrige con las respuestas guardadas. Así el cliente nunca recibe una clave `answer`.

create table if not exists public.exam_form (
  level int not null,
  code text not null,
  content jsonb not null,
  timeline jsonb not null,
  media jsonb not null,
  created_at timestamptz not null default now(),
  primary key (level, code)
);

alter table public.exam_form enable row level security;
-- Sin políticas para authenticated: la tabla contiene las respuestas.
revoke all on public.exam_form from anon, authenticated;
grant select, insert, update, delete on public.exam_form to service_role;

create table if not exists public.exam_attempt (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level int not null,
  form_code text not null,
  -- 'part': una parte suelta (part_code = 'R2'…); 'section': una sección
  -- (part_code = 'listening' | 'reading' | 'writing'); 'full': el examen entero.
  scope text not null check (scope in ('part', 'section', 'full')),
  part_code text null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  answers jsonb not null,
  section_scores jsonb not null,
  part_scores jsonb not null,
  total_percent int not null check (total_percent between 0 and 100),
  repeated boolean not null default false,
  foreign key (level, form_code) references public.exam_form (level, code),
  check (
    (scope = 'full' and part_code is null)
    or (scope = 'part' and part_code in ('L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'R4', 'W1', 'W2'))
    or (scope = 'section' and part_code in ('listening', 'reading', 'writing'))
  )
);

create index if not exists exam_attempt_user_level_idx on public.exam_attempt (user_id, level, finished_at);

alter table public.exam_attempt enable row level security;

drop policy if exists exam_attempt_select_own on public.exam_attempt;
create policy exam_attempt_select_own on public.exam_attempt
  for select to authenticated
  using (user_id = auth.uid());

-- Los intentos solo se crean con submit_exam_attempt, que corrige en servidor.
revoke all on public.exam_attempt from anon, authenticated;
grant select on public.exam_attempt to authenticated;
grant select, insert, update, delete on public.exam_attempt to service_role;

-- Quita las respuestas de una forma: `answer` de cada pregunta desaparece y la del
-- ejemplo, que en el examen se muestra resuelto, pasa a `shown_answer`.
create or replace function public.exam_strip_answers(p_content jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_groups jsonb := '[]'::jsonb;
  v_group jsonb;
  v_items jsonb;
begin
  for v_group in select value from jsonb_array_elements(coalesce(p_content -> 'groups', '[]'::jsonb)) loop
    select coalesce(jsonb_agg(item - 'answer'::text order by position), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(v_group -> 'items', '[]'::jsonb)) with ordinality as entry(item, position);
    v_group := jsonb_set(v_group, '{items}', v_items);
    if v_group ? 'example' then
      v_group := jsonb_set(
        v_group,
        '{example}',
        ((v_group -> 'example') - 'answer'::text) || jsonb_build_object('shown_answer', v_group -> 'example' -> 'answer')
      );
    end if;
    v_groups := v_groups || jsonb_build_array(v_group);
  end loop;
  return jsonb_set(p_content, '{groups}', v_groups);
end;
$$;

-- La forma pedida o, sin p_form, la primera que el usuario no ha completado
-- (A, luego B, luego C); si las ha hecho todas, la que hizo hace más tiempo.
-- `repeated` dice si el usuario ya completó esa forma: el resultado no cuenta
-- como estimación de nivel.
create or replace function public.get_exam_form(p_level int, p_form text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_form public.exam_form;
begin
  if v_user is null then
    raise exception 'get_exam_form requiere usuario' using errcode = '42501';
  end if;

  if p_form is not null then
    select * into v_form from public.exam_form where level = p_level and code = p_form;
  else
    select f.* into v_form
      from public.exam_form f
      left join lateral (
        select max(a.finished_at) as last_full
          from public.exam_attempt a
         where a.user_id = v_user and a.level = f.level and a.form_code = f.code and a.scope = 'full'
      ) done on true
     where f.level = p_level
     order by done.last_full is not null, done.last_full, f.code
     limit 1;
  end if;

  if v_form.code is null then
    return null;
  end if;

  return jsonb_build_object(
    'level', v_form.level,
    'code', v_form.code,
    'content', public.exam_strip_answers(v_form.content),
    'timeline', v_form.timeline,
    'media', v_form.media,
    'repeated', exists (
      select 1 from public.exam_attempt a
       where a.user_id = v_user and a.level = v_form.level and a.form_code = v_form.code and a.scope = 'full'
    )
  );
end;
$$;

-- Corrige un intento con las respuestas de exam_form y lo guarda.
-- p_attempt: { level, form_code, scope, part_code?, started_at,
--              answers: { "<slug del grupo>": [respuesta de la pregunta 0, 1…] } }
-- Cada respuesta es el índice de la opción (o el carácter escrito en 书写 2); null si
-- no se respondió. Toda pregunta del alcance cuenta en el total, respondida o no.
create or replace function public.submit_exam_attempt(p_attempt jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_level int := (p_attempt ->> 'level')::int;
  v_code text := p_attempt ->> 'form_code';
  v_scope text := p_attempt ->> 'scope';
  v_part_code text := nullif(p_attempt ->> 'part_code', '');
  v_answers jsonb := coalesce(p_attempt -> 'answers', '{}'::jsonb);
  v_content jsonb;
  v_group jsonb;
  v_item jsonb;
  v_index int;
  v_part text;
  v_section text;
  v_given jsonb;
  v_right boolean;
  v_parts jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_correct int := 0;
  v_total int := 0;
  v_repeated boolean := false;
  v_row public.exam_attempt;
begin
  if v_user is null then
    raise exception 'submit_exam_attempt requiere usuario' using errcode = '42501';
  end if;

  select content into v_content from public.exam_form where level = v_level and code = v_code;
  if v_content is null then
    raise exception 'No existe la forma % del nivel %', v_code, v_level using errcode = '22023';
  end if;

  for v_group in select value from jsonb_array_elements(v_content -> 'groups') loop
    v_part := v_group ->> 'part';
    v_section := case left(v_part, 1) when 'L' then 'listening' when 'R' then 'reading' else 'writing' end;
    continue when v_scope = 'part' and v_part <> v_part_code;
    continue when v_scope = 'section' and v_section <> v_part_code;

    v_index := 0;
    for v_item in select value from jsonb_array_elements(v_group -> 'items') loop
      v_given := v_answers -> (v_group ->> 'slug') -> v_index;
      v_right := v_given is not null and jsonb_typeof(v_given) <> 'null' and (
        case when v_part = 'W2'
          then v_given #>> '{}' = v_item ->> 'answer'
          else jsonb_typeof(v_given) = 'number' and (v_given #>> '{}')::numeric = (v_item ->> 'answer')::numeric
        end
      );

      v_parts := jsonb_set(v_parts, array[v_part], jsonb_build_object(
        'correct', coalesce((v_parts -> v_part ->> 'correct')::int, 0) + (case when v_right then 1 else 0 end),
        'total', coalesce((v_parts -> v_part ->> 'total')::int, 0) + 1
      ));
      v_sections := jsonb_set(v_sections, array[v_section], jsonb_build_object(
        'correct', coalesce((v_sections -> v_section ->> 'correct')::int, 0) + (case when v_right then 1 else 0 end),
        'total', coalesce((v_sections -> v_section ->> 'total')::int, 0) + 1
      ));
      v_correct := v_correct + (case when v_right then 1 else 0 end);
      v_total := v_total + 1;
      v_index := v_index + 1;
    end loop;
  end loop;

  if v_total = 0 then
    raise exception 'El intento no cubre ninguna pregunta (% %)', v_scope, v_part_code using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(key, value || jsonb_build_object(
           'percent', round(100.0 * (value ->> 'correct')::int / (value ->> 'total')::int)::int)), '{}'::jsonb)
    into v_parts from jsonb_each(v_parts);
  select coalesce(jsonb_object_agg(key, value || jsonb_build_object(
           'percent', round(100.0 * (value ->> 'correct')::int / (value ->> 'total')::int)::int)), '{}'::jsonb)
    into v_sections from jsonb_each(v_sections);

  if v_scope = 'full' then
    v_repeated := exists (
      select 1 from public.exam_attempt a
       where a.user_id = v_user and a.level = v_level and a.form_code = v_code and a.scope = 'full'
    );
  end if;

  insert into public.exam_attempt (
    user_id, level, form_code, scope, part_code, started_at, answers,
    section_scores, part_scores, total_percent, repeated
  ) values (
    v_user, v_level, v_code, v_scope, v_part_code,
    coalesce((p_attempt ->> 'started_at')::timestamptz, now()), v_answers,
    v_sections, v_parts, round(100.0 * v_correct / v_total)::int, v_repeated
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.exam_strip_answers(jsonb) from public;
revoke all on function public.get_exam_form(int, text) from public;
revoke all on function public.submit_exam_attempt(jsonb) from public;
grant execute on function public.get_exam_form(int, text) to authenticated;
grant execute on function public.submit_exam_attempt(jsonb) to authenticated;
