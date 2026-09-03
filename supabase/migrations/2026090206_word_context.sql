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
