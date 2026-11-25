-- Contratos del simulacro del Plan 12: get_exam_form nunca entrega respuestas y
-- submit_exam_attempt corrige en servidor, con las no respondidas en el total.
--
-- Ejecutar sobre una base Supabase ya migrada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/exam_forms.sql

create extension if not exists pgtap;

begin;

select plan(15);

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('f0000000-0000-0000-0000-000000000121', 'authenticated', 'authenticated', 'exam-a@example.com', now(), now()),
  ('f0000000-0000-0000-0000-000000000122', 'authenticated', 'authenticated', 'exam-b@example.com', now(), now());

-- Dos formas de prueba con una parte de imágenes (con ejemplo), una A/B/C y 书写 2.
insert into public.exam_form (level, code, content, timeline, media)
select 99, code, jsonb_build_object('code', code, 'level', 99, 'groups', jsonb_build_array(
  jsonb_build_object('slug', lower(code) || '-r1', 'part', 'R1', 'images', '["a","b","c","d","e","f"]'::jsonb,
    'example', jsonb_build_object('stimulus', jsonb_build_object('zh', '我看书。', 'pinyin', 'wǒ kàn shū.'), 'answer', 0),
    'items', jsonb_build_array(
      jsonb_build_object('text', jsonb_build_object('zh', '她喝水。', 'pinyin', 'tā hē shuǐ.'), 'answer', 2),
      jsonb_build_object('text', jsonb_build_object('zh', '他吃饭。', 'pinyin', 'tā chī fàn.'), 'answer', 4))),
  jsonb_build_object('slug', lower(code) || '-r4', 'part', 'R4', 'items', jsonb_build_array(
      jsonb_build_object('passage', jsonb_build_object('zh', '我在家。', 'pinyin', 'wǒ zài jiā.'),
        'question', jsonb_build_object('zh', '★ 他在：', 'pinyin', 'tā zài:'),
        'options', '[{"zh":"家","pinyin":"jiā"},{"zh":"学校","pinyin":"xuéxiào"},{"zh":"商店","pinyin":"shāngdiàn"}]'::jsonb,
        'answer', 0))),
  jsonb_build_object('slug', lower(code) || '-w2', 'part', 'W2', 'items', jsonb_build_array(
      jsonb_build_object('sentence', jsonb_build_object('zh', '我是（ ）生。', 'pinyin', 'wǒ shì xuéshēng.'), 'answer', '学')))
)), '[]'::jsonb, '{}'::jsonb
from (values ('A'), ('B')) as forms(code);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000121';

select ok(
  not jsonb_path_exists(public.get_exam_form(99, null), '$.**.answer'),
  'get_exam_form no entrega ninguna clave answer'
);

select is(
  public.get_exam_form(99, null) #>> '{content,groups,0,example,shown_answer}',
  '0',
  'el ejemplo se entrega resuelto como shown_answer, como en el examen'
);

select is(public.get_exam_form(99, null) ->> 'code', 'A', 'sin intentos, la primera forma es la A');

select throws_ok(
  $$ select * from public.exam_form $$,
  '42501',
  null,
  'authenticated no puede leer exam_form directamente'
);

-- R1: una bien y una sin responder; R4 mal; W2 bien.
select is(
  (public.submit_exam_attempt(jsonb_build_object(
    'level', 99, 'form_code', 'A', 'scope', 'full', 'started_at', now(),
    'answers', jsonb_build_object('a-r1', jsonb_build_array(2, null), 'a-r4', jsonb_build_array(1), 'a-w2', jsonb_build_array('学'))
  )) ->> 'total_percent')::int,
  50,
  'submit_exam_attempt corrige en servidor: 2 de 4, con la no respondida en el total'
);

select is(
  (select part_scores -> 'R1' from public.exam_attempt where form_code = 'A' and level = 99),
  '{"correct": 1, "total": 2, "percent": 50}'::jsonb,
  'aciertos por parte: R1 1 de 2'
);

select is(
  (select section_scores -> 'writing' from public.exam_attempt where form_code = 'A' and level = 99),
  '{"correct": 1, "total": 1, "percent": 100}'::jsonb,
  '书写 2 compara el carácter escrito con el esperado'
);

select is(
  (select repeated from public.exam_attempt where form_code = 'A' and level = 99),
  false,
  'el primer intento completo de una forma no es repetido'
);

select is(public.get_exam_form(99, null) ->> 'code', 'B', 'hecha la A, la siguiente forma es la B');
select is(public.get_exam_form(99, 'A') ->> 'repeated', 'true', 'pedir la A ya hecha la marca como repetida');

select is(
  (public.submit_exam_attempt(jsonb_build_object(
    'level', 99, 'form_code', 'A', 'scope', 'full', 'started_at', now(), 'answers', '{}'::jsonb
  )) ->> 'repeated')::boolean,
  true,
  'repetir la forma A deja el intento marcado como repetido'
);

select is(
  (public.submit_exam_attempt(jsonb_build_object(
    'level', 99, 'form_code', 'B', 'scope', 'part', 'part_code', 'W2', 'started_at', now(),
    'answers', jsonb_build_object('b-w2', jsonb_build_array('好'))
  )) ->> 'total_percent')::int,
  0,
  'un carácter válido pero distinto del esperado es un fallo, y una parte suelta solo cuenta sus preguntas'
);

select is(public.get_exam_form(99, null) ->> 'code', 'B', 'practicar una parte suelta no cuenta como forma hecha');

select throws_ok(
  $$ insert into public.exam_attempt (level, form_code, scope, started_at, answers, section_scores, part_scores, total_percent)
     values (99, 'B', 'full', now(), '{}', '{}', '{}', 100) $$,
  '42501',
  null,
  'nadie se pone nota insertando un intento: solo submit_exam_attempt los crea'
);

set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000122';

select is(
  (select count(*)::int from public.exam_attempt),
  0,
  'un usuario no ve los intentos de otro'
);

select * from finish();

rollback;
