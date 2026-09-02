-- Seed curated catalog (HSK1-3 derive words by level; theme uses explicit list).
insert into public.deck_templates (slug, name, description, category, hsk_level, sort_order) values
  ('hsk1', 'HSK 1', 'Foundation vocabulary, HSK level 1.', 'hsk', 1, 10),
  ('hsk2', 'HSK 2', 'HSK level 2 vocabulary.', 'hsk', 2, 20),
  ('hsk3', 'HSK 3', 'HSK level 3 vocabulary.', 'hsk', 3, 30),
  ('everyday-greetings', 'Everyday Greetings', 'Core greetings and polite phrases.', 'theme', null, 40)
on conflict (slug) do nothing;

-- Theme template words. Migrations run before seed.sql, so the six words below
-- may not exist yet on a fresh database: seed them here (mirroring seed.sql data)
-- so the theme template is populated regardless of seed ordering.
insert into public.words (hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency) values
  ('你好', 'nǐ hǎo', 'hello; hi', 'hola; ¿qué tal?; buenos días/tardes', 1, '', 659697),
  ('谢谢', 'xièxie', 'to thank; thanks; thank you', 'gracias; agradecer; dar las gracias; muchas gracias; te lo agradezco', 1, 'verb', 2528380),
  ('再见', 'zàijiàn', 'goodbye; see you again later', 'adiós; hasta luego; hasta la vista', 1, 'verb', 457344),
  ('对不起', 'duìbuqǐ', 'I''m sorry; excuse me; I beg your pardon', 'lo siento; perdón; disculpa', 1, 'verb', 800251),
  ('请', 'qǐng', 'to ask; to invite; please (do sth)', 'por favor; invitar; pedir (cortésmente); contratar', 1, 'verb', 6760332),
  ('没关系', 'méi guānxi', 'it doesn''t matter', 'no importa; no pasa nada; da igual', 1, '', 289385)
on conflict (hanzi, hsk_level) do nothing;

insert into public.deck_template_words (template_id, word_id, sort_order)
select t.id, w.id, row_number() over (order by w.hsk_level, w.id)
from public.deck_templates t
join public.words w on w.hanzi in ('你好','谢谢','再见','对不起','请','没关系')
where t.slug = 'everyday-greetings'
on conflict (template_id, word_id) do nothing;

-- Copy a template into a new user deck; ensure srs_cards exist. Shared SRS: on conflict do nothing.
create or replace function public.add_deck_from_template(p_template_id uuid)
returns table(deck_id uuid, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tpl public.deck_templates;
  v_deck_id uuid;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_tpl from public.deck_templates where id = p_template_id;
  if not found then
    raise exception 'Template not found';
  end if;

  insert into public.decks (user_id, name, description, source_template_id)
  values (v_user_id, v_tpl.name, v_tpl.description, v_tpl.id)
  returning id into v_deck_id;

  with source_words as (
    select w.id as word_id
    from public.words w
    where v_tpl.hsk_level is not null and w.hsk_level = v_tpl.hsk_level
    union
    select tw.word_id
    from public.deck_template_words tw
    where tw.template_id = v_tpl.id
  ), membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, sw.word_id from source_words sw
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from membership;

  insert into public.srs_cards (user_id, word_id, next_review_at, status)
  select v_user_id, dc.word_id, now(), 'new'
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  deck_id := v_deck_id;
  inserted := v_inserted;
  return next;
end;
$$;

-- Due cards scoped to the user's ACTIVE decks (combined), or a single deck when p_deck_id is set.
create or replace function public.get_due_cards(p_limit integer default 50, p_deck_id uuid default null)
returns setof public.srs_cards
language sql
security definer
set search_path = public
as $$
  select sc.*
  from public.srs_cards sc
  where sc.user_id = auth.uid()
    and sc.next_review_at <= now()
    and exists (
      select 1
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where dc.word_id = sc.word_id
        and d.user_id = auth.uid()
        and (p_deck_id is null and d.is_active or d.id = p_deck_id)
    )
  order by sc.next_review_at asc
  limit greatest(1, coalesce(p_limit, 50));
$$;

-- New users get a default deck alongside their starter cards.
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
  v_deck_id uuid;
  v_levels int[] := case when strategy = 'hsk1_review' then array[1] else array[1,2] end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_limit < 1 then v_limit := 1; end if;

  -- Idempotent: reuse the existing default deck instead of creating duplicates.
  if exists (select 1 from public.decks where user_id = v_user_id and is_default) then
    select id into v_deck_id from public.decks where user_id = v_user_id and is_default;
  else
    insert into public.decks (user_id, name, description, is_default)
    values (v_user_id, 'HSK2 consolidation', 'Your starter deck.', true)
    returning id into v_deck_id;
  end if;

  with candidates as (
    select w.id
    from public.words w
    where w.hsk_level = any(v_levels)
    order by w.hsk_level, coalesce(w.frequency, 2147483647), w.id
    limit v_limit
  ), inserted_cards as (
    insert into public.srs_cards (user_id, word_id, next_review_at, status)
    select v_user_id, c.id, now(), 'new' from candidates c
    on conflict (user_id, word_id) do nothing
    returning word_id
  ), _membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, c.id from candidates c
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from inserted_cards;

  inserted := v_inserted;
  select count(*) into total_deck_size from public.srs_cards where user_id = v_user_id;
  return next;
end;
$$;

-- Lightweight counts over the deck scope (active decks, or a single deck).
-- p_due_only: count only cards with a due next_review_at. Distinct words, so a
-- word shared across several active decks is counted once in the combined scope.
create or replace function public.count_deck_cards(
  p_deck_id uuid default null,
  p_due_only boolean default false
)
returns table(deck_id uuid, count bigint)
language sql
security definer
set search_path = public
as $$
  select p_deck_id as deck_id, count(distinct dc.word_id) as count
  from public.deck_cards dc
  join public.decks d on d.id = dc.deck_id and d.user_id = auth.uid()
  where ((p_deck_id is null and d.is_active) or dc.deck_id = p_deck_id)
    and (not p_due_only or exists (
      select 1
      from public.srs_cards sc
      where sc.word_id = dc.word_id
        and sc.user_id = auth.uid()
        and sc.next_review_at <= now()
    ))
$$;

-- Per-deck word and due counts for the deck list screen.
create or replace function public.get_deck_stats()
returns table(deck_id uuid, word_count bigint, due_count bigint)
language sql
security definer
set search_path = public
as $$
  select d.id as deck_id,
    (
      select count(*)
      from public.deck_cards dc
      where dc.deck_id = d.id
    ) as word_count,
    (
      select count(*)
      from public.deck_cards dc
      join public.srs_cards sc on sc.word_id = dc.word_id and sc.user_id = d.user_id
      where dc.deck_id = d.id
        and sc.next_review_at <= now()
    ) as due_count
  from public.decks d
  where d.user_id = auth.uid()
$$;

grant execute on function public.add_deck_from_template(uuid) to authenticated;
grant execute on function public.get_due_cards(integer, uuid) to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;
grant execute on function public.count_deck_cards(uuid, boolean) to authenticated;
grant execute on function public.get_deck_stats() to authenticated;

-- Backfill: existing users' loose cards go into a default deck so the active-deck
-- due query keeps returning them.
do $$
declare r record;
declare v_deck_id uuid;
begin
  for r in select distinct user_id from public.srs_cards loop
    insert into public.decks (user_id, name, description, is_default)
    values (r.user_id, 'My deck', 'Migrated from your existing cards.', true)
    returning id into v_deck_id;

    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, sc.word_id from public.srs_cards sc where sc.user_id = r.user_id
    on conflict (deck_id, word_id) do nothing;
  end loop;
end $$;
