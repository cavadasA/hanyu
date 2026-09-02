--
-- El progreso vivía en srs_cards (un estado de memoria por palabra) y en
-- review_log (solo valoraciones). Eso impide tres cosas que el producto
-- necesita: deshacer una valoración de verdad, programar reconocimiento y
-- escucha por separado, y decidir qué contenido conviene mañana.
--
-- Este es el sustrato. No cambia ningún algoritmo.

create type public.learning_skill as enum (
  'recognition',  -- hanzi -> significado
  'recall',       -- significado -> hanzi
  'listening',    -- audio -> palabra
  'reading',      -- frase en contexto -> palabra
  'production'    -- escribir o hablar; todavía sin generador, llega en el Plan 6
);

create type public.learning_target_kind as enum ('word', 'grammar', 'character');

create type public.learning_event_kind as enum (
  'review_rated',
  'review_reverted',
  'exercise_attempted',
  'word_looked_up',
  'reading_completed',
  'hint_used'
);

-- Append-only por diseño. Nunca se actualiza ni se borra una fila: una
-- corrección es un evento nuevo que apunta al anterior con reverts_event_id.
-- Las políticas RLS deliberadamente no conceden update ni delete.
create table if not exists public.learning_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  kind public.learning_event_kind not null,
  target_kind public.learning_target_kind,
  target_id bigint,
  skill public.learning_skill,
  payload jsonb not null default '{}'::jsonb,
  -- Idempotencia para la cola offline, mismo patrón que review_log.client_review_id.
  client_event_id uuid,
  reverts_event_id uuid references public.learning_event(id),
  constraint learning_event_target_complete
    check ((target_kind is null) = (target_id is null))
);

create unique index if not exists learning_event_user_client_unique
  on public.learning_event(user_id, client_event_id)
  where client_event_id is not null;

create index if not exists idx_learning_event_user_time
  on public.learning_event(user_id, occurred_at desc);

create index if not exists idx_learning_event_user_target
  on public.learning_event(user_id, target_kind, target_id, occurred_at desc);

alter table public.learning_event enable row level security;

drop policy if exists learning_event_select_own on public.learning_event;
create policy learning_event_select_own on public.learning_event
for select using (user_id = auth.uid());

drop policy if exists learning_event_insert_own on public.learning_event;
create policy learning_event_insert_own on public.learning_event
for insert with check (user_id = auth.uid());

-- Sin políticas de update ni delete: el log es inmutable incluso para su dueño.

-- Un usuario no "sabe" una palabra: la reconoce, la produce, la oye o la lee
-- en contexto. Colapsar las cuatro en un único srs_cards hace que un Easy en
-- reconocimiento retrase también la práctica de escucha.
--
-- Las columnas llevan los nombres de FSRS porque es el algoritmo que las va a
-- gobernar (Plan 4). Este plan solo las rellena desde el estado SM-2 actual.
create table if not exists public.learner_skill_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_kind public.learning_target_kind not null,
  target_id bigint not null,
  skill public.learning_skill not null,
  difficulty numeric,
  stability numeric,
  retrievability numeric,
  reps integer not null default 0,
  lapses integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  suspended boolean not null default false,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_kind, target_id, skill)
);

create index if not exists idx_skill_state_due
  on public.learner_skill_state(user_id, skill, next_review_at)
  where not suspended;

alter table public.learner_skill_state enable row level security;

drop policy if exists skill_state_select_own on public.learner_skill_state;
create policy skill_state_select_own on public.learner_skill_state
for select using (user_id = auth.uid());

drop policy if exists skill_state_insert_own on public.learner_skill_state;
create policy skill_state_insert_own on public.learner_skill_state
for insert with check (user_id = auth.uid());

drop policy if exists skill_state_update_own on public.learner_skill_state;
create policy skill_state_update_own on public.learner_skill_state
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Traslado del estado existente. Todo lo aprendido hasta hoy se midió con
-- tarjetas de reconocimiento, así que va a esa habilidad y solo a esa.
insert into public.learner_skill_state (
  user_id, target_kind, target_id, skill,
  difficulty, stability, reps, last_reviewed_at, next_review_at
)
select
  c.user_id,
  'word'::public.learning_target_kind,
  c.word_id,
  'recognition'::public.learning_skill,
  c.ease_factor,
  c.interval_days,
  c.repetitions,
  c.last_reviewed_at,
  c.next_review_at
from public.srs_cards c
on conflict (user_id, target_kind, target_id, skill) do nothing;

-- Registro común de contenido. Una lectura, un diálogo, una microlección o un
-- ejercicio son la misma cosa desde el punto de vista del planificador: algo
-- que se le puede proponer al usuario y que enseña elementos concretos.
create type public.content_kind as enum (
  'reading',
  'dialogue',
  'lesson',
  'exercise'
);

create table if not exists public.content_item (
  id uuid primary key default gen_random_uuid(),
  kind public.content_kind not null,
  hsk_level integer not null check (hsk_level between 1 and 3),
  title text not null,
  -- Puntero a la fila concreta de generated_readings o generated_exercises.
  -- Es texto y no una clave foránea porque apunta a tablas distintas según kind.
  source_table text,
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_item_kind_level
  on public.content_item(kind, hsk_level);

-- Un contenido enseña elementos concretos. `role` distingue lo que introduce
-- de lo que da por sabido: una lectura de nivel adecuado repasa mucho e
-- introduce poco, y esa proporción es justo lo que el planificador necesita.
create type public.teaches_role as enum ('target', 'reinforces', 'assumes');

create table if not exists public.content_teaches (
  content_id uuid not null references public.content_item(id) on delete cascade,
  target_kind public.learning_target_kind not null,
  target_id bigint not null,
  role public.teaches_role not null default 'reinforces',
  primary key (content_id, target_kind, target_id)
);

create index if not exists idx_content_teaches_target
  on public.content_teaches(target_kind, target_id, role);

alter table public.content_item enable row level security;
alter table public.content_teaches enable row level security;

drop policy if exists content_item_select_authenticated on public.content_item;
create policy content_item_select_authenticated on public.content_item
for select using (auth.role() = 'authenticated');

drop policy if exists content_teaches_select_authenticated on public.content_teaches;
create policy content_teaches_select_authenticated on public.content_teaches
for select using (auth.role() = 'authenticated');

create table if not exists public.exercise_template (
  type text primary key,
  skill public.learning_skill not null,
  description text not null
);

-- La habilidad es la que el ejercicio *demuestra*, no la que parece.
-- multiple_choice enseña a discriminar entre opciones, que es reconocimiento;
-- fill_blank exige recuperar la palabra desde el contexto de la frase, que es
-- lectura; dictation parte de audio; reorder produce lengua a partir de piezas.
insert into public.exercise_template (type, skill, description) values
  ('multiple_choice', 'recognition', 'Elegir el significado o la forma correcta entre varias opciones.'),
  ('matching',        'recognition', 'Emparejar formas escritas con sus significados.'),
  ('fill_blank',      'reading',     'Recuperar la palabra que falta a partir del contexto de la frase.'),
  ('reorder',         'production',  'Construir una frase correcta ordenando sus piezas.'),
  ('dictation',       'listening',   'Escribir lo que se oye, en hanzi o en pinyin.')
on conflict (type) do update
  set skill = excluded.skill, description = excluded.description;

alter table public.exercise_template enable row level security;

drop policy if exists exercise_template_select_authenticated on public.exercise_template;
create policy exercise_template_select_authenticated on public.exercise_template
for select using (auth.role() = 'authenticated');

create table if not exists public.grammar_prerequisite (
  hsk_level integer not null,
  code text not null,
  requires_level integer not null,
  requires_code text not null,
  primary key (hsk_level, code, requires_level, requires_code)
);

alter table public.grammar_prerequisite enable row level security;

drop policy if exists grammar_prerequisite_select_authenticated on public.grammar_prerequisite;
create policy grammar_prerequisite_select_authenticated on public.grammar_prerequisite
for select using (auth.role() = 'authenticated');
