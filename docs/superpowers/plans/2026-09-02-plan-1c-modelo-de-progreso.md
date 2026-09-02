# Plan 1C — Modelo de progreso: eventos, habilidades y qué enseña cada contenido

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada interacción declare qué demuestra y cada contenido declare qué enseña, sobre un registro de eventos irreversible del que se pueda recalcular el estado de memoria por habilidad.

**Architecture:** Hoy el progreso vive en `srs_cards`, una fila por palabra con un único estado de memoria, y en `review_log`, que registra valoraciones pero no el resto de lo que el usuario hace. Eso hace imposibles tres cosas que planes posteriores necesitan: deshacer una valoración de verdad (Plan 3), programar reconocimiento y escucha por separado (Plan 4) y decidir qué contenido conviene mañana (Plan 5). Este plan añade la capa que falta sin tocar todavía el algoritmo: un log append-only (`learning_event`), estado de memoria por habilidad (`learner_skill_state`), y un registro de contenido con lo que enseña (`content_item` + `content_teaches`).

**Tech Stack:** Node 26 (`.nvmrc`), vitest, TypeScript en `packages/*`, Supabase (Postgres), RPC en PL/pgSQL.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 1B** para la gramática oficial con `code`, `group`, `category` y `detail`, y para `hsk_characters`.
- **Este plan no cambia ningún algoritmo.** No toca SM-2, no introduce FSRS, no altera el comportamiento visible de la app. Añade el sustrato sobre el que los Planes 3, 4 y 5 trabajan. Si al terminar la app se comporta distinto, algo se ha colado.
- **`learning_event` es append-only.** No se actualiza ni se borra ninguna fila jamás. Una corrección es un evento nuevo que apunta al anterior. Esa es la propiedad que hace posible el Undo real del Plan 3.
- **Prohibido escribir mitigaciones.**

## Por qué estas entidades y no las del maestro

El plan maestro listaba también `competency` y `exercise_template` como tablas. Al aterrizarlo:

- **`competency` no se crea.** Sería una tabla vacía. El sílabo describe temas y tareas comunicativas en prosa dentro del PDF, no en lista, así que no hay nada que importar (el Plan 1B lo deja anotado). Lo que sí existe es la taxonomía del propio esquema de gramática —`语素`, `词类`, `短语`, `固定格式`, `句子成分`, `句子的类型`, `动作的态`, `特殊表达法`— que el Plan 1B ya guarda en las columnas `group` y `category`. Esa es la clasificación oficial, y usarla es más honesto que inventar una taxonomía paralela vacía.
- **`exercise_template` sí se crea**, pero pequeño: su única razón de ser es declarar qué habilidad evalúa cada tipo de ejercicio. Sin eso, un acierto en `dictation` y uno en `multiple_choice` alimentan el mismo estado, que es exactamente el defecto que el Plan 4 viene a corregir en flashcards.

## Las cinco habilidades

Una palabra no se sabe o no se sabe: se reconoce, se produce, se oye o se lee en contexto. El sílabo trata escuchar, hablar, leer y escribir como competencias distintas, y la auditoría señala que la app las colapsa en un solo estado.

| Habilidad | Estímulo → respuesta | Quién la produce hoy |
|---|---|---|
| `recognition` | hanzi → significado | modo Recognition de las tarjetas |
| `recall` | significado → hanzi | modo Recall de las tarjetas |
| `listening` | audio → palabra | modo Listening de las tarjetas |
| `reading` | frase en contexto → palabra | lecturas y ejercicios `fill_blank` |
| `production` | escribir o hablar | todavía nada; llega con el Plan 6 |

`production` se declara ahora aunque nada la genere. No es especulación: es el valor que el Plan 6 escribirá, y dejar el enum incompleto obligaría a una migración de tipo enum en mitad de ese plan.

## Estado de partida verificado

- `srs_cards` tiene una fila por `(user_id, word_id)` con `ease_factor`, `interval_days`, `repetitions`, `status`, `next_review_at` y `version`.
- `review_log` registra `quality` y `time_ms`, y desde la migración de sincronización offline tiene `client_review_id` con índice único parcial `(user_id, client_review_id) where client_review_id is not null`. Ese es el patrón de idempotencia que este plan reutiliza.
- El esquema oficial de gramática numera las etapas de una misma familia en los **títulos de sección**: `“是”字句1` en HSK 1 y `“是”字句2` en HSK 2; `比较句1` en HSK 2 y `比较句2` en HSK 3. Medido sobre los tres niveles: **18 familias con más de una etapa**. Los dígitos que aparecen dentro de las **viñetas** (`还2`, `因为1`, `跟2`) son índices de sentido léxico, no etapas: la distinción es sintáctica y el parser la respeta.

## File Structure

**Se crean:**
- `supabase/migrations/2026090203_progress_model.sql`
- `packages/data/src/repositories/events.ts` — escritura y lectura del log.
- `packages/data/src/repositories/events.test.ts`
- `packages/data/src/repositories/skills.ts` — estado de memoria por habilidad.
- `packages/data/src/repositories/skills.test.ts`
- `scripts/lib/grammar-prerequisites.js` — deriva prerrequisitos de los índices de etapa.
- `scripts/lib/grammar-prerequisites.test.js`
- `server/db/seeds/grammar-prerequisites.json`

**Se modifican:**
- `packages/data/src/types.ts`, `database.types.ts`, `factory.ts`
- `scripts/import-syllabus.js`, `scripts/build-supabase-seed.js`

---

## Task 1: El registro de eventos de aprendizaje

**Files:**
- Create: `supabase/migrations/2026090203_progress_model.sql`
- Create: `packages/data/src/repositories/events.ts`, `packages/data/src/repositories/events.test.ts`
- Modify: `packages/data/src/types.ts`, `packages/data/src/factory.ts`

**Interfaces:**
- Produces:
  - `type LearningSkill = 'recognition' | 'recall' | 'listening' | 'reading' | 'production'`
  - `type LearningEventKind = 'review_rated' | 'review_reverted' | 'exercise_attempted' | 'word_looked_up' | 'reading_completed' | 'hint_used'`
  - `type LearningTargetKind = 'word' | 'grammar' | 'character'`
  - `recordEvent(input: RecordEventInput, client): Promise<LearningEvent>`
  - `getEvents(params: { target_kind?, target_id?, since?, limit? }, client): Promise<LearningEvent[]>`

  Los consumen las Tareas 2 y 4, el Plan 3 (Undo) y el Plan 9 (analítica).

El log es la pieza que desbloquea el Plan 3. Hoy Undo solo mueve arrays en memoria porque no hay nada que permita reconstruir el estado anterior de una tarjeta. Con un registro append-only, deshacer deja de ser "borrar lo que pasó" y pasa a ser "registrar que aquello no cuenta", que es lo único correcto cuando la escritura ya se propagó a `srs_cards` y `user_stats`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026090203_progress_model.sql
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
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/data/src/repositories/events.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getEvents, recordEvent } from './events';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle',
  ];

  const chain: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function clientFor(perTable: Record<string, Record<string, unknown>>) {
  const chains: Record<string, any> = {};
  return {
    auth: auth(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

const eventRow = {
  id: 'e1',
  user_id: 'u1',
  occurred_at: '2026-09-02T10:00:00.000Z',
  recorded_at: '2026-09-02T10:00:01.000Z',
  kind: 'review_rated',
  target_kind: 'word',
  target_id: 42,
  skill: 'recognition',
  payload: { quality: 4, time_ms: 3200 },
  client_event_id: 'c1',
  reverts_event_id: null,
};

describe('events repository', () => {
  it('recordEvent stamps the current user and returns the stored event', async () => {
    const client = clientFor({ learning_event: { data: eventRow, error: null } });

    const event = await recordEvent(
      {
        kind: 'review_rated',
        target_kind: 'word',
        target_id: 42,
        skill: 'recognition',
        payload: { quality: 4, time_ms: 3200 },
        client_event_id: 'c1',
        occurred_at: '2026-09-02T10:00:00.000Z',
      },
      client,
    );

    expect(event.id).toBe('e1');
    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', kind: 'review_rated', target_id: 42 }),
    );
  });

  it('recordEvent rejects a target id without a target kind', async () => {
    const client = clientFor({});

    await expect(
      recordEvent({ kind: 'word_looked_up', target_id: 42 } as never, client),
    ).rejects.toThrow(/target_kind/);
  });

  it('recordEvent rejects a revert that does not name the event it reverts', async () => {
    const client = clientFor({});

    await expect(
      recordEvent({ kind: 'review_reverted', target_kind: 'word', target_id: 42 }, client),
    ).rejects.toThrow(/reverts_event_id/);
  });

  it('getEvents filters by target and returns newest first', async () => {
    const client = clientFor({ learning_event: { data: [eventRow], error: null } });

    const events = await getEvents({ target_kind: 'word', target_id: 42, limit: 10 }, client);

    expect(events).toHaveLength(1);
    expect(client.chains.learning_event.order).toHaveBeenCalledWith('occurred_at', {
      ascending: false,
    });
  });
});
```

Run: `npx vitest run packages/data/src/repositories/events.test.ts`
Expected: FAIL — no existe `./events`.

- [ ] **Step 3: Write minimal implementation**

En `packages/data/src/types.ts`:

```ts
export type LearningSkill =
  | 'recognition'
  | 'recall'
  | 'listening'
  | 'reading'
  | 'production';

export type LearningTargetKind = 'word' | 'grammar' | 'character';

export type LearningEventKind =
  | 'review_rated'
  | 'review_reverted'
  | 'exercise_attempted'
  | 'word_looked_up'
  | 'reading_completed'
  | 'hint_used';

export interface LearningEvent {
  id: string;
  user_id: string;
  occurred_at: string;
  recorded_at: string;
  kind: LearningEventKind;
  target_kind: LearningTargetKind | null;
  target_id: number | null;
  skill: LearningSkill | null;
  payload: Record<string, unknown>;
  client_event_id: string | null;
  reverts_event_id: string | null;
}
```

```ts
// packages/data/src/repositories/events.ts
//
// El registro de aprendizaje es append-only: nunca se actualiza ni se borra
// una fila. Deshacer una valoración no es borrar lo que pasó —la escritura ya
// se propagó a srs_cards y user_stats— sino registrar que aquello no cuenta,
// para poder recalcular el estado desde el historial válido.
import type { HanyuClient } from '../client';
import type {
  LearningEvent,
  LearningEventKind,
  LearningSkill,
  LearningTargetKind,
} from '../types';
import { createRepositoryError, getRequiredUserId } from './shared';

const COLUMNS =
  'id, user_id, occurred_at, recorded_at, kind, target_kind, target_id, skill, payload, client_event_id, reverts_event_id';

export interface RecordEventInput {
  kind: LearningEventKind;
  target_kind?: LearningTargetKind;
  target_id?: number;
  skill?: LearningSkill;
  payload?: Record<string, unknown>;
  client_event_id?: string;
  occurred_at?: string;
  reverts_event_id?: string;
}

export async function recordEvent(
  input: RecordEventInput,
  client: HanyuClient,
): Promise<LearningEvent> {
  // Un objetivo a medias no es registrable: la restricción existe también en
  // la base, pero fallar aquí da un mensaje que dice qué falta.
  const hasKind = input.target_kind !== undefined;
  const hasId = input.target_id !== undefined;
  if (hasKind !== hasId) {
    throw new Error('recordEvent requiere target_kind y target_id juntos, o ninguno de los dos');
  }

  if (input.kind === 'review_reverted' && !input.reverts_event_id) {
    throw new Error('un evento review_reverted debe indicar reverts_event_id');
  }

  const userId = await getRequiredUserId(client);

  const { data, error } = await client
    .from('learning_event')
    .insert({
      user_id: userId,
      kind: input.kind,
      target_kind: input.target_kind ?? null,
      target_id: input.target_id ?? null,
      skill: input.skill ?? null,
      payload: input.payload ?? {},
      client_event_id: input.client_event_id ?? null,
      reverts_event_id: input.reverts_event_id ?? null,
      ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
    } as any)
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to record learning event');
  }

  return data as unknown as LearningEvent;
}

export interface GetEventsInput {
  target_kind?: LearningTargetKind;
  target_id?: number;
  kind?: LearningEventKind;
  since?: string;
  limit?: number;
}

export async function getEvents(
  params: GetEventsInput,
  client: HanyuClient,
): Promise<LearningEvent[]> {
  const userId = await getRequiredUserId(client);

  let query = client
    .from('learning_event')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, params.limit ?? 100)));

  if (params.target_kind) query = query.eq('target_kind', params.target_kind);
  if (params.target_id !== undefined) query = query.eq('target_id', params.target_id);
  if (params.kind) query = query.eq('kind', params.kind);
  if (params.since) query = query.gte('occurred_at', params.since);

  const { data, error } = await query;

  if (error) {
    throw createRepositoryError(error, 'Failed to load learning events');
  }

  return (data ?? []) as unknown as LearningEvent[];
}
```

En `packages/data/src/factory.ts`, añade el import y la superficie:

```ts
import { getEvents, recordEvent } from './repositories/events';
```

```ts
    events: {
      recordEvent: (input: Parameters<typeof recordEvent>[0]) => recordEvent(input, client),
      getEvents: (params: Parameters<typeof getEvents>[0] = {}) => getEvents(params, client),
    },
```

Añade a `packages/data/src/database.types.ts` la tabla `learning_event` con sus bloques `Row`, `Insert` y `Update`, siguiendo el patrón de `review_log`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS, con 4 tests nuevos en `events.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026090203_progress_model.sql packages/data/src
git commit -m "feat(data): registro append-only de eventos de aprendizaje"
```

---

## Task 2: Estado de memoria por habilidad

**Files:**
- Modify: `supabase/migrations/2026090203_progress_model.sql`
- Create: `packages/data/src/repositories/skills.ts`, `packages/data/src/repositories/skills.test.ts`
- Modify: `packages/data/src/types.ts`, `packages/data/src/factory.ts`

**Interfaces:**
- Consumes: `LearningSkill`, `LearningTargetKind` (Tarea 1).
- Produces:
  - `getSkillStates(params: { target_kind, target_ids }, client): Promise<LearnerSkillState[]>`
  - `upsertSkillState(input: UpsertSkillStateInput, client): Promise<LearnerSkillState>`

  Los consume el Plan 4 (FSRS) y el Plan 5 (planificador).

Las columnas se llaman `difficulty`, `stability` y `retrievability` porque son los tres parámetros de FSRS, que llega en el Plan 4. Crearlas ahora con nombres neutros y renombrarlas después sería una migración extra sin ninguna ganancia. Este plan las rellena con el equivalente de SM-2 y no las usa para programar nada.

- [ ] **Step 1: Extend the migration**

Añade al final de `supabase/migrations/2026090203_progress_model.sql`:

```sql
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
-- tarjetas de reconocimiento, así que va a esa habilidad y solo a esa:
-- inventar un estado de escucha que nadie ha demostrado sería peor que no
-- tener ninguno.
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
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/data/src/repositories/skills.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getSkillStates, upsertSkillState } from './skills';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle',
  ];

  const chain: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function clientFor(perTable: Record<string, Record<string, unknown>>) {
  const chains: Record<string, any> = {};
  return {
    auth: auth(),
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

const stateRow = {
  id: 's1',
  user_id: 'u1',
  target_kind: 'word',
  target_id: 42,
  skill: 'recognition',
  difficulty: 2.5,
  stability: 6,
  retrievability: null,
  reps: 3,
  lapses: 0,
  last_reviewed_at: '2026-09-01T10:00:00.000Z',
  next_review_at: '2026-09-07T10:00:00.000Z',
  suspended: false,
  version: 2,
};

describe('skills repository', () => {
  it('getSkillStates asks only for the requested targets', async () => {
    const client = clientFor({ learner_skill_state: { data: [stateRow], error: null } });

    const states = await getSkillStates({ target_kind: 'word', target_ids: [42, 43] }, client);

    expect(states).toHaveLength(1);
    expect(client.chains.learner_skill_state.in).toHaveBeenCalledWith('target_id', [42, 43]);
  });

  it('getSkillStates returns an empty list without querying when there are no targets', async () => {
    const client = clientFor({});

    const states = await getSkillStates({ target_kind: 'word', target_ids: [] }, client);

    expect(states).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('upsertSkillState keys on user, target and skill', async () => {
    const client = clientFor({ learner_skill_state: { data: stateRow, error: null } });

    await upsertSkillState(
      { target_kind: 'word', target_id: 42, skill: 'listening', stability: 1 },
      client,
    );

    expect(client.chains.learner_skill_state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', target_id: 42, skill: 'listening' }),
      { onConflict: 'user_id,target_kind,target_id,skill' },
    );
  });
});
```

Run: `npx vitest run packages/data/src/repositories/skills.test.ts`
Expected: FAIL — no existe `./skills`.

- [ ] **Step 3: Write minimal implementation**

En `packages/data/src/types.ts`:

```ts
export interface LearnerSkillState {
  id: string;
  user_id: string;
  target_kind: LearningTargetKind;
  target_id: number;
  skill: LearningSkill;
  difficulty: number | null;
  stability: number | null;
  retrievability: number | null;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  suspended: boolean;
  version: number;
}
```

```ts
// packages/data/src/repositories/skills.ts
//
// Un estado por (usuario, objetivo, habilidad). El Plan 4 sustituirá SM-2 por
// FSRS sobre esta tabla; aquí solo se lee y se escribe.
import type { HanyuClient } from '../client';
import type { LearnerSkillState, LearningSkill, LearningTargetKind } from '../types';
import { createRepositoryError, getRequiredUserId } from './shared';

const COLUMNS =
  'id, user_id, target_kind, target_id, skill, difficulty, stability, retrievability, reps, lapses, last_reviewed_at, next_review_at, suspended, version';

export interface GetSkillStatesInput {
  target_kind: LearningTargetKind;
  target_ids: number[];
  skill?: LearningSkill;
}

export async function getSkillStates(
  params: GetSkillStatesInput,
  client: HanyuClient,
): Promise<LearnerSkillState[]> {
  // Sin objetivos no hay nada que preguntar. Consultar `in ()` con una lista
  // vacía es un viaje a la red que siempre devuelve cero filas.
  if (params.target_ids.length === 0) {
    return [];
  }

  const userId = await getRequiredUserId(client);

  let query = client
    .from('learner_skill_state')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('target_kind', params.target_kind)
    .in('target_id', params.target_ids);

  if (params.skill) {
    query = query.eq('skill', params.skill);
  }

  const { data, error } = await query;

  if (error) {
    throw createRepositoryError(error, 'Failed to load skill states');
  }

  return (data ?? []) as unknown as LearnerSkillState[];
}

export interface UpsertSkillStateInput {
  target_kind: LearningTargetKind;
  target_id: number;
  skill: LearningSkill;
  difficulty?: number | null;
  stability?: number | null;
  retrievability?: number | null;
  reps?: number;
  lapses?: number;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  suspended?: boolean;
}

export async function upsertSkillState(
  input: UpsertSkillStateInput,
  client: HanyuClient,
): Promise<LearnerSkillState> {
  const userId = await getRequiredUserId(client);

  const { data, error } = await client
    .from('learner_skill_state')
    .upsert(
      { user_id: userId, updated_at: new Date().toISOString(), ...input } as any,
      { onConflict: 'user_id,target_kind,target_id,skill' },
    )
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to save skill state');
  }

  return data as unknown as LearnerSkillState;
}
```

En `factory.ts`:

```ts
import { getSkillStates, upsertSkillState } from './repositories/skills';
```

```ts
    skills: {
      getSkillStates: (params: Parameters<typeof getSkillStates>[0]) =>
        getSkillStates(params, client),
      upsertSkillState: (input: Parameters<typeof upsertSkillState>[0]) =>
        upsertSkillState(input, client),
    },
```

Añade `learner_skill_state` a `database.types.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026090203_progress_model.sql packages/data/src
git commit -m "feat(data): estado de memoria separado por habilidad"
```

---

## Task 3: Qué enseña cada contenido

**Files:**
- Modify: `supabase/migrations/2026090203_progress_model.sql`
- Modify: `packages/data/src/types.ts`, `packages/data/src/database.types.ts`

**Interfaces:**
- Produces: tablas `content_item` y `content_teaches`, y el tipo `ContentItem`. Los consumen los Planes 5, 6, 7 y 8.

La auditoría lo resume en una frase: *cada contenido declara qué enseña y cada interacción declara qué demuestra*. La Tarea 1 cubrió la segunda mitad; ésta cubre la primera. Sin ella, el planificador del Plan 5 no puede recomendar una lectura "porque practica 比 y contiene 6 palabras que estás aprendiendo": no hay dónde consultarlo.

Hoy `generated_readings` y `generated_exercises` existen como tablas sueltas sin nada que declare su contenido pedagógico. `content_item` es el registro común, y `content_teaches` el enlace muchos a muchos con palabras, gramática y caracteres.

- [ ] **Step 1: Extend the migration**

```sql
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
```

- [ ] **Step 2: Add the types**

En `packages/data/src/types.ts`:

```ts
export type ContentKind = 'reading' | 'dialogue' | 'lesson' | 'exercise';
export type TeachesRole = 'target' | 'reinforces' | 'assumes';

export interface ContentItem {
  id: string;
  kind: ContentKind;
  hsk_level: HskLevel;
  title: string;
  source_table: string | null;
  source_id: string | null;
}

export interface ContentTeaches {
  content_id: string;
  target_kind: LearningTargetKind;
  target_id: number;
  role: TeachesRole;
}
```

Y las tablas correspondientes en `database.types.ts`.

- [ ] **Step 3: Verify and commit**

No se escribe repositorio en esta tarea: nada lo consume todavía, y un repositorio sin consumidor es código muerto que además habría que mantener. Los Planes 7 y 8 lo escriben cuando llenan el catálogo.

Run: `npm test`
Expected: los 5 pasos en PASS.

```bash
git add supabase/migrations/2026090203_progress_model.sql packages/data/src
git commit -m "feat(db): registro de contenido con lo que enseña cada elemento"
```

---

## Task 4: Qué habilidad evalúa cada tipo de ejercicio

**Files:**
- Modify: `supabase/migrations/2026090203_progress_model.sql`
- Modify: `packages/data/src/types.ts`

**Interfaces:**
- Produces: tabla `exercise_template` con la habilidad de cada tipo. La consumen los Planes 5 y 6.

Sin esto, un acierto en dictado y uno en opción múltiple alimentan el mismo estado. La tabla es pequeña a propósito: solo declara la correspondencia entre los cinco tipos que ya existen y la habilidad que cada uno demuestra de verdad.

- [ ] **Step 1: Extend the migration**

```sql
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
```

- [ ] **Step 2: Verify and commit**

Run: `npm test`
Expected: los 5 pasos en PASS.

```bash
git add supabase/migrations/2026090203_progress_model.sql
git commit -m "feat(db): declarar qué habilidad evalúa cada tipo de ejercicio"
```

---

## Task 5: Prerrequisitos de gramática derivados del sílabo

**Files:**
- Create: `scripts/lib/grammar-prerequisites.js`, `scripts/lib/grammar-prerequisites.test.js`
- Create: `server/db/seeds/grammar-prerequisites.json`
- Modify: `scripts/import-syllabus.js`, `scripts/build-supabase-seed.js`, `supabase/migrations/2026090203_progress_model.sql`

**Interfaces:**
- Consumes: `loadOfficialGrammar` (Plan 1B).
- Produces: `deriveGrammarPrerequisites(points): Array<{ code, hsk_level, requires_code, requires_level }>`. Lo consume el Plan 5 (unidades y ruta curricular).

**Los prerrequisitos no se inventan: están en el dato oficial.** El esquema numera las etapas de una misma familia en los títulos de sección — `“是”字句1` en HSK 1 y `“是”字句2` en HSK 2; `比较句1` en HSK 2 y `比较句2` en HSK 3. Medido sobre los tres niveles hay 18 familias con más de una etapa.

La distinción crítica es sintáctica: los dígitos en **títulos de sección** son etapas de una familia; los dígitos dentro de **viñetas** (`还2`, `因为1`, `跟2`) son índices de sentido léxico y no generan prerrequisitos. El parser del Plan 1B ya separa una cosa de la otra, porque el título va en `title` y las viñetas en `items`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/grammar-prerequisites.test.js
import { deriveGrammarPrerequisites, splitStageIndex } from './grammar-prerequisites.js';

describe('splitStageIndex', () => {
  it('separa la familia de su etapa', () => {
    expect(splitStageIndex('比较句1')).toEqual({ family: '比较句', stage: 1 });
    expect(splitStageIndex('“是……的”句2')).toEqual({ family: '“是……的”句', stage: 2 });
  });

  it('devuelve etapa null cuando el título no está numerado', () => {
    expect(splitStageIndex('动词重叠')).toEqual({ family: '动词重叠', stage: null });
  });
});

describe('deriveGrammarPrerequisites', () => {
  const points = [
    { code: '6.3.1', hsk_level: 1, title: '“是”字句1', items: [] },
    { code: '6.3.1', hsk_level: 2, title: '“是”字句2', items: [] },
    { code: '6.3.4', hsk_level: 2, title: '比较句1', items: [] },
    { code: '6.3.4', hsk_level: 3, title: '比较句2', items: [] },
    { code: '2.2.1', hsk_level: 2, title: '动词重叠', items: ['AA、A一A'] },
  ];

  it('encadena cada etapa con la inmediatamente anterior de su familia', () => {
    expect(deriveGrammarPrerequisites(points)).toEqual([
      { code: '6.3.1', hsk_level: 2, requires_code: '6.3.1', requires_level: 1 },
      { code: '6.3.4', hsk_level: 3, requires_code: '6.3.4', requires_level: 2 },
    ]);
  });

  it('no inventa prerrequisitos para familias de una sola etapa', () => {
    const single = deriveGrammarPrerequisites([points[4]]);

    expect(single).toEqual([]);
  });

  it('ignora los índices de sentido léxico que aparecen en las viñetas', () => {
    // 还2 y 因为1 son acepciones de palabras dentro de los ítems, no etapas.
    const withItems = [
      { code: '2.7.3', hsk_level: 2, title: '时间副词', items: ['还2、已经、有时（候）'] },
      { code: '2.9.2', hsk_level: 2, title: '连接分句或者句子', items: ['因为2、所以'] },
    ];

    expect(deriveGrammarPrerequisites(withItems)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/grammar-prerequisites.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/grammar-prerequisites.js
//
// El sílabo no declara prerrequisitos, pero sí numera las etapas de una misma
// familia gramatical en los títulos de sección: “是”字句1 en HSK 1 y “是”字句2
// en HSK 2, 比较句1 en HSK 2 y 比较句2 en HSK 3. Encadenar cada etapa con la
// anterior es leer el dato oficial, no inventar una secuencia pedagógica.
//
// Los dígitos que aparecen dentro de las viñetas (还2, 因为1, 跟2) son índices
// de sentido léxico y no se tocan aquí: el parser del sílabo los deja en
// `items`, separados del título.
const STAGE_SUFFIX = /^(.*?)([1-9])$/;

export function splitStageIndex(title) {
  const match = STAGE_SUFFIX.exec(String(title).trim());

  if (!match) {
    return { family: String(title).trim(), stage: null };
  }

  return { family: match[1], stage: Number(match[2]) };
}

export function deriveGrammarPrerequisites(points) {
  const families = new Map();

  for (const point of points) {
    const { family, stage } = splitStageIndex(point.title);
    if (stage === null) continue;

    const list = families.get(family) ?? [];
    list.push({ ...point, stage });
    families.set(family, list);
  }

  const prerequisites = [];

  for (const stages of families.values()) {
    const ordered = [...stages].sort((a, b) => a.stage - b.stage);

    for (let i = 1; i < ordered.length; i += 1) {
      const current = ordered[i];
      const previous = ordered[i - 1];

      // Una etapa posterior en el mismo nivel no es un prerrequisito de orden
      // curricular: ambas se enseñan a la vez.
      if (current.hsk_level === previous.hsk_level) continue;

      prerequisites.push({
        code: current.code,
        hsk_level: current.hsk_level,
        requires_code: previous.code,
        requires_level: previous.hsk_level,
      });
    }
  }

  return prerequisites;
}
```

En `scripts/import-syllabus.js`, después del bloque de gramática:

```js
import { deriveGrammarPrerequisites } from './lib/grammar-prerequisites.js';
```

```js
const prerequisites = deriveGrammarPrerequisites(grammar);
writeFileSync(
  join(seedDir, 'grammar-prerequisites.json'),
  JSON.stringify(prerequisites, null, 2),
  'utf8',
);
console.log(`prerrequisitos: ${prerequisites.length} -> grammar-prerequisites.json`);
```

En la migración:

```sql
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
```

Y en `scripts/build-supabase-seed.js`, un `buildInsert` más siguiendo el patrón de los otros, con `on conflict do nothing`.

- [ ] **Step 4: Verificar el resultado real**

```bash
npm run import-syllabus && node scripts/build-supabase-seed.js && npm test
```

Expected: los 5 pasos en PASS.

Mira lo que ha derivado, porque es contenido pedagógico y merece una lectura humana:

```bash
node -e "for (const p of require('./server/db/seeds/grammar-prerequisites.json')) console.log(\`L\${p.hsk_level} \${p.code} requiere L\${p.requires_level} \${p.requires_code}\`)"
```

Expected: una decena larga de líneas, entre ellas `比较句` de HSK 3 requiriendo el de HSK 2, y `“是”字句` de HSK 2 requiriendo el de HSK 1. Si aparece alguna familia que claramente no es una progresión, quítala con una lista de exclusión explícita y comentada en `grammar-prerequisites.js`; no relajes la regla general.

- [ ] **Step 5: Commit**

```bash
git add scripts/ server/db/seeds/grammar-prerequisites.json supabase/migrations/2026090203_progress_model.sql
git commit -m "feat(corpus): derivar prerrequisitos de gramática de las etapas del sílabo"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. La app se comporta exactamente igual que antes del plan. Ninguna pantalla cambia. Si algo cambió, hay una fuga entre el sustrato y el comportamiento.
3. `learning_event` acepta inserciones y las rechaza en actualización y borrado, incluso para su dueño. Comprobable en el editor SQL de Supabase con `update public.learning_event set kind = 'hint_used'`, que debe fallar por RLS.
4. `learner_skill_state` tiene una fila `recognition` por cada `srs_cards` existente, y ninguna de las otras cuatro habilidades.
5. `grammar_prerequisite` contiene las progresiones de familia derivadas del sílabo, revisadas a ojo.

## Lo que este plan deja explícitamente sin resolver

- **Nada escribe en `learning_event` todavía.** El Plan 3 conecta el ciclo de review, el Plan 6 los ejercicios y el Plan 8 las consultas de palabra en las lecturas. Crear el log antes es deliberado: el Plan 3 lo necesita para que Undo sea real.
- **`learner_skill_state` no programa nada.** Sigue mandando `srs_cards` con SM-2 hasta que el Plan 4 traslade la programación. Las dos tablas conviven durante ese intervalo, y es el Plan 4 quien retira la vieja.
- **`content_item` está vacío.** Los Planes 7 y 8 lo llenan al construir el catálogo de lecturas.
- **No hay tabla `competency`.** La taxonomía oficial vive en `grammar_points.group` y `.category`, importadas por el Plan 1B. Los temas y tareas comunicativas siguen sin extraer del PDF; es trabajo editorial pendiente.
