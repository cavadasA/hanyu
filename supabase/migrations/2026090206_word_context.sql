-- Al añadir una palabra desde una lectura, la frase donde apareció se perdía.
-- Es el contexto que convierte una tarjeta en algo estudiable: "还 huán" solo
-- se distingue de "还 hái" viéndolo usado.
create table if not exists public.word_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  sentence text not null,
  source_kind text not null check (source_kind in ('reading', 'exercise', 'grammar')),
  source_id text,
  created_at timestamptz not null default now(),
  unique (user_id, word_id, sentence)
);

create index if not exists idx_word_context_user_word
  on public.word_context(user_id, word_id, created_at desc);

alter table public.word_context enable row level security;

drop policy if exists word_context_select_own on public.word_context;
create policy word_context_select_own on public.word_context
for select using (user_id = auth.uid());

drop policy if exists word_context_insert_own on public.word_context;
create policy word_context_insert_own on public.word_context
for insert with check (user_id = auth.uid());

-- Las tarjetas que entran por un mazo reciben material para las tres
-- habilidades que no dependen de una frase. Las derivadas quedan suspendidas
-- hasta que reconocimiento tenga suficiente estabilidad.
create or replace function public.initialize_word_skill_states()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.learner_skill_state (user_id, target_kind, target_id, skill, suspended)
  values
    (new.user_id, 'word', new.word_id, 'recognition', false),
    (new.user_id, 'word', new.word_id, 'recall', true),
    (new.user_id, 'word', new.word_id, 'listening', true)
  on conflict (user_id, target_kind, target_id, skill) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_word_skill_states_on_card on public.srs_cards;
create trigger initialize_word_skill_states_on_card
after insert on public.srs_cards
for each row execute function public.initialize_word_skill_states();

-- Si el contexto aparece después de la tarjeta, también crea la habilidad de
-- lectura. La unicidad del contexto evita duplicar el mismo ejemplo.
create or replace function public.initialize_reading_skill_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.srs_cards
    where user_id = new.user_id and word_id = new.word_id
  ) then
    insert into public.learner_skill_state (user_id, target_kind, target_id, skill, suspended)
    values (new.user_id, 'word', new.word_id, 'reading', true)
    on conflict (user_id, target_kind, target_id, skill) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists initialize_reading_skill_state_on_context on public.word_context;
create trigger initialize_reading_skill_state_on_context
after insert on public.word_context
for each row execute function public.initialize_reading_skill_state();

-- Las habilidades derivadas arrancan suspendidas y se liberan cuando la de
-- reconocimiento tiene estabilidad suficiente: producir o reconocer de oído
-- algo que todavía no se reconoce escrito es frustración, no práctica.
create or replace function public.unlock_derived_skills(p_min_stability numeric default 7)
returns integer
language sql
security definer
set search_path = public
as $$
  with unlocked as (
    update public.learner_skill_state s
    set suspended = false, updated_at = now()
    where s.user_id = auth.uid()
      and s.skill <> 'recognition'
      and s.suspended
      and exists (
        select 1 from public.learner_skill_state base
        where base.user_id = s.user_id
          and base.target_kind = s.target_kind
          and base.target_id = s.target_id
          and base.skill = 'recognition'
          and coalesce(base.stability, 0) >= p_min_stability
      )
    returning 1
  )
  select count(*)::integer from unlocked;
$$;

grant execute on function public.unlock_derived_skills(numeric) to authenticated;
