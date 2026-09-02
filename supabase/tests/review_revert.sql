-- review_revert.sql
-- Comprueba revert_review en sus tres desenlaces: reversión, idempotencia y
-- conflicto. Todo va dentro de una transacción que se deshace al final.

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'revert-test@example.com', now(), now());

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level)
values (99801, '测', 'cè', 'revert-test', 1);

insert into public.srs_cards (id, user_id, word_id)
values ('d0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001', 99801);

set local "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-000000000001';

-- ── Caso 1: valorar y revertir devuelve la tarjeta a su estado anterior ──
do $$
declare
  v_before public.srs_cards;
  v_after  public.srs_cards;
  v_out    record;
begin
  select * into v_before from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 4, 1200,
    'e0000000-0000-0000-0000-000000000001', now(), v_before.version
  );

  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000001');
  if v_out.outcome <> 'reverted' then
    raise exception 'esperaba reverted, obtuve %', v_out.outcome;
  end if;
  if v_out.card_id <> 'd0000000-0000-0000-0000-000000000001' then
    raise exception 'la RPC no devolvió el card_id';
  end if;

  select * into v_after from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  if v_after.repetitions <> v_before.repetitions
     or v_after.interval_days <> v_before.interval_days
     or v_after.ease_factor <> v_before.ease_factor
     or v_after.status <> v_before.status then
    raise exception 'la tarjeta no volvió a su estado previo';
  end if;

  -- La versión avanza aunque el estado retroceda: la reversión es una
  -- mutación más, y otros dispositivos tienen que verla.
  if v_after.version <= v_before.version then
    raise exception 'la versión debería avanzar tras revertir';
  end if;

  if (select cards_reviewed from public.user_stats
      where user_id = 'c0000000-0000-0000-0000-000000000001'
        and date = (now() at time zone 'utc')::date) <> 0 then
    raise exception 'las estadísticas del día no descontaron la review';
  end if;

  raise notice 'caso 1 OK';
end $$;

-- ── Caso 2: revertir dos veces no descuenta dos veces ──
do $$
declare
  v_out   record;
  v_stats integer;
begin
  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000001');
  if v_out.outcome <> 'already_reverted' then
    raise exception 'esperaba already_reverted, obtuve %', v_out.outcome;
  end if;

  select coalesce(cards_reviewed, 0) into v_stats from public.user_stats
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and date = (now() at time zone 'utc')::date;

  if v_stats <> 0 then
    raise exception 'la segunda reversión volvió a descontar: %', v_stats;
  end if;

  raise notice 'caso 2 OK';
end $$;

-- ── Caso 3: si la tarjeta avanzó después, la reversión se rechaza ──
do $$
declare
  v_card   public.srs_cards;
  v_out    record;
  v_before public.srs_cards;
begin
  select * into v_card from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 4, 1000,
    'e0000000-0000-0000-0000-000000000002', now(), v_card.version
  );

  select * into v_card from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 3, 1000,
    'e0000000-0000-0000-0000-000000000003', now(), v_card.version
  );

  select * into v_before from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  -- Revertir la penúltima destruiría la última. Debe rechazarse.
  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000002');
  if v_out.outcome <> 'conflict' then
    raise exception 'esperaba conflict, obtuve %', v_out.outcome;
  end if;

  if (select version from public.srs_cards
      where id = 'd0000000-0000-0000-0000-000000000001') <> v_before.version then
    raise exception 'un conflicto no debe mutar nada';
  end if;

  raise notice 'caso 3 OK';
end $$;

rollback;
