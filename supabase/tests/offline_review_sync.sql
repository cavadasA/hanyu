-- offline_review_sync.sql
-- Contrato de apply_review para eventos FSRS enviados desde la cola offline.
-- Todo va dentro de una transacción que se deshace al final.
--
-- Cubre:
--   1. aplicación con expected_version correcto;
--   2. reintento idempotente por client_review_id;
--   3. conflicto por expected_version obsoleto;
--   4. validación de grade, pertenencia de tarjeta y expected_version nulo.

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'offline-test-1@example.com', now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'offline-test-2@example.com', now(), now());

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level)
values (99901, '测', 'cè', 'offline-review-test', 1);

insert into public.srs_cards (id, user_id, word_id)
values
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 99901),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002', 99901);

insert into public.learner_skill_state (
  user_id, target_kind, target_id, skill, next_review_at, fsrs_state,
  reps, lapses, learning_steps, scheduled_days, elapsed_days, suspended, leech
)
values (
  'a0000000-0000-0000-0000-000000000001', 'word', 99901, 'recognition',
  '2026-09-03 00:00:00+00', 'new', 0, 0, 0, 0, 0, false, false
);

set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000001';

-- ── Caso 1: expected_version correcto → applied ──
do $$
declare
  v_outcome text;
  v_version bigint;
  v_log_count bigint;
  v_prior jsonb := jsonb_build_object(
    'difficulty', null::numeric, 'stability', null::numeric,
    'retrievability', null::numeric, 'reps', 0, 'lapses', 0,
    'learning_steps', 0, 'scheduled_days', 0, 'elapsed_days', 0,
    'state', 'new', 'due', '2026-09-03T00:00:00+00:00',
    'last_review', null::text, 'leech', false, 'suspended', false
  );
  v_result jsonb := jsonb_build_object(
    'difficulty', 5.1, 'stability', 1.4, 'retrievability', null::numeric,
    'reps', 1, 'lapses', 0, 'learning_steps', 1, 'scheduled_days', 1,
    'elapsed_days', 0, 'state', 'learning', 'due', '2026-09-04T00:00:00+00:00'
  );
begin
  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    '2026-09-03 10:00:00+00', 0, 4, 'recognition', v_result, v_prior
  );

  if v_outcome <> 'applied' or v_version <> 1 then
    raise exception 'caso 1: esperaba applied/version=1, obtuve outcome=%, version=%',
      v_outcome, v_version;
  end if;

  if (select fsrs_state from public.learner_skill_state
      where user_id = 'a0000000-0000-0000-0000-000000000001'
        and target_kind = 'word' and target_id = 99901 and skill = 'recognition')
     <> 'learning' then
    raise exception 'caso 1: no persistió el estado FSRS resultante';
  end if;

  select count(*) into v_log_count
  from public.review_log
  where user_id = 'a0000000-0000-0000-0000-000000000001'
    and client_review_id = 'c0000000-0000-0000-0000-000000000001';
  if v_log_count <> 1 then
    raise exception 'caso 1: esperaba un review_log, obtuve %', v_log_count;
  end if;
end $$;

-- ── Caso 2: mismo client_review_id → duplicate sin segundo efecto ──
do $$
declare
  v_outcome text;
  v_version bigint;
  v_log_count bigint;
  v_stats_reviewed integer;
  v_prior jsonb := jsonb_build_object(
    'difficulty', null::numeric, 'stability', null::numeric,
    'reps', 0, 'lapses', 0, 'learning_steps', 0, 'scheduled_days', 0,
    'elapsed_days', 0, 'state', 'new', 'due', '2026-09-03T00:00:00+00:00'
  );
  v_result jsonb := jsonb_build_object(
    'difficulty', 5.1, 'stability', 1.4, 'reps', 1, 'lapses', 0,
    'learning_steps', 1, 'scheduled_days', 1, 'elapsed_days', 0,
    'state', 'learning', 'due', '2026-09-04T00:00:00+00:00'
  );
begin
  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    '2026-09-03 10:00:00+00', 1, 4, 'recognition', v_result, v_prior
  );

  if v_outcome <> 'duplicate' or v_version <> 1 then
    raise exception 'caso 2: esperaba duplicate/version=1, obtuve outcome=%, version=%',
      v_outcome, v_version;
  end if;

  select count(*) into v_log_count
  from public.review_log
  where user_id = 'a0000000-0000-0000-0000-000000000001';
  if v_log_count <> 1 then
    raise exception 'caso 2: esperaba un solo review_log, obtuve %', v_log_count;
  end if;

  select coalesce(sum(cards_reviewed), 0)::integer into v_stats_reviewed
  from public.user_stats
  where user_id = 'a0000000-0000-0000-0000-000000000001';
  if v_stats_reviewed <> 1 then
    raise exception 'caso 2: esperaba una sola review en estadísticas, obtuve %',
      v_stats_reviewed;
  end if;
end $$;

-- ── Caso 3: expected_version obsoleto → conflict sin mutación ──
do $$
declare
  v_outcome text;
  v_version bigint;
  v_log_count bigint;
  v_state_version bigint;
  v_prior jsonb := jsonb_build_object(
    'difficulty', null::numeric, 'stability', null::numeric,
    'reps', 0, 'lapses', 0, 'learning_steps', 0, 'scheduled_days', 0,
    'elapsed_days', 0, 'state', 'new', 'due', '2026-09-03T00:00:00+00:00'
  );
  v_result jsonb := jsonb_build_object(
    'difficulty', 4.8, 'stability', 2.0, 'reps', 1, 'lapses', 0,
    'learning_steps', 1, 'scheduled_days', 1, 'elapsed_days', 0,
    'state', 'learning', 'due', '2026-09-05T00:00:00+00:00'
  );
begin
  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    '2026-09-03 11:00:00+00', 0, 4, 'recognition', v_result, v_prior
  );

  if v_outcome <> 'conflict' or v_version <> 1 then
    raise exception 'caso 3: esperaba conflict/version=1, obtuve outcome=%, version=%',
      v_outcome, v_version;
  end if;

  select version into v_state_version
  from public.learner_skill_state
  where user_id = 'a0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99901 and skill = 'recognition';
  if v_state_version <> 1 then
    raise exception 'caso 3: el conflicto mutó la versión del estado';
  end if;

  select count(*) into v_log_count
  from public.review_log
  where user_id = 'a0000000-0000-0000-0000-000000000001';
  if v_log_count <> 1 then
    raise exception 'caso 3: el conflicto insertó un review_log';
  end if;
end $$;

-- ── Caso 4a: grade inválido → excepción de validación ──
do $$
declare
  v_prior jsonb := jsonb_build_object('due', '2026-09-03T00:00:00+00', 'state', 'new');
  v_result jsonb := jsonb_build_object('due', '2026-09-04T00:00:00+00', 'state', 'learning');
begin
  begin
    perform public.apply_review(
      'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000099',
      '2026-09-03 12:00:00+00', 1, 6, 'recognition', v_result, v_prior
    );
    raise exception 'caso 4a: no se rechazó grade=6';
  exception when others then
    if sqlerrm like 'caso 4a:%' then raise; end if;
    if sqlerrm not like '%grade must be between%' then
      raise exception 'caso 4a: error incorrecto: %', sqlerrm;
    end if;
  end;
end $$;

-- ── Caso 4b: tarjeta de otro usuario → Card not found ──
do $$
declare
  v_prior jsonb := jsonb_build_object('due', '2026-09-03T00:00:00+00', 'state', 'new');
  v_result jsonb := jsonb_build_object('due', '2026-09-04T00:00:00+00', 'state', 'learning');
begin
  begin
    perform public.apply_review(
      'b0000000-0000-0000-0000-000000000002',
      'c0000000-0000-0000-0000-000000000098',
      '2026-09-03 12:00:00+00', 0, 4, 'recognition', v_result, v_prior
    );
    raise exception 'caso 4b: se pudo valorar una tarjeta ajena';
  exception when others then
    if sqlerrm like 'caso 4b:%' then raise; end if;
    if sqlerrm <> 'Card not found' then
      raise exception 'caso 4b: error incorrecto: %', sqlerrm;
    end if;
  end;
end $$;

-- ── Caso 4c: expected_version nulo → excepción de validación ──
do $$
declare
  v_prior jsonb := jsonb_build_object('due', '2026-09-03T00:00:00+00', 'state', 'new');
  v_result jsonb := jsonb_build_object('due', '2026-09-04T00:00:00+00', 'state', 'learning');
begin
  begin
    perform public.apply_review(
      'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000097',
      '2026-09-03 12:00:00+00', null, 4, 'recognition', v_result, v_prior
    );
    raise exception 'caso 4c: no se rechazó expected_version nulo';
  exception when others then
    if sqlerrm like 'caso 4c:%' then raise; end if;
    if sqlerrm not like '%expected_version must not be null%' then
      raise exception 'caso 4c: error incorrecto: %', sqlerrm;
    end if;
  end;
end $$;

rollback;
