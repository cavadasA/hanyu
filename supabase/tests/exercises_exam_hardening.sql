-- Contratos de las tres RPC de ejercicios del Plan 6.
--
-- Ejecutar sobre una base Supabase ya migrada y sembrada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/exercises_exam_hardening.sql

create extension if not exists pgtap;

begin;

select plan(10);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  'f0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated',
  'exercises-hardening-test@example.com', now(), now()
);

insert into public.unit (hsk_level, code, title, patterns, order_idx)
values (2, 'test.empty.exercise.unit', 'Unidad sin banco', '{}', -100)
on conflict (hsk_level, code) do nothing;

set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000006';

select ok(
  jsonb_array_length((public.build_exercise_session('test.empty.exercise.unit', 4)->'exercises')) > 0,
  'build_exercise_session ofrece repaso de nivel si la unidad aún no tiene ejercicios'
);

select ok(
  (public.build_exercise_session('test.empty.exercise.unit', 4)->>'unit_code') is null,
  'el repaso de reserva no se presenta como contenido específico de la unidad'
);

select ok(
  jsonb_array_length((public.build_exercise_session(
    null,
    1,
    array[(select min(target_word_id) from public.generated_exercises where target_word_id is not null)]
  )->'exercises')) = 1,
  'build_exercise_session acepta target_word_ids para practicar errores'
);

select ok(
  (select count(*) from public.generated_exercises where target_word_id is not null) = 90,
  'los ejercicios sembrados tienen una palabra objetivo'
);

select is(
  (public.build_mock_exam(2, 'section', 'reading')->'sections'->0->>'code'),
  'reading',
  'build_mock_exam permite seleccionar lectura'
);

select is(
  jsonb_array_length((public.build_mock_exam(2, 'section', 'listening')->'sections'->0->'exercises')),
  0,
  'listening no se rellena con preguntas de lectura'
);

select ok(
  jsonb_array_length((public.build_mock_exam(2, 'section', 'listening')->'unsupported')) = 4,
  'las cuatro partes de listening quedan declaradas como no simulables'
);

select ok(
  (
    select count(*) = count(distinct (item->>'id'))
    from jsonb_array_elements(
      jsonb_path_query_array(public.build_mock_exam(2, 'full'), '$.sections[*].exercises[*]')
    ) item
  ),
  'build_mock_exam no repite ejercicios entre partes del simulacro'
);

insert into public.learning_event (
  user_id, occurred_at, kind, target_kind, target_id, skill, payload
)
select
  auth.uid(), now() - interval '3 days', 'exercise_attempted', 'word', ge.target_word_id,
  'recall', jsonb_build_object('correct', false)
from public.generated_exercises ge
where ge.target_word_id is not null
order by ge.id
limit 1;

insert into public.learning_event (
  user_id, occurred_at, kind, target_kind, target_id, skill, payload
)
select
  auth.uid(), now() - interval '1 hour', 'exercise_attempted', 'word', ge.target_word_id,
  'recall', jsonb_build_object('mode', 'legacy', 'grade', 3)
from public.generated_exercises ge
where ge.target_word_id is not null
order by ge.id
limit 1;

select ok(
  (select count(*) from public.mistake_queue(20)) = 1,
  'mistake_queue ignora eventos sin payload.correct y conserva el fallo real'
);

select ok(
  (select count(*) from public.mistake_queue(20) mq join public.words w on w.id = mq.target_id) = 1,
  'mistake_queue devuelve la ficha de palabra para practicar el error'
);

select * from finish();

rollback;
