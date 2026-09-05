-- supabase/migrations/2026090604_fix_ambiguous_deck_id.sql
--
-- Fixes "column reference deck_id is ambiguous" when starting the diagnostic or
-- adding decks from templates.
-- In PL/pgSQL, functions returning table (deck_id uuid, ...) create an OUT variable
-- named `deck_id`. Unqualified references or ON CONFLICT (deck_id, ...) clauses
-- conflict with the OUT parameter unless #variable_conflict use_column is set
-- and table columns are qualified.

create or replace function public.create_study_plan(p_levels int[] default array[1, 2])
returns table(deck_id uuid, scope_size integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_deck_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select d.id into v_deck_id
  from public.decks d
  where d.user_id = v_user_id and d.is_default;

  if v_deck_id is null then
    insert into public.decks (user_id, name, description, is_default)
    values (
      v_user_id,
      'HSK ' || array_to_string(p_levels, ' + '),
      'Todo el vocabulario del objetivo. Las tarjetas se introducen día a día.',
      true
    )
    returning id into v_deck_id;
  end if;

  insert into public.deck_cards (deck_id, word_id)
  select v_deck_id, w.id
  from public.words w
  where w.hsk_level = any(p_levels)
  on conflict do nothing;

  -- srs_cards es la identidad de la tarjeta y puede existir para todo el
  -- alcance: es barato y no programa nada. Lo que NO se crea por adelantado es
  -- learner_skill_state, porque una fila ahí es una tarjeta que el planificador
  -- considera vencida.
  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict do nothing;

  deck_id := v_deck_id;
  select count(*)::integer into scope_size
  from public.deck_cards dc
  where dc.deck_id = v_deck_id;
  return next;
end;
$$;

create or replace function public.add_deck_from_template(p_template_id uuid)
returns table(deck_id uuid, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
    on conflict do nothing
    returning word_id
  )
  select count(*) into v_inserted from membership;

  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict do nothing;

  deck_id := v_deck_id;
  inserted := v_inserted;
  return next;
end;
$$;

create or replace function public.submit_diagnostic(p_results jsonb)
returns table(suspended integer, queued integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, suspended, fsrs_state
  )
  select
    v_user_id, 'word', (entry->>'word_id')::bigint, 'recognition',
    (entry->>'known')::boolean, 'new'
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean
  on conflict (user_id, target_kind, target_id, skill)
  do update set suspended = true, updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload)
  select
    v_user_id, 'review_rated', 'word', (entry->>'word_id')::bigint, 'recognition',
    jsonb_build_object('source', 'diagnostic', 'known', entry->>'known')
  from jsonb_array_elements(p_results) as entry;

  select count(*)::integer into suspended
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean;

  select jsonb_array_length(p_results) - suspended into queued;
  return next;
end;
$$;

revoke all on function public.create_study_plan(int[]) from public;
grant execute on function public.create_study_plan(int[]) to authenticated;

revoke all on function public.add_deck_from_template(uuid) from public;
grant execute on function public.add_deck_from_template(uuid) to authenticated;

revoke all on function public.submit_diagnostic(jsonb) from public;
grant execute on function public.submit_diagnostic(jsonb) to authenticated;
