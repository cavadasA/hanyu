-- Hanyu offline review sync: idempotent, versioned review RPC
-- Adds version column to srs_cards, idempotency columns to review_log,
-- and a six-argument overload of review_flashcard for offline sync.

-- ───────────────────────────────────────────────
-- Step 3a: version column on srs_cards
-- ───────────────────────────────────────────────
alter table public.srs_cards
  add column if not exists version bigint not null default 0;

-- ───────────────────────────────────────────────
-- Step 3b: idempotency columns on review_log
-- ───────────────────────────────────────────────
alter table public.review_log
  add column if not exists client_review_id uuid,
  add column if not exists client_reviewed_at timestamptz,
  add column if not exists result_snapshot jsonb;

-- Partial unique index: one review_id per user (NULLs excluded so the
-- three-argument path, which never sets client_review_id, is unaffected)
create unique index if not exists review_log_user_client_review_unique
  on public.review_log(user_id, client_review_id)
  where client_review_id is not null;

-- ───────────────────────────────────────────────
-- Step 4: six-argument idempotent overload
-- ───────────────────────────────────────────────
-- card_id is intentionally absent from RETURNS TABLE to avoid the
-- "parameter name used more than once" error (same fix as the three-arg
-- function).  "interval" is double-quoted because it is a reserved keyword
-- in the RETURNS TABLE column-list grammar.
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
  --    If this client_review_id was already processed by this user, return
  --    the *current* authoritative card state so a retry cannot regress the
  --    cache after a subsequent review from another device.
  select rl.card_id
  into v_existing_card_id
  from public.review_log rl
  where rl.user_id = v_user_id
    and rl.client_review_id = review_flashcard.review_id
  limit 1;

  if found then
    -- Guard: if the stored log row belongs to a DIFFERENT card, the client
    -- reused a review_id across two distinct cards — that is a client bug and
    -- must not silently discard the second review.
    if v_existing_card_id <> review_flashcard.card_id then
      raise exception 'review_id already used for a different card';
    end if;

    -- True duplicate: return the current authoritative card state.
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
  --      The existence probe (step 2) and this insert form a check-then-act gap:
  --      two concurrent calls with the same review_id can both pass the probe and
  --      race to insert.  Wrapping all three mutations in a sub-transaction lets
  --      the loser catch unique_violation and fall through to the duplicate path
  --      instead of surfacing an opaque error.
  begin
    -- 6. Update card — SM-2 fields plus version bump
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

    -- 7. Insert review_log with result_snapshot for audit
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
      result_snapshot
    ) values (
      v_user_id,
      review_flashcard.card_id,
      review_flashcard.reviewed_at,
      review_flashcard.quality,
      review_flashcard.time_ms,
      review_flashcard.review_id,
      review_flashcard.reviewed_at,
      v_snapshot
    );

    -- 8. Increment daily stats (keyed to the client's reviewed_at date in UTC)
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
      -- Re-derive and return the current authoritative card state, mirroring the
      -- duplicate branch in step 2 above.
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

grant execute on function public.review_flashcard(uuid, integer, integer, uuid, timestamptz, bigint) to authenticated;
