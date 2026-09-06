-- Comprueba que Learn no se queda sin palabras nuevas mientras la unidad activa
-- madura hasta los 21 días de estabilidad.
--
-- Cubre:
--   1. con palabras nuevas en la unidad de cabeza, Learn las sirve primero;
--   2. agotada la unidad de cabeza, `active_unit()` sigue siendo esa unidad
--      pero Learn toma las palabras nuevas de la siguiente;
--   3. la frontera es por habilidad: lo introducido en reconocimiento sigue
--      siendo nuevo en recuerdo;
--   4. Review sigue sin devolver tarjetas nuevas.
--
-- Ejecutar sobre una base Supabase ya migrada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/learn_new_word_frontier.sql

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  'f0000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
  'learn-frontier-test@example.com', now(), now()
);

update public.user_settings
set current_level = 1,
    new_cards_per_day = 10,
    review_limit_per_day = 200,
    session_size = 20
where user_id = 'f0000000-0000-0000-0000-000000000011';

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level, frequency)
values
  (99711, '甲', 'jiǎ', 'frontier head unit', 1, 1),
  (99712, '乙', 'yǐ', 'frontier next unit', 1, 2);

-- order_idx negativo: estas unidades deben ordenarse antes que el temario real
-- para que las aserciones no dependan del corpus sembrado.
insert into public.unit (hsk_level, code, title, patterns, order_idx)
values
  (1, 'test.frontier.head', 'Head unit', '{}', -20),
  (1, 'test.frontier.next', 'Next unit', '{}', -19);

insert into public.unit_word (hsk_level, code, word_id)
values
  (1, 'test.frontier.head', 99711),
  (1, 'test.frontier.next', 99712);

insert into public.decks (id, user_id, name, is_active)
values (
  'f1000000-0000-0000-0000-000000000011',
  'f0000000-0000-0000-0000-000000000011',
  'Learn frontier test',
  true
);

insert into public.deck_cards (deck_id, word_id)
values
  ('f1000000-0000-0000-0000-000000000011', 99711),
  ('f1000000-0000-0000-0000-000000000011', 99712);

insert into public.srs_cards (id, user_id, word_id)
values
  ('f2000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011', 99711),
  ('f2000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000011', 99712);

set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000011';

do $$
declare
  v_unit record;
  v_first_word bigint;
  v_count integer;
  v_words bigint[];
begin
  -- 1. La unidad de cabeza es la primera del temario elegible y Learn sirve su
  --    palabra antes que la de la siguiente unidad.
  select * into v_unit from public.active_unit();
  if v_unit.code is distinct from 'test.frontier.head' then
    raise exception 'unidad activa inicial: esperaba test.frontier.head, obtuve %', v_unit.code;
  end if;

  select array_agg(word_id order by word_id) into v_words
  from public.build_review_queue_mode('learn', null, 'recognition', 20);
  if v_words is distinct from array[99711, 99712]::bigint[] then
    raise exception 'Learn inicial: esperaba {99711,99712}, obtuve %', v_words;
  end if;

  -- 2. Se introduce la palabra de la unidad de cabeza. La unidad NO se completa
  --    —le faltan semanas para los 21 días de estabilidad— pero ya no tiene
  --    ninguna palabra nueva que ofrecer.
  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, fsrs_state, stability, next_review_at
  )
  values (auth.uid(), 'word', 99711, 'recognition', 'learning', 1, now() + interval '10 minutes')
  on conflict (user_id, target_kind, target_id, skill) do update
    set fsrs_state = excluded.fsrs_state,
        stability = excluded.stability,
        next_review_at = excluded.next_review_at;

  select * into v_unit from public.active_unit();
  if v_unit.code is distinct from 'test.frontier.head' then
    raise exception 'la unidad activa no debía avanzar aún, obtuve %', v_unit.code;
  end if;

  select count(*), min(word_id) into v_count, v_first_word
  from public.build_review_queue_mode('learn', null, 'recognition', 20);
  if v_count <> 1 or v_first_word <> 99712 then
    raise exception 'Learn bloqueado tras agotar la unidad de cabeza: count=%, word=%',
      v_count, v_first_word;
  end if;

  -- 3. La frontera se calcula por habilidad: en recuerdo las dos siguen nuevas.
  select count(*) into v_count
  from public.build_review_queue_mode('learn', null, 'recall', 20);
  if v_count <> 2 then
    raise exception 'Learn en recuerdo: esperaba 2 palabras nuevas, obtuve %', v_count;
  end if;

  -- 4. Review nunca devuelve nuevas, ni siquiera con la frontera avanzada.
  select count(*) into v_count
  from public.build_review_queue_mode('review', null, 'recognition', 20);
  if v_count <> 0 then
    raise exception 'Review devolvió % tarjetas cuando ninguna está vencida', v_count;
  end if;
end $$;

rollback;
