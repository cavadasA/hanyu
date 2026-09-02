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
