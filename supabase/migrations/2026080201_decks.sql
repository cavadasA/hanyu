-- Multiple decks: templates (catalog), user decks, membership.

create table if not exists public.deck_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text not null check (category in ('hsk','theme')),
  hsk_level int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_template_words (
  template_id uuid not null references public.deck_templates(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  sort_order int not null default 0,
  primary key (template_id, word_id)
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  source_template_id uuid references public.deck_templates(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, word_id)
);

create index if not exists idx_decks_user on public.decks(user_id);
create index if not exists idx_deck_cards_word on public.deck_cards(word_id);

alter table public.deck_templates enable row level security;
alter table public.deck_template_words enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

-- Catalog is world-readable to signed-in users, no writes.
create policy deck_templates_read on public.deck_templates
  for select to authenticated using (true);
create policy deck_template_words_read on public.deck_template_words
  for select to authenticated using (true);

-- User owns their decks.
create policy decks_owner on public.decks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Membership follows deck ownership.
create policy deck_cards_owner on public.deck_cards
  for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid()));