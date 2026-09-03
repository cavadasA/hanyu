-- review_revert.sql
-- Comprueba revert_review contra el estado FSRS por habilidad: reversión,
-- idempotencia, conflicto por una review posterior y perdón de leeches ante
-- una review creada con una caché obsoleta.
-- Todo va dentro de una transacción que se deshace al final.

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'revert-test@example.com', now(), now());

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level)
values (99801, '测', 'cè', 'revert-test', 1);

insert into public.srs_cards (id, user_id, word_id)
values ('d0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001', 99801);

-- Sembramos un estado previo para que la comparación cubra los campos que
-- revert_review restaura.
insert into public.learner_skill_state (
  user_id, target_kind, target_id, skill, next_review_at, fsrs_state,
  reps, lapses, learning_steps, scheduled_days, elapsed_days, suspended, leech
)
values (
  'c0000000-0000-0000-0000-000000000001', 'word', 99801, 'recognition',
  '2026-09-03 00:00:00+00', 'new', 0, 0, 0, 0, 0, true, false
);

set local "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-000000000001';

-- ── Caso 1: valorar y revertir restaura el snapshot previo ──
do $$
declare
  v_before public.learner_skill_state;
  v_after  public.learner_skill_state;
  v_prior  jsonb;
  v_result jsonb;
  v_outcome text;
  v_version bigint;
  v_card_id uuid;
  v_stats integer;
  v_reverted_events integer;
begin
  select * into v_before
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  v_prior := jsonb_build_object(
    'difficulty', null::numeric,
    'stability', null::numeric,
    'reps', 0,
    'lapses', 0,
    'learning_steps', 0,
    'scheduled_days', 0,
    'elapsed_days', 0,
    'state', 'new',
    'due', '2026-09-03T00:00:00+00:00',
    'last_review', null::text,
    'leech', false,
    'suspended', false
  );
  v_result := jsonb_build_object(
    'difficulty', 5.1,
    'stability', 1.4,
    'reps', 1,
    'lapses', 0,
    'learning_steps', 1,
    'scheduled_days', 1,
    'elapsed_days', 0,
    'state', 'learning',
    'due', '2026-09-04T00:00:00+00:00'
  );

  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    '2026-09-03 10:00:00+00',
    v_before.version,
    4::smallint,
    'recognition',
    v_result,
    v_prior,
    4567
  );

  if v_outcome <> 'applied' or v_version <> v_before.version + 1 then
    raise exception 'caso 1: apply_review no aplicó la review: outcome=%, version=%',
      v_outcome, v_version;
  end if;

  select outcome, card_id, version
  into v_outcome, v_card_id, v_version
  from public.revert_review('e0000000-0000-0000-0000-000000000001');
  if v_outcome <> 'reverted'
     or v_card_id <> 'd0000000-0000-0000-0000-000000000001' then
    raise exception 'caso 1: esperaba reverted con card_id, obtuve outcome=%, card_id=%',
      v_outcome, v_card_id;
  end if;

  select * into v_after
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  if v_after.difficulty is distinct from v_before.difficulty
     or v_after.stability is distinct from v_before.stability
     or v_after.reps is distinct from v_before.reps
     or v_after.lapses is distinct from v_before.lapses
     or v_after.learning_steps is distinct from v_before.learning_steps
     or v_after.scheduled_days is distinct from v_before.scheduled_days
     or v_after.elapsed_days is distinct from v_before.elapsed_days
     or v_after.fsrs_state is distinct from v_before.fsrs_state
     or v_after.next_review_at is distinct from v_before.next_review_at
     or v_after.last_reviewed_at is distinct from v_before.last_reviewed_at
     or v_after.suspended is distinct from v_before.suspended
     or v_after.leech is distinct from v_before.leech then
    raise exception 'caso 1: el estado FSRS no volvió a su snapshot previo';
  end if;

  -- La reversión es otra mutación: el estado retrocede, pero su versión avanza.
  if v_after.version <= v_before.version then
    raise exception 'caso 1: la versión debería avanzar tras revertir';
  end if;

  select coalesce(sum(cards_reviewed), 0)::integer into v_stats
  from public.user_stats
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and date = '2026-09-03';
  if v_stats <> 0 then
    raise exception 'caso 1: las estadísticas no descontaron la review: %', v_stats;
  end if;

  select count(*) into v_reverted_events
  from public.learning_event
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and kind = 'review_reverted'
    and reverts_event_id is not null;
  if v_reverted_events <> 1 then
    raise exception 'caso 1: faltó el evento review_reverted enlazado';
  end if;
end $$;

-- ── Caso 2: revertir dos veces es idempotente ──
do $$
declare
  v_outcome text;
  v_card_id uuid;
  v_version bigint;
  v_stats integer;
begin
  select outcome, card_id, version into v_outcome, v_card_id, v_version
  from public.revert_review('e0000000-0000-0000-0000-000000000001');

  if v_outcome <> 'already_reverted'
     or v_card_id <> 'd0000000-0000-0000-0000-000000000001' then
    raise exception 'caso 2: esperaba already_reverted, obtuve outcome=%, card_id=%',
      v_outcome, v_card_id;
  end if;

  select coalesce(sum(cards_reviewed), 0)::integer into v_stats
  from public.user_stats
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and date = '2026-09-03';
  if v_stats <> 0 then
    raise exception 'caso 2: la segunda reversión volvió a descontar: %', v_stats;
  end if;
end $$;

-- ── Caso 3: si el estado avanzó después, la reversión entra en conflicto ──
do $$
declare
  v_before public.learner_skill_state;
  v_after  public.learner_skill_state;
  v_prior  jsonb;
  v_result jsonb;
  v_outcome text;
  v_version bigint;
begin
  select * into v_before
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  v_prior := jsonb_build_object(
    'difficulty', null::numeric, 'stability', null::numeric,
    'reps', 0, 'lapses', 0,
    'learning_steps', 0, 'scheduled_days', 0, 'elapsed_days', 0,
    'state', 'new', 'due', '2026-09-03T00:00:00+00:00',
    'last_review', null::text, 'leech', false, 'suspended', false
  );
  v_result := jsonb_build_object(
    'difficulty', 5.0, 'stability', 1.5,
    'reps', 1, 'lapses', 0, 'learning_steps', 1, 'scheduled_days', 1,
    'elapsed_days', 0, 'state', 'learning', 'due', '2026-09-04T00:00:00+00:00'
  );
  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    '2026-09-03 11:00:00+00', v_before.version, 4::smallint, 'recognition',
    v_result, v_prior
  );

  select * into v_before
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  v_prior := jsonb_build_object(
    'difficulty', 5.0, 'stability', 1.5,
    'reps', 1, 'lapses', 0, 'learning_steps', 1, 'scheduled_days', 1,
    'elapsed_days', 0, 'state', 'learning',
    'due', '2026-09-04T00:00:00+00:00',
    'last_review', '2026-09-03T11:00:00+00:00', 'leech', false, 'suspended', false
  );
  v_result := jsonb_build_object(
    'difficulty', 4.8, 'stability', 3.0,
    'reps', 2, 'lapses', 0, 'learning_steps', 0, 'scheduled_days', 3,
    'elapsed_days', 1, 'state', 'review', 'due', '2026-09-06T00:00:00+00:00'
  );
  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000003',
    '2026-09-03 12:00:00+00', v_before.version, 3::smallint, 'recognition',
    v_result, v_prior
  );

  select * into v_before
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  select outcome, version into v_outcome, v_version
  from public.revert_review('e0000000-0000-0000-0000-000000000002');
  if v_outcome <> 'conflict' or v_version <> v_before.version then
    raise exception 'caso 3: esperaba conflict sin mutación, obtuve outcome=%, version=%',
      v_outcome, v_version;
  end if;

  select * into v_after
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';
  if v_after.version <> v_before.version
     or v_after.next_review_at is distinct from v_before.next_review_at
     or v_after.fsrs_state is distinct from v_before.fsrs_state then
    raise exception 'caso 3: el conflicto mutó el estado FSRS';
  end if;
end $$;

-- ── Caso 4: perdonar un leech no se pierde con una review obsoleta ──
do $$
declare
  v_before public.learner_skill_state;
  v_after public.learner_skill_state;
  v_outcome text;
  v_version bigint;
begin
  update public.learner_skill_state
  set lapses = 8, leech = true, suspended = true
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  select * into v_before
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  perform public.clear_leech( 'word', 99801, 'recognition' );

  select * into v_after
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  if v_after.version <> v_before.version
     or v_after.leech
     or v_after.suspended
     or v_after.leech_cleared_lapses <> 8 then
    raise exception 'caso 4: clear_leech no conservó el baseline sin cambiar versión';
  end if;

  select outcome, version into v_outcome, v_version
  from public.apply_review(
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000004',
    '2026-09-03 13:00:00+00',
    v_after.version,
    3::smallint,
    'recognition',
    jsonb_build_object(
      'difficulty', 4.8, 'stability', 3.0, 'reps', 3, 'lapses', 8,
      'learning_steps', 0, 'scheduled_days', 3, 'elapsed_days', 1,
      'state', 'review', 'due', '2026-09-08T13:00:00+00:00'
    ),
    jsonb_build_object(
      'difficulty', 4.8, 'stability', 3.0, 'reps', 2, 'lapses', 8,
      'learning_steps', 0, 'scheduled_days', 3, 'elapsed_days', 1,
      'state', 'review', 'due', '2026-09-03T13:00:00+00:00'
    )
  );

  select * into v_after
  from public.learner_skill_state
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and target_kind = 'word' and target_id = 99801 and skill = 'recognition';

  if v_outcome <> 'applied'
     or v_version <> v_after.version
     or v_after.lapses <> 8
     or v_after.leech then
    raise exception 'caso 4: una review obsoleta volvió a marcar el leech';
  end if;
end $$;

rollback;
