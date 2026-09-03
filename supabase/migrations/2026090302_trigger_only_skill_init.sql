-- Keep skill-state creation on the srs_cards/word_context triggers.
-- Deck RPCs only create identity and membership rows; duplicating state writes
-- here would leave two initialization paths with different defaults.

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

  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  deck_id := v_deck_id;
  inserted := v_inserted;
  return next;
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
  v_limit integer := greatest(1, coalesce(p_limit, 150));
  v_inserted integer := 0;
  v_deck_id uuid;
  v_levels int[] := case when strategy = 'hsk1_review' then array[1] else array[1,2] end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

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
    insert into public.srs_cards (user_id, word_id)
    select v_user_id, c.id from candidates c
    on conflict (user_id, word_id) do nothing
    returning word_id
  ), membership as (
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

grant execute on function public.add_deck_from_template(uuid) to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;
