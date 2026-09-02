-- Undo dejaba la valoración en la base: solo movía estado de pantalla. Volver a
-- valorar la misma tarjeta aplicaba dos transiciones, creaba dos filas de
-- review_log e incrementaba dos veces las estadísticas.
--
-- La reversión restaura una instantánea del estado anterior en vez de reproducir
-- el historial. Es a propósito: reproducir ataría esta función al algoritmo de
-- programación y habría que reescribirla cuando SM-2 se sustituya por FSRS.
-- La comprobación de versión es lo que hace segura la instantánea.

alter table public.review_log
  add column if not exists prior_snapshot jsonb,
  add column if not exists reverted_at timestamptz;

-- La firma de seis argumentos ya guardaba el estado posterior en
-- result_snapshot. Se reescribe para guardar también el estado anterior,
-- construido antes de tocar srs_cards.
create or replace function public.review_flashcard(
  card_id uuid,
  quality integer,
  time_ms integer,
  review_id uuid,
  reviewed_at timestamptz,
  expected_version bigint
)
returns table(
  outcome text,
  "interval" integer,
  next_review timestamptz,
  ease_factor numeric,
  repetitions integer,
  status text,
  version bigint,
  last_reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id           uuid    := auth.uid();
  v_card              public.srs_cards;
  v_existing_card_id  uuid;
  v_review_date       date;
  v_new_repetitions   integer;
  v_new_interval      integer;
  v_new_ease          numeric;
  v_next_review_ts    timestamptz;
  v_new_status        text;
  v_cards_new_inc     integer := 0;
  v_new_version       bigint;
  v_snapshot          jsonb;
  v_prior_snapshot    jsonb;
begin
  -- 1. Auth and input validation
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if review_id is null then
    raise exception 'review_id must not be null';
  end if;

  if reviewed_at is null then
    raise exception 'reviewed_at must not be null';
  end if;

  if expected_version is null then
    raise exception 'expected_version must not be null';
  end if;

  if quality is null or quality < 0 or quality > 5 then
    raise exception 'quality must be between 0 and 5';
  end if;

  -- 2. Duplicate lookup (before acquiring any lock)
  select rl.card_id
  into v_existing_card_id
  from public.review_log rl
  where rl.user_id = v_user_id
    and rl.client_review_id = review_flashcard.review_id
  limit 1;

  if found then
    if v_existing_card_id <> review_flashcard.card_id then
      raise exception 'review_id already used for a different card';
    end if;

    select c.*
    into v_card
    from public.srs_cards c
    where c.id = review_flashcard.card_id
      and c.user_id = v_user_id;

    if not found then
      raise exception 'Card not found';
    end if;

    outcome          := 'duplicate';
    "interval"       := v_card.interval_days;
    next_review      := v_card.next_review_at;
    ease_factor      := v_card.ease_factor;
    repetitions      := v_card.repetitions;
    status           := v_card.status;
    version          := v_card.version;
    last_reviewed_at := v_card.last_reviewed_at;
    return next;
    return;
  end if;

  -- 3. Lock the owned card row
  select *
  into v_card
  from public.srs_cards
  where id = review_flashcard.card_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Card not found';
  end if;

  -- 4. Optimistic-concurrency version check — return conflict without mutation
  if v_card.version <> review_flashcard.expected_version then
    outcome          := 'conflict';
    "interval"       := v_card.interval_days;
    next_review      := v_card.next_review_at;
    ease_factor      := v_card.ease_factor;
    repetitions      := v_card.repetitions;
    status           := v_card.status;
    version          := v_card.version;
    last_reviewed_at := v_card.last_reviewed_at;
    return next;
    return;
  end if;

  -- Snapshot the complete mutable state before applying SM-2. Undo restores
  -- this state directly, so it remains independent of future algorithms.
  v_prior_snapshot := jsonb_build_object(
    'ease_factor',      v_card.ease_factor,
    'interval_days',    v_card.interval_days,
    'repetitions',      v_card.repetitions,
    'status',           v_card.status,
    'next_review_at',   v_card.next_review_at,
    'last_reviewed_at', v_card.last_reviewed_at,
    'version',          v_card.version
  );

  -- 5. SM-2 calculation (using reviewed_at::date for offline scheduling)
  v_review_date     := review_flashcard.reviewed_at::date;
  v_new_repetitions := coalesce(v_card.repetitions, 0);
  v_new_interval    := coalesce(v_card.interval_days, 0);
  v_new_ease        := coalesce(v_card.ease_factor, 2.5);

  if quality < 3 then
    v_new_repetitions := 0;
    v_new_interval    := 1;
  else
    if v_new_repetitions = 0 then
      v_new_interval := 1;
    elsif v_new_repetitions = 1 then
      v_new_interval := 6;
    else
      v_new_interval := round(v_new_interval * v_new_ease)::integer;
    end if;
    v_new_repetitions := v_new_repetitions + 1;
  end if;

  v_new_ease := v_new_ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  v_new_ease := greatest(1.3, v_new_ease);
  v_new_ease := round(v_new_ease, 2);

  v_next_review_ts := (v_review_date + v_new_interval)::timestamptz;

  if quality < 3 then
    v_new_status := 'learning';
  elsif v_new_repetitions = 1 then
    v_new_status := 'learning';
  elsif v_new_interval >= 21 and v_new_repetitions >= 5 then
    v_new_status := 'mastered';
  else
    v_new_status := 'review';
  end if;

  if v_card.status = 'new' then
    v_cards_new_inc := 1;
  end if;

  v_new_version := v_card.version + 1;

  -- 6-8. Apply card update, log row, and daily stats atomically.
  begin
    update public.srs_cards
    set
      ease_factor      = v_new_ease,
      interval_days    = v_new_interval,
      repetitions      = v_new_repetitions,
      next_review_at   = v_next_review_ts,
      last_reviewed_at = review_flashcard.reviewed_at,
      status           = v_new_status,
      version          = v_new_version
    where id = review_flashcard.card_id;

    v_snapshot := jsonb_build_object(
      'outcome',     'applied',
      'interval',    v_new_interval,
      'next_review', v_next_review_ts,
      'ease_factor', v_new_ease,
      'repetitions', v_new_repetitions,
      'status',      v_new_status,
      'version',     v_new_version
    );

    insert into public.review_log (
      user_id,
      card_id,
      reviewed_at,
      quality,
      time_ms,
      client_review_id,
      client_reviewed_at,
      result_snapshot,
      prior_snapshot
    ) values (
      v_user_id,
      review_flashcard.card_id,
      review_flashcard.reviewed_at,
      review_flashcard.quality,
      review_flashcard.time_ms,
      review_flashcard.review_id,
      review_flashcard.reviewed_at,
      v_snapshot,
      v_prior_snapshot
    );

    insert into public.user_stats (user_id, date, cards_reviewed, cards_new)
    values (
      v_user_id,
      timezone('utc', review_flashcard.reviewed_at)::date,
      1,
      v_cards_new_inc
    )
    on conflict (user_id, date)
    do update set
      cards_reviewed = public.user_stats.cards_reviewed + 1,
      cards_new      = public.user_stats.cards_new + excluded.cards_new,
      updated_at     = now();

  exception
    when unique_violation then
      -- Concurrent duplicate: the sub-transaction is rolled back automatically.
      select rl.card_id
      into v_existing_card_id
      from public.review_log rl
      where rl.user_id = v_user_id
        and rl.client_review_id = review_flashcard.review_id
      limit 1;

      if v_existing_card_id <> review_flashcard.card_id then
        raise exception 'review_id already used for a different card';
      end if;

      select c.*
      into v_card
      from public.srs_cards c
      where c.id = review_flashcard.card_id
        and c.user_id = v_user_id;

      if not found then
        raise exception 'Card not found';
      end if;

      outcome          := 'duplicate';
      "interval"       := v_card.interval_days;
      next_review      := v_card.next_review_at;
      ease_factor      := v_card.ease_factor;
      repetitions      := v_card.repetitions;
      status           := v_card.status;
      version          := v_card.version;
      last_reviewed_at := v_card.last_reviewed_at;
      return next;
      return;
  end;

  -- 9. Return applied with authoritative card state
  outcome          := 'applied';
  "interval"       := v_new_interval;
  next_review      := v_next_review_ts;
  ease_factor      := v_new_ease;
  repetitions      := v_new_repetitions;
  status           := v_new_status;
  version          := v_new_version;
  last_reviewed_at := review_flashcard.reviewed_at;
  return next;
end;
$$;

create or replace function public.revert_review(p_review_id uuid)
returns table(outcome text, card_id uuid, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_log      public.review_log;
  v_card     public.srs_cards;
  v_prior    jsonb;
  v_result   jsonb;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_log
  from public.review_log
  where client_review_id = p_review_id and user_id = v_user_id;

  if not found then
    outcome := 'not_found';
    card_id := null;
    version := null;
    return next;
    return;
  end if;

  card_id := v_log.card_id;

  -- Revertir dos veces la misma valoración descontaría dos veces las
  -- estadísticas. La operación es idempotente: la segunda vez no hace nada.
  if v_log.reverted_at is not null then
    select c.version into version from public.srs_cards c where c.id = v_log.card_id;
    outcome := 'already_reverted';
    return next;
    return;
  end if;

  v_prior  := v_log.prior_snapshot;
  v_result := v_log.result_snapshot;

  if v_prior is null or v_result is null or v_result->>'version' is null then
    -- Sin instantánea previa no hay nada que restaurar sin reproducir el
    -- historial. Ocurre solo con valoraciones anteriores a esta migración.
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  select * into v_card from public.srs_cards
  where id = v_log.card_id and user_id = v_user_id
  for update;

  if not found then
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  -- Si la tarjeta avanzó después de esta valoración, restaurar la instantánea
  -- borraría ese avance. Se rechaza en vez de destruirlo.
  if v_card.version <> (v_result->>'version')::bigint then
    outcome := 'conflict';
    version := v_card.version;
    return next;
    return;
  end if;

  update public.srs_cards set
    ease_factor      = (v_prior->>'ease_factor')::numeric,
    interval_days    = (v_prior->>'interval_days')::integer,
    repetitions      = (v_prior->>'repetitions')::integer,
    status           = v_prior->>'status',
    next_review_at   = (v_prior->>'next_review_at')::timestamptz,
    last_reviewed_at = nullif(v_prior->>'last_reviewed_at', '')::timestamptz,
    version          = v_card.version + 1,
    updated_at       = now()
  where id = v_log.card_id;

  update public.review_log set reverted_at = now() where id = v_log.id;

  -- Las estadísticas del día pierden esta review. Se descuenta también la
  -- tarjeta nueva si aquella valoración fue la que la estrenó.
  update public.user_stats set
    cards_reviewed = greatest(0, cards_reviewed - 1),
    cards_new = greatest(0, cards_new - (case when v_prior->>'status' = 'new' then 1 else 0 end))
  where user_id = v_user_id and date = (v_log.reviewed_at at time zone 'utc')::date;

  insert into public.learning_event (user_id, kind, target_kind, target_id, payload)
  select
    v_user_id,
    'review_reverted'::public.learning_event_kind,
    'word'::public.learning_target_kind,
    c.word_id,
    jsonb_build_object('card_id', v_log.card_id, 'client_review_id', p_review_id)
  from public.srs_cards c
  where c.id = v_log.card_id
  returning id into v_event_id;

  outcome := 'reverted';
  version := v_card.version + 1;
  return next;
end;
$$;

revoke all on function public.revert_review(uuid) from public;
grant execute on function public.revert_review(uuid) to authenticated;
