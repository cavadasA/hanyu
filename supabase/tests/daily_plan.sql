-- Comprueba el comportamiento de la ruta diaria contra PostgreSQL.
--
-- Cubre:
--   1. un prerrequisito bloquea una unidad que, por orden, iría antes;
--   2. mark_grammar_studied persiste un estado coherente;
--   3. Learn queda limitado a la unidad activa;
--   4. Review devuelve solo tarjetas vencidas y no nuevas.
--
-- Ejecutar sobre una base Supabase ya migrada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/daily_plan.sql

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'daily-plan-test@example.com', now(), now()
);

update public.user_settings
set current_level = 1,
    new_cards_per_day = 10,
    review_limit_per_day = 200,
    session_size = 20
where user_id = 'f0000000-0000-0000-0000-000000000001';

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level, frequency)
values
  (99701, '测', 'cè', 'daily plan prerequisite', 1, 1),
  (99702, '试', 'shì', 'daily plan active unit', 1, 2);

insert into public.grammar_points (
  id, hsk_level, code, title, explanation, items, examples, order_idx
)
values
  (99701, 1, 'test.graph.a', 'Prerequisite A', 'Test prerequisite.', array[]::text[], '[]'::jsonb, -1),
  (99702, 1, 'test.graph.b', 'Blocked B', 'Test dependent unit.', array[]::text[], '[]'::jsonb, -2);

insert into public.grammar_prerequisite (hsk_level, code, requires_level, requires_code)
values (1, 'test.graph.b', 1, 'test.graph.a');

insert into public.unit (hsk_level, code, title, patterns, order_idx)
values
  (1, 'test.graph.a', 'Prerequisite A', '{}', -1),
  (1, 'test.graph.b', 'Blocked B', '{}', -2);

insert into public.unit_word (hsk_level, code, word_id)
values
  (1, 'test.graph.a', 99701),
  (1, 'test.graph.b', 99702);

insert into public.decks (id, user_id, name, is_active)
values (
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'Daily plan test',
  true
);

insert into public.deck_cards (deck_id, word_id)
values
  ('f1000000-0000-0000-0000-000000000001', 99701),
  ('f1000000-0000-0000-0000-000000000001', 99702);

insert into public.srs_cards (id, user_id, word_id)
values
  ('f2000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 99701),
  ('f2000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 99702);

insert into public.learner_skill_state (
  user_id, target_kind, target_id, skill, stability, fsrs_state, next_review_at
)
values
  ('f0000000-0000-0000-0000-000000000001', 'word', 99701, 'recognition', null, 'new', null),
  ('f0000000-0000-0000-0000-000000000001', 'word', 99702, 'recognition', null, 'new', null)
on conflict (user_id, target_kind, target_id, skill) do update
  set stability = excluded.stability,
      fsrs_state = excluded.fsrs_state,
      next_review_at = excluded.next_review_at;

set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000001';

do $$
declare
  v_unit record;
  v_grammar_state public.learner_skill_state;
  v_learn_count integer;
  v_review_count integer;
  v_word_id bigint;
begin
  select * into v_unit from public.active_unit();
  if v_unit.code <> 'test.graph.a' then
    raise exception 'prerrequisito bloquea: esperaba test.graph.a, obtuve %', v_unit.code;
  end if;

  perform public.mark_grammar_studied(99701);

  select * into v_grammar_state
  from public.learner_skill_state
  where user_id = auth.uid()
    and target_kind = 'grammar'
    and target_id = 99701
    and skill = 'recognition';

  if v_grammar_state.fsrs_state <> 'review'
     or v_grammar_state.stability <> public.unit_completion_stability_days()
     or v_grammar_state.difficulty is not null then
    raise exception 'mark_grammar_studied no dejó el estado esperado';
  end if;

  update public.learner_skill_state
  set stability = public.unit_completion_stability_days(),
      fsrs_state = 'review',
      next_review_at = now() + interval '1 day'
  where user_id = auth.uid()
    and target_kind = 'word'
    and target_id = 99701
    and skill = 'recognition';

  select * into v_unit from public.active_unit();
  if v_unit.code <> 'test.graph.b' then
    raise exception 'la unidad dependiente no se desbloqueó: obtuve %', v_unit.code;
  end if;

  select count(*), min(word_id)
  into v_learn_count, v_word_id
  from public.build_review_queue_mode(
    'learn', null, 'recognition', 20
  );
  if v_learn_count <> 1 or v_word_id <> 99702 then
    raise exception 'Learn no quedó limitado a la unidad activa: count=%, word_id=%',
      v_learn_count, v_word_id;
  end if;

  update public.learner_skill_state
  set stability = public.unit_completion_stability_days(),
      fsrs_state = 'review',
      next_review_at = now() - interval '1 minute'
  where user_id = auth.uid()
    and target_kind = 'word'
    and target_id = 99702
    and skill = 'recognition';

  select count(*) into v_review_count
  from public.build_review_queue_mode(
    'review', null, 'recognition', 20
  );
  if v_review_count <> 1 then
    raise exception 'Review debía devolver una tarjeta vencida, devolvió %', v_review_count;
  end if;
end $$;

rollback;
