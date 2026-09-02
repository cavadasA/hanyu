--
-- El sílabo HSK 3.0 evalúa vocabulario, caracteres y gramática. Hasta ahora la
-- base solo conocía lo primero, así que no había forma de responder qué
-- porcentaje del examen cubre la app.

create table if not exists public.hsk_characters (
  hanzi text primary key,
  hsk_level integer not null check (hsk_level between 1 and 3)
);

create index if not exists idx_hsk_characters_level on public.hsk_characters(hsk_level);

alter table public.hsk_characters enable row level security;

drop policy if exists hsk_characters_select_authenticated on public.hsk_characters;
create policy hsk_characters_select_authenticated on public.hsk_characters
for select using (auth.role() = 'authenticated');

-- El índice de sentido convierte una fila de `words` en una acepción concreta:
-- 点1 (HSK 1), 点2 (HSK 2) y 点1 (HSK 3 en la transcripción fijada) son entradas
-- distintas del sílabo, no una palabra repetida.
alter table public.words
  add column if not exists sense_index integer,
  add column if not exists variants text[];

-- La clave pasa de (hanzi, nivel) a (hanzi, nivel, sentido): 花1 y 花2 conviven
-- en el nivel 2. Se eliminan las dos restricciones heredadas que imponían la
-- unicidad por forma y nivel.
alter table public.words drop constraint if exists words_hanzi_hsk_level_key;
alter table public.words drop constraint if exists words_hanzi_hsk_level_unique;
drop index if exists idx_words_unique_entry;
create unique index if not exists idx_words_unique_sense
  on public.words(hanzi, hsk_level, coalesce(sense_index, 0));

alter table public.grammar_points
  alter column explanation drop not null,
  add column if not exists code text,
  add column if not exists "group" text,
  add column if not exists category text,
  add column if not exists detail text,
  add column if not exists items text[];

-- La clave pasa a ser (nivel, código del sílabo): el título se repite entre
-- niveles pero el código no.
drop index if exists idx_grammar_unique_entry;
create unique index if not exists idx_grammar_unique_code
  on public.grammar_points(hsk_level, code);

grant select on public.hsk_characters to authenticated;
