# Plan 4A — El motor de memoria: FSRS con una sola implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir SM-2 por FSRS con retención objetivo configurable, dejando **una sola** implementación del algoritmo, y que los cuatro botones de valoración programen de verdad cosas distintas.

**Architecture:** SM-2 está escrito tres veces: en `packages/domain/src/sm2.ts`, dentro de la RPC `review_flashcard` de tres argumentos, y otra vez dentro de la de seis. Tres copias que tienen que coincidir es la clase de bug que la auditoría señala. Este plan las reduce a una: **TypeScript calcula, el servidor guarda**. No es una concesión, es la única forma coherente con una arquitectura offline donde el cliente tiene que poder programar una tarjeta sin red. El algoritmo lo aporta `ts-fsrs`, y el estado de programación se muda de `srs_cards` a `learner_skill_state`, que el Plan 1C creó justo para esto.

**Tech Stack:** Node 26 (`.nvmrc`), `ts-fsrs` 5.4.2 (MIT, cero dependencias), vitest para `packages/*`, Jest para `apps/mobile`, Supabase (Postgres, RPC en PL/pgSQL).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos. `server/services/srs-engine.test.js` es una cuarta copia de SM-2, en el servidor legado: **no la toques y no la migres**.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 1C** (`learner_skill_state`, `learning_event`) y del **Plan 3** (el servicio offline como único puerto, y `revert_review`). Ejecutar este plan antes dejaría dos caminos de escritura programando con algoritmos distintos.
- **Prohibido escribir mitigaciones.** En particular, prohibido dejar SM-2 «por si acaso» detrás de una bandera: dos algoritmos vivos es exactamente el problema que se viene a cerrar.
- **Este plan no añade tipos de tarjeta.** Escritura, audio, cloze contextual, frase de origen y la ficha rica son el Plan 4B.

## Por qué se parte el Plan 4

El plan maestro describe el Plan 4 como un bloque. Al aterrizarlo son dos subsistemas con criterios de salida distintos:

- **4A, este documento: la programación.** Qué se muestra mañana y por qué. Se mide con retención observada.
- **4B: la recuperación activa.** Cómo se pregunta: escritura, audio, cloze, frase de origen, ficha con clasificador y ejemplos, y las cinco habilidades con estado propio. Se mide con evidencia por habilidad.

Mezclarlos daría un documento irrevisable, y el segundo depende del primero: no tiene sentido programar una tarjeta de escucha antes de que exista un planificador capaz de programar por habilidad.

## Estado de partida verificado (2 de septiembre de 2026)

- **SM-2 está tres veces**: `packages/domain/src/sm2.ts`; `supabase/migrations/202607280002_learning_rpc.sql` dentro de `review_flashcard(card_id, quality, time_ms)`; y `supabase/migrations/202607300001_offline_review_sync.sql` dentro de `review_flashcard(card_id, quality, time_ms, review_id, reviewed_at, expected_version)`. Las dos versiones SQL son copias literales del mismo bloque, comentario `-- 5. SM-2 calculation` incluido.
- Los cuatro botones de la interfaz mandan `quality` 1, 3, 4 y 5 (`RATINGS` en `FlashCardView.tsx:44`). Para una tarjeta nueva los cuatro producen `interval_days = 1`: solo cambia el ease factor.
- `srs_cards` guarda a la vez la identidad de la tarjeta (`user_id`, `word_id`) y su programación (`ease_factor`, `interval_days`, `repetitions`, `next_review_at`, `status`). `get_due_cards` ordena por `sc.next_review_at`.
- `status` se calcula con reglas fijas: `interval_days >= 21 and repetitions >= 5` da `mastered`. No hay ninguna medida de retención detrás.
- `review_log.quality` tiene `check (quality between 0 and 5)` y guarda la escala de SM-2.
- El Plan 1C dejó `learner_skill_state` con `difficulty`, `stability`, `retrievability`, `reps`, `lapses`, `last_reviewed_at`, `next_review_at`, `suspended` y `version`, y una fila `recognition` por cada `srs_cards`.

## Lo que aporta `ts-fsrs`, y lo que no

Verificado sobre la versión 5.4.2 publicada el 1 de septiembre de 2026:

- `fsrs(generatorParameters({ request_retention, learning_steps, relearning_steps, maximum_interval, enable_fuzz }))` construye el programador. **La retención objetivo es un parámetro, no algo que haya que implementar.**
- `learning_steps` y `relearning_steps` aceptan pasos en minutos (`'1m'`, `'10m'`). **La cola intradía del Alto 1 es configuración, no código nuevo**: con `enable_short_term`, un Again vuelve a programar la tarjeta dentro de la misma sesión.
- `f.repeat(card, now)` devuelve las cuatro opciones de una vez, cada una con su tarjeta resultante. **El intervalo visible sobre cada botón sale de ahí**, sin cálculo aparte ni riesgo de que lo mostrado difiera de lo aplicado.
- `f.next(card, now, grade)` aplica una y devuelve `{ card, log }`.
- `f.get_retrievability(card, now)` da la probabilidad de recuerdo. Es lo que sustituye a la regla fija de `mastered`.
- Su `Card` es `{ due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review? }` y su `State` es `New | Learning | Review | Relearning`.

**Lo que no aporta y hay que decidir aquí:** la escala. `Rating` de FSRS es `Again=1, Hard=2, Good=3, Easy=4`, y la app guarda `1, 3, 4, 5`. Los números se solapan con significados distintos —un 3 guardado es «Hard» para la app y «Good» para FSRS— así que reutilizar la columna `quality` mezclaría dos escalas en el mismo sitio y haría ilegible el historial. Se añade una columna `grade` con la escala de FSRS y se deja de escribir `quality`, que se conserva como historial de la etapa SM-2.

## File Structure

**Se crean:**
- `packages/domain/src/scheduling/schedule.ts` — la única implementación de la programación.
- `packages/domain/src/scheduling/schedule.test.ts`
- `packages/domain/src/scheduling/params.ts` — parámetros por defecto y derivados de los ajustes.
- `packages/domain/src/scheduling/params.test.ts`
- `supabase/migrations/2026090205_fsrs.sql`

**Se modifican:**
- `packages/domain/src/index.ts`, `packages/domain/package.json`
- `packages/data/src/types.ts`, `repositories/flashcards.ts`, `repositories/settings.ts`, `factory.ts`
- `apps/mobile/src/offline/OfflineReviewService.ts`, `ReviewStore.ts`
- `apps/mobile/src/screens/CardsScreen.tsx`, `apps/mobile/src/ui/FlashCardView.tsx`, `apps/mobile/src/screens/YouScreen.tsx`
- `apps/mobile/src/lib/useSessionTimer.test.ts`

**Se elimina:**
- `packages/domain/src/sm2.ts` y `sm2.test.ts`, junto con sus dos copias en SQL.

---

## Task 1: El planificador, una sola vez

**Files:**
- Create: `packages/domain/src/scheduling/params.ts`, `params.test.ts`, `schedule.ts`, `schedule.test.ts`
- Modify: `packages/domain/package.json`, `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `type Grade = 'again' | 'hard' | 'good' | 'easy'`
  - `interface SchedulingState { difficulty, stability, reps, lapses, learning_steps, scheduled_days, elapsed_days, state, due, last_review }`
  - `schedulingParams(input: { request_retention?: number }): FSRSParameters`
  - `applyReview(state, grade, now, params): { state: SchedulingState; interval_minutes: number }`
  - `previewIntervals(state, now, params): Record<Grade, number>` — minutos hasta la próxima aparición de cada botón.
  - `retrievability(state, now, params): number`
  - `emptyState(now): SchedulingState`

  Los consumen todas las tareas siguientes.

Un tipo propio y no el `Card` de `ts-fsrs` directamente: la frontera hace que cambiar de librería, o de versión, sea un cambio en un fichero y no en toda la base.

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install ts-fsrs@5.4.2 -w @hanyu/domain
```

`ts-fsrs` no tiene dependencias propias, así que `packages/domain` conserva la propiedad que el Plan 2 aprovecha: puede ejecutarse dentro de una Edge Function de Deno vía `npm:ts-fsrs`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/domain/src/scheduling/params.test.ts
import { schedulingParams } from './params';

describe('schedulingParams', () => {
  it('usa 0,9 de retención objetivo por defecto', () => {
    expect(schedulingParams({}).request_retention).toBe(0.9);
  });

  it('acepta la retención objetivo del usuario', () => {
    expect(schedulingParams({ request_retention: 0.85 }).request_retention).toBe(0.85);
  });

  it('recorta una retención imposible en vez de propagarla', () => {
    // 1.0 pediría intervalos que tienden a cero; 0.5 haría el repaso inútil.
    expect(schedulingParams({ request_retention: 1.5 }).request_retention).toBe(0.97);
    expect(schedulingParams({ request_retention: 0.1 }).request_retention).toBe(0.7);
  });

  it('programa el reaprendizaje en minutos, no en días', () => {
    const params = schedulingParams({});

    expect(params.learning_steps).toEqual(['1m', '10m']);
    expect(params.relearning_steps).toEqual(['10m']);
    expect(params.enable_short_term).toBe(true);
  });
});
```

```ts
// packages/domain/src/scheduling/schedule.test.ts
import { applyReview, emptyState, previewIntervals, retrievability } from './schedule';
import { schedulingParams } from './params';

const params = schedulingParams({});
const now = new Date('2026-09-02T10:00:00.000Z');

describe('applyReview', () => {
  it('un Again devuelve la tarjeta en minutos, no al día siguiente', () => {
    // Éste es el defecto que la auditoría llamaba Alto 1: con SM-2 los cuatro
    // botones programaban el mismo día para una tarjeta nueva.
    const { interval_minutes } = applyReview(emptyState(now), 'again', now, params);

    expect(interval_minutes).toBeLessThan(60);
  });

  it('los cuatro botones programan cosas distintas', () => {
    const intervals = previewIntervals(emptyState(now), now, params);

    expect(new Set(Object.values(intervals)).size).toBe(4);
    expect(intervals.again).toBeLessThan(intervals.hard);
    expect(intervals.hard).toBeLessThan(intervals.good);
    expect(intervals.good).toBeLessThan(intervals.easy);
  });

  it('el intervalo mostrado es el que después se aplica', () => {
    const state = emptyState(now);
    const preview = previewIntervals(state, now, params);
    const applied = applyReview(state, 'good', now, params);

    expect(applied.interval_minutes).toBe(preview.good);
  });

  it('un acierto sobre una tarjeta madura alarga la estabilidad', () => {
    const mature = { ...emptyState(now), stability: 30, difficulty: 5, reps: 8, state: 'review' as const };

    expect(applyReview(mature, 'good', now, params).state.stability).toBeGreaterThan(30);
  });

  it('un fallo cuenta un lapso y baja la estabilidad', () => {
    const mature = { ...emptyState(now), stability: 30, difficulty: 5, reps: 8, lapses: 1, state: 'review' as const };
    const after = applyReview(mature, 'again', now, params);

    expect(after.state.lapses).toBe(2);
    expect(after.state.stability).toBeLessThan(30);
  });
});

describe('retrievability', () => {
  it('cae con el tiempo transcurrido desde el último repaso', () => {
    const state = {
      ...emptyState(now),
      stability: 10,
      difficulty: 5,
      reps: 3,
      state: 'review' as const,
      last_review: now.toISOString(),
      due: new Date('2026-09-12T10:00:00.000Z').toISOString(),
    };

    const soon = retrievability(state, new Date('2026-09-03T10:00:00.000Z'), params);
    const later = retrievability(state, new Date('2026-09-30T10:00:00.000Z'), params);

    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(later).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/domain/src/scheduling`
Expected: FAIL — no existen los módulos.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/domain/src/scheduling/params.ts
import { generatorParameters, type FSRSParameters } from 'ts-fsrs';

/**
 * Retención objetivo: la probabilidad de recuerdo que el programador intenta
 * mantener en el momento del repaso. Más alta significa repasar más a menudo.
 *
 * Los topes no son arbitrarios. Por encima de 0,97 los intervalos se desploman
 * y el usuario repasa sin parar sin ganar retención real; por debajo de 0,7 el
 * repaso llega tan tarde que deja de ser repaso y es reaprendizaje.
 */
const MIN_RETENTION = 0.7;
const MAX_RETENTION = 0.97;
export const DEFAULT_RETENTION = 0.9;

export interface SchedulingSettings {
  request_retention?: number | null;
}

export function schedulingParams(input: SchedulingSettings): FSRSParameters {
  const requested = Number(input.request_retention);
  const retention = Number.isFinite(requested)
    ? Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, requested))
    : DEFAULT_RETENTION;

  return generatorParameters({
    request_retention: retention,
    // Una tarjeta fallada vuelve dentro de la sesión. Con SM-2 desaparecía
    // hasta el día siguiente, que es lo que la auditoría llamaba Alto 1.
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    enable_short_term: true,
    // El difuminado reparte la carga entre días, pero haría que el intervalo
    // mostrado sobre el botón no fuese el que se aplica. La honestidad de esa
    // cifra vale más que el reparto.
    enable_fuzz: false,
  });
}
```

```ts
// packages/domain/src/scheduling/schedule.ts
//
// La única implementación de la programación. Antes había tres —una en
// TypeScript y dos copiadas dentro de RPC de Postgres— y mantenerlas de
// acuerdo era responsabilidad de nadie.
//
// El tipo propio SchedulingState existe para que cambiar de librería o de
// versión sea un cambio en este fichero y no en toda la base.
import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type Grade as FsrsGrade,
} from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type SchedulingPhase = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulingState {
  difficulty: number;
  stability: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  scheduled_days: number;
  elapsed_days: number;
  state: SchedulingPhase;
  /** ISO 8601. Cuándo toca la próxima aparición. */
  due: string;
  /** ISO 8601, o null si nunca se ha repasado. */
  last_review: string | null;
}

const GRADE_TO_RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const PHASE_TO_STATE: Record<SchedulingPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_TO_PHASE: Record<State, SchedulingPhase> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export function emptyState(now: Date): SchedulingState {
  return fromCard(createEmptyCard(now));
}

function toCard(state: SchedulingState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: PHASE_TO_STATE[state.state],
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

function fromCard(card: Card): SchedulingState {
  return {
    difficulty: card.difficulty,
    stability: card.stability,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    scheduled_days: card.scheduled_days,
    elapsed_days: card.elapsed_days,
    state: STATE_TO_PHASE[card.state],
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

export function applyReview(
  state: SchedulingState,
  grade: Grade,
  now: Date,
  params: FSRSParameters,
): { state: SchedulingState; interval_minutes: number } {
  const { card } = fsrs(params).next(toCard(state), now, GRADE_TO_RATING[grade]);

  return { state: fromCard(card), interval_minutes: minutesBetween(now, card.due) };
}

/**
 * Los minutos hasta la próxima aparición de cada botón, calculados con la misma
 * llamada que después aplica la valoración. Mostrar una cifra distinta de la
 * que se aplica sería peor que no mostrar ninguna.
 */
export function previewIntervals(
  state: SchedulingState,
  now: Date,
  params: FSRSParameters,
): Record<Grade, number> {
  const preview = fsrs(params).repeat(toCard(state), now);

  return {
    again: minutesBetween(now, preview[Rating.Again].card.due),
    hard: minutesBetween(now, preview[Rating.Hard].card.due),
    good: minutesBetween(now, preview[Rating.Good].card.due),
    easy: minutesBetween(now, preview[Rating.Easy].card.due),
  };
}

export function retrievability(
  state: SchedulingState,
  now: Date,
  params: FSRSParameters,
): number {
  return fsrs(params).get_retrievability(toCard(state), now, false);
}
```

Exporta ambos desde `packages/domain/src/index.ts`:

```ts
export * from './scheduling/params';
export * from './scheduling/schedule';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/domain/src/scheduling`
Expected: PASS — 10 tests.

Si «los cuatro botones programan cosas distintas» falla porque `again` y `hard` coinciden, revisa `learning_steps`: con un solo paso, Again y Hard caen en el mismo minuto.

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): planificador FSRS único con retención objetivo y pasos de reaprendizaje"
```

---

## Task 2: El estado de programación se muda a `learner_skill_state`

**Files:**
- Create: `supabase/migrations/2026090205_fsrs.sql`
- Modify: `packages/data/src/types.ts`, `packages/data/src/repositories/flashcards.ts`

**Interfaces:**
- Consumes: `SchedulingState` (Tarea 1); `learner_skill_state` (Plan 1C).
- Produces: `learner_skill_state` con las columnas de FSRS y `get_due_cards` leyendo de ella.

`srs_cards` guardaba dos cosas a la vez: qué palabras tiene el usuario en estudio, y cuándo tocan. Lo primero sigue siendo suyo; lo segundo se muda, porque una palabra tiene un momento distinto por cada habilidad y una sola fila no puede representarlo.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090205_fsrs.sql
--
-- srs_cards guardaba la identidad de la tarjeta y su programación en la misma
-- fila. La programación se muda a learner_skill_state, que el Plan 1C creó con
-- una fila por (usuario, objetivo, habilidad): una palabra tiene un momento
-- distinto para reconocerla y para escribirla, y una sola fila no puede decirlo.

alter table public.learner_skill_state
  add column if not exists fsrs_state text not null default 'new'
    check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  add column if not exists learning_steps integer not null default 0,
  add column if not exists scheduled_days integer not null default 0,
  add column if not exists elapsed_days integer not null default 0,
  add column if not exists leech boolean not null default false;

-- El Plan 1C trasladó ease_factor a `difficulty` e interval_days a `stability`
-- por comodidad, pero son magnitudes de otro algoritmo: un ease de 2,5 no es
-- una dificultad FSRS. Se ponen a null para que la primera valoración las
-- inicialice de verdad, conservando el historial de repasos y fallos.
update public.learner_skill_state
set difficulty = null,
    stability = null,
    fsrs_state = case
      when reps = 0 then 'new'
      when next_review_at is null then 'new'
      else 'review'
    end
where difficulty is not null and stability is not null and elapsed_days = 0;

create index if not exists idx_skill_state_due_by_skill
  on public.learner_skill_state(user_id, skill, next_review_at)
  where not suspended;

-- La retención objetivo es del usuario, no del algoritmo.
alter table public.user_settings
  add column if not exists request_retention numeric not null default 0.9
    check (request_retention between 0.7 and 0.97);

-- review_log.quality guarda la escala de SM-2 (1, 3, 4, 5). La de FSRS es
-- 1..4 con otro significado: un 3 es "Hard" en la primera y "Good" en la
-- segunda. Mezclarlas en la misma columna haría ilegible el historial.
alter table public.review_log
  add column if not exists grade smallint check (grade between 1 and 4);

-- get_due_cards lee ahora de learner_skill_state. Se filtra por habilidad para
-- que el Plan 4B pueda pedir una cola de escucha sin tocar esta función.
create or replace function public.get_due_cards(
  p_limit integer default 50,
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition'
)
returns table(
  card_id uuid,
  word_id bigint,
  skill public.learning_skill,
  difficulty numeric,
  stability numeric,
  reps integer,
  lapses integer,
  learning_steps integer,
  scheduled_days integer,
  elapsed_days integer,
  fsrs_state text,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  version bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sc.id, sc.word_id, s.skill, s.difficulty, s.stability, s.reps, s.lapses,
    s.learning_steps, s.scheduled_days, s.elapsed_days, s.fsrs_state,
    s.next_review_at, s.last_reviewed_at, s.version
  from public.learner_skill_state s
  join public.srs_cards sc
    on sc.user_id = s.user_id and sc.word_id = s.target_id
  where s.user_id = auth.uid()
    and s.target_kind = 'word'
    and s.skill = p_skill
    and not s.suspended
    and (s.next_review_at is null or s.next_review_at <= now())
    and exists (
      select 1
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where dc.word_id = sc.word_id
        and d.user_id = auth.uid()
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
  order by s.next_review_at asc nulls first
  limit greatest(1, coalesce(p_limit, 50));
$$;
```

- [ ] **Step 2: Actualizar los tipos y el repositorio**

En `packages/data/src/types.ts`, `DueCard` gana el estado de programación y pierde los campos de SM-2:

```ts
export interface DueCard {
  id: string;
  user_id: string;
  word_id: number;
  skill: LearningSkill;
  scheduling: SchedulingState;
  version: number;
  hanzi?: string;
  pinyin?: string;
  traditional?: string | null;
  meaning_en?: string;
  meaning_es?: string | null;
  classifier?: string | null;
  hsk_level?: number;
  pos?: string | null;
  frequency?: number | null;
}
```

`ease_factor`, `interval`, `interval_days`, `repetitions`, `next_review`, `last_review` y `status` desaparecen del tipo. `status` se recalcula en la Tarea 6 a partir de la retención, así que ninguna pantalla debe leerlo de la base mientras tanto.

En `packages/data/src/repositories/flashcards.ts`, `mapVersionedCardRow` agrupa las columnas de programación en un solo objeto en vez de esparcirlas por la tarjeta:

```ts
function mapVersionedCardRow(row: any, word?: any): VersionedCard {
  if (row.version === undefined || row.version === null) {
    throw new Error('Card row is missing its version');
  }

  return {
    id: String(row.card_id ?? row.id),
    user_id: String(row.user_id ?? ''),
    word_id: Number(row.word_id),
    skill: (row.skill ?? 'recognition') as LearningSkill,
    scheduling: {
      difficulty: Number(row.difficulty ?? 0),
      stability: Number(row.stability ?? 0),
      reps: Number(row.reps ?? 0),
      lapses: Number(row.lapses ?? 0),
      learning_steps: Number(row.learning_steps ?? 0),
      scheduled_days: Number(row.scheduled_days ?? 0),
      elapsed_days: Number(row.elapsed_days ?? 0),
      state: (row.fsrs_state ?? 'new') as SchedulingPhase,
      due: String(row.next_review_at ?? new Date().toISOString()),
      last_review: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    },
    version: Number(row.version),
    hanzi: word?.hanzi,
    pinyin: word?.pinyin,
    traditional: word?.traditional ?? null,
    meaning_en: word?.meaning_en,
    meaning_es: word?.meaning_es ?? null,
    classifier: word?.classifier ?? null,
    hsk_level: word?.hsk_level,
    pos: word?.pos ?? null,
    frequency: word?.frequency ?? null,
  };
}
```

Y `getDueCards` pasa `p_skill: 'recognition'` mientras el Plan 4B no exista.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: los 5 pasos en PASS. Habrá que actualizar los fixtures de `flashcards.test.ts`, `ReviewStore.test.ts` y `CardsScreen.test.tsx`, que construyen tarjetas con la forma antigua.

```bash
git add supabase/migrations/2026090205_fsrs.sql packages/data/src
git commit -m "feat(db): la programación se muda a learner_skill_state con estado FSRS"
```

---

## Task 3: El servidor deja de calcular

**Files:**
- Modify: `supabase/migrations/2026090205_fsrs.sql`
- Modify: `packages/data/src/repositories/flashcards.ts`, `packages/data/src/types.ts`

**Interfaces:**
- Produces: RPC `apply_review(p_card_id, p_review_id, p_reviewed_at, p_expected_version, p_grade, p_skill, p_state jsonb, p_prior jsonb)` que devuelve `(outcome text, version bigint)`.
- Elimina: las dos firmas de `review_flashcard`.

Ésta es la decisión que reduce tres implementaciones a una. **El servidor guarda lo que el cliente calculó**, bajo las mismas garantías que hoy: idempotencia por `review_id` y comprobación de versión. Conserva `prior_snapshot` para que `revert_review` del Plan 3 siga funcionando sin cambios.

No es una pérdida de autoridad, porque hoy no la hay: el cliente ya programa localmente con `applySm2` cuando está sin conexión, y el servidor recalculaba lo mismo por su cuenta. Dos cálculos que deben coincidir es peor que uno.

- [ ] **Step 1: Añadir la RPC a la migración**

```sql
-- El cliente calcula la programación y el servidor la guarda. Antes ambos la
-- calculaban por separado con copias del mismo SM-2, y mantenerlas de acuerdo
-- no era responsabilidad de nadie. La arquitectura offline exige que el cliente
-- sepa programar sin red, así que la única forma de tener un solo algoritmo es
-- que sea el suyo.
create or replace function public.apply_review(
  p_card_id uuid,
  p_review_id uuid,
  p_reviewed_at timestamptz,
  p_expected_version bigint,
  p_grade smallint,
  p_skill public.learning_skill,
  p_state jsonb,
  p_prior jsonb
)
returns table(outcome text, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_card    public.srs_cards;
  v_state   public.learner_skill_state;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_grade is null or p_grade < 1 or p_grade > 4 then
    raise exception 'grade must be between 1 and 4';
  end if;

  select * into v_card from public.srs_cards
  where id = p_card_id and user_id = v_user_id;

  if not found then
    raise exception 'Card not found';
  end if;

  -- Idempotencia: el mismo review_id dos veces no aplica dos veces.
  if exists (
    select 1 from public.review_log
    where user_id = v_user_id and client_review_id = p_review_id
  ) then
    select s.version into version from public.learner_skill_state s
    where s.user_id = v_user_id and s.target_kind = 'word'
      and s.target_id = v_card.word_id and s.skill = p_skill;
    outcome := 'duplicate';
    return next;
    return;
  end if;

  select * into v_state from public.learner_skill_state
  where user_id = v_user_id and target_kind = 'word'
    and target_id = v_card.word_id and skill = p_skill
  for update;

  if not found then
    insert into public.learner_skill_state (user_id, target_kind, target_id, skill)
    values (v_user_id, 'word', v_card.word_id, p_skill)
    returning * into v_state;
  end if;

  if v_state.version <> p_expected_version then
    outcome := 'conflict';
    version := v_state.version;
    return next;
    return;
  end if;

  update public.learner_skill_state set
    difficulty       = (p_state->>'difficulty')::numeric,
    stability        = (p_state->>'stability')::numeric,
    reps             = (p_state->>'reps')::integer,
    lapses           = (p_state->>'lapses')::integer,
    learning_steps   = (p_state->>'learning_steps')::integer,
    scheduled_days   = (p_state->>'scheduled_days')::integer,
    elapsed_days     = (p_state->>'elapsed_days')::integer,
    fsrs_state       = p_state->>'state',
    next_review_at   = (p_state->>'due')::timestamptz,
    last_reviewed_at = p_reviewed_at,
    version          = v_state.version + 1,
    updated_at       = now()
  where id = v_state.id;

  insert into public.review_log (
    user_id, card_id, reviewed_at, quality, grade,
    client_review_id, client_reviewed_at, prior_snapshot, result_snapshot
  ) values (
    v_user_id, p_card_id, p_reviewed_at, null, p_grade,
    p_review_id, p_reviewed_at, p_prior,
    p_state || jsonb_build_object('version', v_state.version + 1)
  );

  insert into public.user_stats (user_id, date, cards_reviewed, cards_new)
  values (
    v_user_id, (p_reviewed_at at time zone 'utc')::date, 1,
    case when coalesce(p_prior->>'state', 'new') = 'new' then 1 else 0 end
  )
  on conflict (user_id, date) do update set
    cards_reviewed = public.user_stats.cards_reviewed + 1,
    cards_new = public.user_stats.cards_new + excluded.cards_new;

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload, client_event_id)
  values (
    v_user_id, 'review_rated', 'word', v_card.word_id, p_skill,
    jsonb_build_object('grade', p_grade, 'card_id', p_card_id),
    p_review_id
  );

  outcome := 'applied';
  version := v_state.version + 1;
  return next;
end;
$$;

revoke all on function public.apply_review(uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb) from public;
grant execute on function public.apply_review(uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb) to authenticated;

-- Las dos copias de SM-2 desaparecen. No quedan detrás de una bandera: dos
-- algoritmos vivos es el problema que este plan cierra.
drop function if exists public.review_flashcard(uuid, integer, integer);
drop function if exists public.review_flashcard(uuid, integer, integer, uuid, timestamptz, bigint);

-- srs_cards conserva la identidad de la tarjeta; su programación ya no vive
-- aquí y dejarla sería una segunda fuente de verdad.
alter table public.srs_cards
  drop column if exists ease_factor,
  drop column if exists interval_days,
  drop column if exists repetitions,
  drop column if exists next_review_at,
  drop column if exists last_reviewed_at,
  drop column if exists status;
```

El `on conflict (user_id, date)` funciona tal cual: `user_stats` ya declara `unique (user_id, date)` en `202607280001_initial_schema.sql:82`.

- [ ] **Step 2: Sustituir `reviewCardEvent`**

En `packages/data/src/types.ts`, `ReviewEvent` deja de llevar una valoración numérica suelta y pasa a llevar el resultado ya calculado:

```ts
export interface ReviewEvent {
  card_id: string;
  /** Escala de FSRS: 1 Again, 2 Hard, 3 Good, 4 Easy. */
  grade: 1 | 2 | 3 | 4;
  skill: LearningSkill;
  time_ms: number | null;
  review_id: string;
  reviewed_at: string;
  expected_version: number;
  /** Estado que el cliente calculó. El servidor lo guarda, no lo recalcula. */
  state: SchedulingState;
  /** Estado anterior, que revert_review restaura. */
  prior: SchedulingState;
}
```

Y en `packages/data/src/repositories/flashcards.ts`:

```ts
export async function reviewCardEvent(
  event: ReviewEvent,
  client: HanyuClient,
): Promise<ReviewSyncResult> {
  const { data, error } = await client.rpc('apply_review', {
    p_card_id: event.card_id,
    p_review_id: event.review_id,
    p_reviewed_at: event.reviewed_at,
    p_expected_version: event.expected_version,
    p_grade: event.grade,
    p_skill: event.skill,
    p_state: event.state,
    p_prior: event.prior,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to sync review');
  }

  const outcome = normalizeReviewSyncOutcome(data);
  const card = await getCard(event.card_id, client);

  return { outcome, card };
}
```

Elimina `reviewCard` entera: el Plan 3 dejó su última llamada sin usar, y su RPC ya no existe.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations/2026090205_fsrs.sql packages/data/src
git commit -m "feat(db): apply_review guarda la programación que calcula el cliente y retira SM-2 del servidor"
```

---

## Task 4: El servicio offline programa con FSRS

**Files:**
- Modify: `apps/mobile/src/offline/OfflineReviewService.ts`, `ReviewStore.ts`
- Delete: `packages/domain/src/sm2.ts`, `packages/domain/src/sm2.test.ts`
- Test: `apps/mobile/src/offline/OfflineReviewService.test.ts`, `ReviewStore.test.ts`

**Interfaces:**
- Consumes: `applyReview`, `schedulingParams` (Tarea 1).
- Produces: `OfflineReviewService.rateCard(card, grade: Grade, timeMs)` — la escala pasa de `quality` numérica a la de FSRS.

- [ ] **Step 1: Write the failing test**

En `OfflineReviewService.test.ts`:

```ts
  it('un Again devuelve la tarjeta dentro de la sesión', async () => {
    const service = makeService({ uuid: () => 'r1' });

    const { card: rated } = await service.rateCard(makeCard(), 'again', 1000);

    const minutes = (new Date(rated.scheduling.due).getTime() - Date.parse('2026-07-31T10:00:00.000Z')) / 60000;
    expect(minutes).toBeLessThan(60);
  });

  it('encola la valoración con la escala de FSRS, no con quality', async () => {
    const store = makeFakeStore();
    const service = makeService({ store, uuid: () => 'r1' });

    await service.rateCard(makeCard(), 'good', 1000);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ grade: 3, skill: 'recognition' }),
      expect.anything(),
    );
  });
```

`makeCard` pasa a devolver la forma nueva de `DueCard`, con `scheduling: emptyState(new Date('2026-07-31T10:00:00.000Z'))`.

En `ReviewStore.test.ts`, el test que comprueba `replayPendingOnto` tiene que verificar que la reproyección usa FSRS: tras dos eventos `again` seguidos, `lapses` debe ser 2.

- [ ] **Step 2: Write minimal implementation**

Añade la dependencia inyectada a `OfflineReviewServiceDeps`, como el resto de la E/S de la clase:

```ts
  /** Parámetros de programación del usuario, releídos cuando cambian los ajustes. */
  params: () => FSRSParameters;
```

Y en `rateCard`, el cálculo y el evento:

```ts
  async rateCard(
    card: VersionedCard,
    grade: Grade,
    timeMs: number | null,
  ): Promise<{ card: VersionedCard; reviewId: string }> {
    if (this.inFlight.has(card.id)) {
      throw new Error('A rating for this card is already in progress');
    }
    this.inFlight.add(card.id);

    try {
      const reviewedAt = this.now();
      const outcome = applyReview(card.scheduling, grade, reviewedAt, this.params());

      const event: ReviewEvent = {
        card_id: card.id,
        grade: GRADE_NUMBER[grade],
        skill: card.skill,
        time_ms: timeMs,
        review_id: this.uuid(),
        reviewed_at: reviewedAt.toISOString(),
        expected_version: card.version,
        state: outcome.state,
        prior: card.scheduling,
      };

      const projected: VersionedCard = { ...card, scheduling: outcome.state };

      await this.store.enqueueAndProject(event, projected);
      return { card: projected, reviewId: event.review_id };
    } finally {
      this.inFlight.delete(card.id);
    }
  }
```

con `const GRADE_NUMBER: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };` en el mismo fichero. Fíjate en que el proyectado ya no necesita duplicar campos con alias (`interval`/`interval_days`, `next_review`/`next_review_at`): esa duplicación existía porque la programación vivía suelta sobre la tarjeta, y ahora vive en un solo objeto.

En `replayPendingOnto` de `ReviewStore.ts`, lo mismo:

```ts
function replayPendingOnto(
  base: VersionedCard,
  events: PendingRow[],
  params: FSRSParameters,
): VersionedCard {
  let card = base;
  for (const ev of events) {
    const outcome = applyReview(
      card.scheduling,
      GRADE_NAME[ev.grade],
      new Date(ev.reviewed_at),
      params,
    );
    card = { ...card, scheduling: outcome.state };
  }
  return card;
}
```

con `const GRADE_NAME: Record<number, Grade> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };`. `PendingRow` cambia `quality` por `grade` y gana `skill`, y con ella el esquema de `pending_reviews` en `schema.ts`.

Borra `packages/domain/src/sm2.ts` y su test. Si `git grep applySm2` devuelve algo fuera de `server/`, no has terminado.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git rm packages/domain/src/sm2.ts packages/domain/src/sm2.test.ts
git add apps/mobile/src/offline packages/domain
git commit -m "feat(offline): programar con FSRS y retirar SM-2 del dominio"
```

---

## Task 5: La cola intradía y el temporizador de sesión

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`
- Test: `apps/mobile/src/screens/CardsScreen.test.tsx`, `apps/mobile/src/lib/useSessionTimer.test.ts`

**Interfaces:**
- Consumes: `applyReview` (Tarea 1), `rateCard` (Tarea 4).

Con `learning_steps` en minutos, una tarjeta fallada vuelve a estar vencida dentro de la misma sesión. La cola tiene que recogerla: si la sesión es una lista fija recorrida una vez, el paso de reaprendizaje no se ve nunca.

- [ ] **Step 1: Write the failing test**

```tsx
  it('vuelve a presentar dentro de la sesión una tarjeta fallada', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockImplementation(async (input: any, grade: string) => ({
      card: {
        ...input,
        scheduling: {
          ...input.scheduling,
          due: grade === 'again'
            ? new Date(Date.now() + 60_000).toISOString()
            : new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      reviewId: `r-${grade}`,
    }));

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));

    // 你好 falla: tiene que volver antes de terminar.
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Again'));

    // 谢谢 se acierta.
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    // La sesión no ha terminado: queda 你好 por reaprender.
    expect(screen.queryByText('Session complete')).toBeNull();
    expect(screen.getByText('你好')).toBeTruthy();
  });
```

Y en `useSessionTimer.test.ts`, la cobertura que el Plan 0 dejó anotada como hueco: hoy solo se ejercita `reset()`.

```ts
  it('cuenta los segundos transcurridos desde start', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(65_000);
    });

    expect(result.current.elapsed).toBe(65);
    expect(result.current.formatted).toBe('1:05');
    jest.useRealTimers();
  });

  it('deja de contar tras stop', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(3000);
      result.current.stop();
      jest.advanceTimersByTime(10_000);
    });

    expect(result.current.elapsed).toBe(3);
    jest.useRealTimers();
  });

  it('start reinicia el contador de una sesión anterior', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(5000);
      result.current.start();
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.elapsed).toBe(2);
    jest.useRealTimers();
  });
```

- [ ] **Step 2: Write minimal implementation**

En `CardsScreen`, la cola deja de ser una lista recorrida por índice y pasa a reinsertar lo que vuelve a vencer:

```tsx
  /**
   * Una tarjeta fallada vuelve dentro de la sesión, en cuanto su nuevo momento
   * ha pasado. Con la lista fija anterior, el paso de reaprendizaje se
   * programaba y no se veía nunca: la sesión terminaba antes.
   */
  function enqueueIfDueAgain(rated: DueCard, queue: DueCard[], position: number): DueCard[] {
    const dueAt = Date.parse(rated.scheduling.due);
    const withinSession = dueAt - Date.now() < INTRA_SESSION_HORIZON_MS;

    if (!withinSession) {
      return queue;
    }

    const next = [...queue];
    next.splice(position, 0, rated);
    return next;
  }
```

con `const INTRA_SESSION_HORIZON_MS = 30 * 60 * 1000;` y la reinserción al final de la cola pendiente, no inmediatamente después: repetir la tarjeta acto seguido mide memoria de trabajo, no memoria a largo plazo.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src
git commit -m "feat(mobile): cola intradía de reaprendizaje y cobertura del temporizador de sesión"
```

---

## Task 6: La interfaz dice la verdad sobre la programación

**Files:**
- Modify: `apps/mobile/src/ui/FlashCardView.tsx`, `apps/mobile/src/screens/YouScreen.tsx`, `packages/data/src/repositories/settings.ts`
- Modify: `packages/domain/src/scheduling/schedule.ts`
- Test: los suyos

**Interfaces:**
- Produces: `cardPhase(state: SchedulingState): 'new' | 'learning' | 'review' | 'mastered'` y `isLeech(state: SchedulingState): boolean`.

Tres cosas que la auditoría pedía y que ahora salen casi gratis del planificador: el intervalo real sobre cada botón, la detección de leeches, y `mastered` como estimación con evidencia en vez de una regla fija.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/scheduling/schedule.test.ts, al final
describe('cardPhase', () => {
  it('llama mastered a lo que se recuerda con holgura, no a lo repetido muchas veces', () => {
    // La regla anterior era interval_days >= 21 && repetitions >= 5, sin
    // ninguna medida de retención detrás.
    const solid = {
      ...emptyState(now),
      stability: 200,
      difficulty: 3,
      reps: 6,
      state: 'review' as const,
      last_review: now.toISOString(),
      due: new Date('2027-01-01T00:00:00.000Z').toISOString(),
    };
    const shaky = { ...solid, stability: 5 };

    expect(cardPhase(solid)).toBe('mastered');
    expect(cardPhase(shaky)).toBe('review');
  });
});

describe('isLeech', () => {
  it('marca la tarjeta que se ha fallado una y otra vez', () => {
    expect(isLeech({ ...emptyState(now), lapses: 7 })).toBe(true);
    expect(isLeech({ ...emptyState(now), lapses: 3 })).toBe(false);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

En `schedule.ts`:

```ts
/**
 * Umbral de lapsos a partir del cual una tarjeta se considera problemática.
 * Ocho es el valor por defecto de Anki, y su razón es práctica: por debajo se
 * marcan tarjetas que solo van lentas.
 */
const LEECH_LAPSES = 8;

export function isLeech(state: SchedulingState): boolean {
  return state.lapses >= LEECH_LAPSES;
}

/**
 * `mastered` deja de ser una regla fija sobre intervalo y repeticiones y pasa a
 * ser lo que su nombre dice: algo que se recuerda con holgura. Se exige una
 * estabilidad alta —el recuerdo aguanta meses— y no un contador de repasos,
 * que solo mide cuánto se ha trabajado, no cuánto se sabe.
 */
const MASTERED_STABILITY_DAYS = 180;

export function cardPhase(
  state: SchedulingState,
): 'new' | 'learning' | 'review' | 'mastered' {
  if (state.state === 'new') return 'new';
  if (state.state === 'learning' || state.state === 'relearning') return 'learning';

  return state.stability >= MASTERED_STABILITY_DAYS ? 'mastered' : 'review';
}
```

En `FlashCardView.tsx`, los botones muestran su intervalo. `RATINGS` pasa de `quality` numérica a `Grade`, y el componente recibe `intervals: Record<Grade, number>` que `CardsScreen` calcula con `previewIntervals`:

```tsx
                <Button
                  label={rating.label}
                  sublabel={formatInterval(intervals[rating.grade])}
                  variant={rating.variant}
                  onPress={() => onRate?.(rating.grade)}
                  disabled={ratingDisabled}
                  busy={pendingGrade === rating.grade}
                />
```

`Button` no tiene `sublabel` hoy; añádelo a `ButtonProps` como `sublabel?: string` y píntalo bajo la etiqueta con `tokens.fontSize.xs` y `colors.textMuted`.

Y el formateador, en `apps/mobile/src/lib/formatInterval.ts` con su test:

```ts
/**
 * El intervalo se muestra con la unidad que lo hace legible de un vistazo.
 * "1440m" es correcto y no dice nada; "1d" sí.
 */
export function formatInterval(minutes: number): string {
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))}m`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = hours / 24;
  if (days < 30) {
    return `${Math.round(days)}d`;
  }

  const months = days / 30;
  if (months < 12) {
    return `${Math.round(months)}mo`;
  }

  return `${(days / 365).toFixed(1)}y`;
}
```

En `YouScreen`, un control de retención objetivo con tres opciones etiquetadas por lo que significan, no por el número: `Relajado (0,85)`, `Equilibrado (0,90)`, `Exigente (0,95)`. Y en `settings.ts`, `request_retention` con el mismo recorte de `params.ts`.

Las tarjetas marcadas como leech se suspenden automáticamente y aparecen en una lista en `YouScreen` desde donde reactivarlas: suspender sin decirlo sería otra promesa incumplida.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain packages/data apps/mobile
git commit -m "feat(mobile): intervalos visibles, retención configurable, leeches y mastered con evidencia"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `git grep -n "applySm2\|ease_factor\|SM-2"` no devuelve nada fuera de `server/` y de los planes antiguos en `docs/`.
3. Los cuatro botones muestran cuatro intervalos distintos sobre una tarjeta nueva, y el que muestran es el que se aplica.
4. Un Again devuelve la tarjeta dentro de la misma sesión.
5. Cambiar la retención objetivo en Ajustes cambia los intervalos que muestran los botones.
6. Existe una sola implementación del algoritmo: `packages/domain/src/scheduling/schedule.ts`.

## Lo que este plan deja explícitamente sin resolver

- **Solo se programa la habilidad `recognition`.** El esquema y `get_due_cards` ya aceptan `p_skill`, pero nada genera todavía tarjetas de escucha o producción. Es el Plan 4B.
- **La retención observada no se mide.** El plan permite fijar una retención objetivo, pero comprobar si la real converge a ella necesita la analítica del Plan 9. Hasta entonces el objetivo es una preferencia, no un lazo cerrado.
- **Los pesos de FSRS son los por defecto.** Optimizarlos contra el historial del usuario pide meses de datos y un optimizador; `ts-fsrs` no lo trae. Con un solo usuario que empieza, los por defecto son mejores que unos ajustados a ruido.
- **`server/services/srs-engine.js` sigue teniendo su copia de SM-2.** Está en el servidor legado y congelado. No se migra.
- **La corrección manual de la valoración** —cambiar un Good por un Hard después de responder— llega con el Plan 4B, donde la valoración deja de ser siempre manual y empieza a derivarse de lo escrito o dicho.
