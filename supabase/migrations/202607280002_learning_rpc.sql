-- Hanyu learning RPC functions
-- create_starter_deck and review_flashcard keep multi-table writes consistent.

create or replace function public.ensure_today_stats()
returns public.user_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_stats;
  v_today date := timezone('utc', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_stats (user_id, date)
  values (v_user_id, v_today)
  on conflict (user_id, date) do nothing;

  select *
  into v_row
  from public.user_stats
  where user_id = v_user_id and date = v_today;

  return v_row;
end;
$$;

create or replace function public.create_starter_deck(
  strategy text default 'hsk2_consolidation',
  p_limit integer default null
)
returns table(inserted integer, total_deck_size integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := coalesce(p_limit, 150);
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_limit < 1 then
    v_limit := 1;
  end if;

  if strategy = 'hsk1_review' then
    with candidates as (
      select w.id
      from public.words w
      where w.hsk_level = 1
      order by coalesce(w.frequency, 2147483647), w.id
      limit v_limit
    ), inserted_rows as (
      insert into public.srs_cards (user_id, word_id, next_review_at, status)
      select v_user_id, c.id, now(), 'new'
      from candidates c
      on conflict (user_id, word_id) do nothing
      returning 1
    )
    select count(*) into v_inserted from inserted_rows;
  else
    with candidates as (
      select w.id
      from public.words w
      where w.hsk_level in (1, 2)
      order by w.hsk_level, coalesce(w.frequency, 2147483647), w.id
      limit v_limit
    ), inserted_rows as (
      insert into public.srs_cards (user_id, word_id, next_review_at, status)
      select v_user_id, c.id, now(), 'new'
      from candidates c
      on conflict (user_id, word_id) do nothing
      returning 1
    )
    select count(*) into v_inserted from inserted_rows;
  end if;

  inserted := v_inserted;
  select count(*) into total_deck_size from public.srs_cards where user_id = v_user_id;

  return next;
end;
$$;

create or replace function public.review_flashcard(
  card_id uuid,
  quality integer,
  time_ms integer default null
)
returns table(
  card_id uuid,
  interval integer,
  next_review date,
  ease_factor numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_card public.srs_cards;
  v_today date := timezone('utc', now())::date;
  v_new_repetitions integer;
  v_new_interval integer;
  v_new_ease numeric;
  v_next_review date;
  v_new_status text;
  v_cards_new_increment integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if quality is null or quality < 0 or quality > 5 then
    raise exception 'quality must be between 0 and 5';
  end if;

  select *
  into v_card
  from public.srs_cards
  where id = review_flashcard.card_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Card not found';
  end if;

  v_new_repetitions := coalesce(v_card.repetitions, 0);
  v_new_interval := coalesce(v_card.interval_days, 0);
  v_new_ease := coalesce(v_card.ease_factor, 2.5);

  if quality < 3 then
    v_new_repetitions := 0;
    v_new_interval := 1;
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

  v_next_review := v_today + v_new_interval;

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
    v_cards_new_increment := 1;
  end if;

  update public.srs_cards
  set
    ease_factor = v_new_ease,
    interval_days = v_new_interval,
    repetitions = v_new_repetitions,
    next_review_at = v_next_review::timestamptz,
    last_reviewed_at = now(),
    status = v_new_status
  where id = review_flashcard.card_id;

  insert into public.review_log (user_id, card_id, reviewed_at, quality, time_ms)
  values (v_user_id, review_flashcard.card_id, now(), quality, time_ms);

  insert into public.user_stats (user_id, date, cards_reviewed, cards_new)
  values (v_user_id, v_today, 1, v_cards_new_increment)
  on conflict (user_id, date)
  do update set
    cards_reviewed = public.user_stats.cards_reviewed + 1,
    cards_new = public.user_stats.cards_new + excluded.cards_new,
    updated_at = now();

  review_flashcard.card_id := review_flashcard.card_id;
  interval := v_new_interval;
  next_review := v_next_review;
  ease_factor := v_new_ease;
  status := v_new_status;
  return next;
end;
$$;

grant execute on function public.ensure_today_stats() to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;
grant execute on function public.review_flashcard(uuid, integer, integer) to authenticated;
