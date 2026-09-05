# Plan 9 — Analítica: medir aprendizaje, no actividad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dashboard deje de contar cuántas cosas hiciste y pase a responder qué sabes, con qué evidencia y desde cuándo.

**Architecture:** Los ocho planes anteriores dejaron el sustrato: `learning_event` recoge valoraciones, intentos, pistas y lecturas terminadas; `learner_skill_state` guarda estabilidad por habilidad; `reading_progress` guarda cuándo empezó y terminó cada lectura; `unit` y `unit_word` dicen qué enseña cada cosa. Este plan no añade recogida —salvo un evento que falta— sino **lectura**: funciones puras que convierten ese historial en las once métricas del §12 de la auditoría, y una pantalla que las muestra con su fecha y su evidencia.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase (Postgres, RPC en PL/pgSQL).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende de todos los anteriores**, todos ejecutados: 1A, 1B, 1C, 2, 3, 4A, 4B, 5A, 5B, 6, 7 y 8.
- **Ninguna métrica se muestra sin poder decir de dónde sale.** Una cifra sin procedencia es peor que ninguna cifra, porque invita a confiar en ella.
- **Prohibido escribir mitigaciones.** Y aquí en particular: prohibido rellenar una métrica sin datos con un cero o un guion sin explicar por qué está vacía.

## Estado de partida verificado (5 de septiembre de 2026)

Medido sobre el repositorio con los doce planes anteriores ejecutados y 32 migraciones aplicadas:

**Lo que ya se recoge**, con su forma exacta:

| Evento | Emisor | Payload |
|---|---|---|
| `review_rated` | `apply_review` (4A) | `{ grade, card_id }`, con `skill` |
| `review_reverted` | `revert_review` (3) | `{ card_id, client_review_id }` |
| `exercise_attempted` | `exercises.ts` (6) | `{ exercise_id, correct, answer_correct, hint_used }`, `skill` = `listening` o `recall` |
| `exercise_attempted` | `CardsScreen` modo Exam (5B) | `{ mode, grade, correct, time_ms }` |
| `hint_used` | `exercises.ts` (6) | `{ exercise_id, hint }` |
| `reading_completed` | `readings.ts` (8) | `{ reading_slug, target_words }`, `skill` = `reading` |

Los dos emisores de `exercise_attempted` coinciden en `correct`, así que una consulta que lo lea sirve para los dos. Eso no estaba garantizado y conviene no romperlo.

**Además:** `reading_progress` tiene `started_at` y `finished_at` —el segundo desde `2026090512`—, así que la velocidad de lectura es medible sin recoger nada nuevo. `learner_skill_state` tiene `stability` por habilidad. `unit_word` liga palabras a unidades del sílabo. `getDashboard` existe con una RPC `get_dashboard` y un agregado de reserva.

**Lo que falta:** `word_looked_up` está en el enum y en el tipo desde el Plan 1C, y **no lo emite nadie**. Sin él no hay «consultas por 100 tokens», que es una de las once métricas.

## Las once métricas, y cuáles se pueden calcular

El §12 de la auditoría pide once. Nueve salen enteras, una necesita el evento que falta, y una no se puede separar como pide:

| Métrica | Fuente | Estado |
|---|---|---|
| Retención observada a 7 y 30 días | `review_rated` | Sale |
| Vocabulario HSK 2 demostrado por habilidad | `learner_skill_state` | Sale |
| Gramática demostrada en input y producción | `exercise_attempted` + `unit_word` + `exercise_template` | Sale |
| Porcentaje conocido de cada lectura | `coverageOf` (Plan 8) | Sale |
| Velocidad de lectura | `reading_progress` + longitud del texto | Sale, **pero no «sin pinyin»** |
| Consultas por 100 tokens | `word_looked_up` | **Necesita la Tarea 1** |
| Comprensión literal e inferencial | `reading_attempts` | Sale la literal; **la inferencial no existe** |
| Precisión de dictado y producción | `exercise_attempted` por `skill` | Sale |
| Errores recurrentes | `mistake_queue` (Plan 6) | Sale |
| Cobertura del sílabo | `npm run coverage` + estados | Sale |
| Rendimiento en simulacros | `exercise_attempted` con `payload.mode = 'exam'` | Sale |

Dos matices que hay que decir en vez de disimular:

**«Velocidad de lectura sin pinyin».** `reading_progress` no guarda si el pinyin estaba activado, así que la velocidad se mide sobre todas las lecturas por igual. Añadir el dato es una columna y un parámetro, y **se hace en la Tarea 1**: sin él la métrica mide otra cosa que la que su nombre dice.

**«Comprensión inferencial».** No se puede calcular, y no por falta de datos sino por diseño: el validador del Plan 7 **exige** que toda pregunta tenga `evidence_sentence`, es decir, una frase del texto que la conteste. Todas las preguntas del catálogo son literales por construcción. Medir comprensión inferencial pediría preguntas sin evidencia directa, que es contenido nuevo y una relajación deliberada de ese validador. Se declara ausente con su motivo.

## File Structure

**Se crean:**
- `packages/domain/src/analytics/retention.ts`, `retention.test.ts`
- `packages/domain/src/analytics/mastery.ts`, `mastery.test.ts`
- `packages/domain/src/analytics/reading.ts`, `reading.test.ts`
- `supabase/migrations/2026090601_analytics.sql`
- `apps/mobile/src/screens/ProgressScreen.tsx`, `ProgressScreen.test.tsx`

**Se modifican:**
- `apps/mobile/src/readings/WordSheet.tsx`, `ReadingDetailScreen.tsx`
- `packages/data/src/repositories/readings.ts`, `stats.ts`, `types.ts`, `factory.ts`

---

## Task 1: Recoger lo que falta

**Files:**
- Create: `supabase/migrations/2026090601_analytics.sql`
- Modify: `apps/mobile/src/readings/WordSheet.tsx`, `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `packages/data/src/repositories/readings.ts`

**Interfaces:**
- Produces: emisión de `word_looked_up`, y `reading_progress.pinyin_shown`. Los consumen las Tareas 2 y 4.

Dos huecos de recogida, los dos pequeños, los dos bloqueantes para una métrica cada uno. Van primero porque **medir con datos que aún no se recogen daría cero, y un cero sin explicación se lee como «no lo hago bien»** en vez de como «no lo mido».

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/readings/WordSheet.test.tsx
  it('registra la consulta al abrir la ficha de una palabra', async () => {
    // "Consultas por 100 tokens" mide cuánto te cuesta leer. Sin este evento la
    // métrica no existe, y era la única de las once sin emisor.
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    render(<WordSheet text="还" senses={[huan]} readingLevel={2} sentence={null} readingId="r1" onClose={() => {}} />);

    await waitFor(() =>
      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'word_looked_up',
          target_kind: 'word',
          payload: expect.objectContaining({ reading_slug: 'r1' }),
        }),
      ),
    );
  });

  it('no registra la consulta dos veces al re-renderizar', async () => {
    // Un efecto sin dependencias correctas inflaría la métrica en silencio.
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    const { rerender } = render(
      <WordSheet text="还" senses={[huan]} readingLevel={2} sentence={null} readingId="r1" onClose={() => {}} />,
    );
    rerender(
      <WordSheet text="还" senses={[huan]} readingLevel={2} sentence={null} readingId="r1" onClose={() => {}} />,
    );

    await waitFor(() => expect(mockRecordEvent).toHaveBeenCalledTimes(1));
  });
```

Y en `readings.test.ts`:

```ts
  it('guarda si el pinyin estaba visible al terminar la lectura', async () => {
    const client = progressClient();

    await markRead('shop-01-tea-and-coffee', { pinyinShown: true }, client);

    expect((client as any).chains.reading_progress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pinyin_shown: true }),
      expect.anything(),
    );
  });
```

- [ ] **Step 2: Write minimal implementation**

```sql
-- supabase/migrations/2026090601_analytics.sql
--
-- La velocidad de lectura con pinyin visible y sin él son dos cosas distintas:
-- con pinyin se está leyendo una transcripción. Sin esta columna, la métrica
-- promedia las dos y no mide ninguna.
alter table public.reading_progress
  add column if not exists pinyin_shown boolean;
```

En `WordSheet`, un efecto que se dispara una sola vez por palabra abierta:

```tsx
  const looked = useRef<string | null>(null);

  useEffect(() => {
    const first = senses[0];
    // La clave es la palabra, no el render: sin esto, cualquier re-render
    // volvería a contar la consulta e inflaría la métrica en silencio.
    if (!first || looked.current === String(first.id)) return;
    looked.current = String(first.id);

    void getData().events.recordEvent({
      kind: 'word_looked_up',
      target_kind: 'word',
      target_id: first.id,
      skill: 'reading',
      payload: { reading_slug: readingId, form: text },
    });
  }, [senses, readingId, text]);
```

`markRead` acepta `{ pinyinShown }` y lo escribe; `ReadingDetailScreen` le pasa su estado `showPinyin`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations/2026090601_analytics.sql apps/mobile/src packages/data/src
git commit -m "feat(analytics): registrar consultas de palabra y si el pinyin estaba visible"
```

---

## Task 2: Retención observada

**Files:**
- Create: `packages/domain/src/analytics/retention.ts`, `retention.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `observedRetention(reviews, now, windowDays): { rate, sample, target_gap }`.

La métrica que cierra el lazo del Plan 4A: allí se fijó una retención objetivo, y hasta ahora nadie comprobaba si la real converge a ella.

**Qué cuenta como acierto**: un repaso de una tarjeta que ya estaba en fase `review` y se valoró distinto de `again`. Las tarjetas en aprendizaje se excluyen: fallar algo que estás viendo por segunda vez en diez minutos no dice nada sobre tu retención a treinta días.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/analytics/retention.test.ts
import { observedRetention } from './retention';

const now = new Date('2026-09-05T10:00:00.000Z');

function review(daysAgo: number, grade: string, phase = 'review') {
  return {
    occurred_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    grade,
    phase_before: phase,
  };
}

describe('observedRetention', () => {
  it('cuenta como acierto todo lo que no es again', () => {
    const reviews = [review(1, 'good'), review(2, 'hard'), review(3, 'again'), review(4, 'easy')];

    expect(observedRetention(reviews, now, 7).rate).toBeCloseTo(0.75);
  });

  it('excluye las tarjetas que estaban en aprendizaje', () => {
    // Fallar algo que ves por segunda vez en diez minutos no dice nada sobre
    // tu retención a treinta días.
    const reviews = [review(1, 'good'), review(1, 'again', 'learning'), review(1, 'again', 'relearning')];

    expect(observedRetention(reviews, now, 7).rate).toBe(1);
    expect(observedRetention(reviews, now, 7).sample).toBe(1);
  });

  it('respeta la ventana pedida', () => {
    const reviews = [review(2, 'good'), review(40, 'again')];

    expect(observedRetention(reviews, now, 7).sample).toBe(1);
    expect(observedRetention(reviews, now, 30).sample).toBe(1);
    expect(observedRetention(reviews, now, 60).sample).toBe(2);
  });

  it('devuelve la distancia al objetivo, con signo', () => {
    const reviews = [review(1, 'good'), review(2, 'good'), review(3, 'again'), review(4, 'good')];

    // 0,75 observado contra 0,9 objetivo: se está repasando demasiado tarde.
    expect(observedRetention(reviews, now, 7, 0.9).target_gap).toBeCloseTo(-0.15);
  });

  it('no inventa una tasa sin muestra', () => {
    // Cero repasos no es cero retención. Devolver 0 aquí haría que la pantalla
    // dijera que no recuerdas nada cuando lo que pasa es que no has estudiado.
    expect(observedRetention([], now, 7).rate).toBeNull();
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/analytics/retention.ts
//
// Cierra el lazo del Plan 4A: allí se fija una retención objetivo y aquí se
// comprueba si la real converge a ella. Un objetivo que nadie mide es una
// preferencia, no un control.
export interface RetentionReview {
  occurred_at: string;
  grade: string;
  /** Fase de la tarjeta ANTES del repaso. */
  phase_before: string;
}

export interface Retention {
  /** null cuando no hay muestra: cero repasos no es cero retención. */
  rate: number | null;
  sample: number;
  target_gap: number | null;
}

export function observedRetention(
  reviews: readonly RetentionReview[],
  now: Date,
  windowDays: number,
  target?: number,
): Retention {
  const from = now.getTime() - windowDays * 86_400_000;

  const eligible = reviews.filter(
    (review) =>
      review.phase_before === 'review' && Date.parse(review.occurred_at) >= from,
  );

  if (eligible.length === 0) {
    return { rate: null, sample: 0, target_gap: null };
  }

  const recalled = eligible.filter((review) => review.grade !== 'again').length;
  const rate = recalled / eligible.length;

  return {
    rate,
    sample: eligible.length,
    target_gap: target === undefined ? null : rate - target,
  };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain/src/analytics
git commit -m "feat(analytics): retención observada por ventana, con distancia al objetivo"
```

---

## Task 3: Dominio por habilidad y cobertura demostrada

**Files:**
- Create: `packages/domain/src/analytics/mastery.ts`, `mastery.test.ts`

**Interfaces:**
- Consumes: `learner_skill_state`, `unit_word`.
- Produces: `masteryBySkill(states, now): Record<Skill, { demonstrated, started, oldest_days }>` y `syllabusCoverage(states, scope, now): { in_scope, started, demonstrated, percent_demonstrated }`.

La diferencia entre «cobertura del sílabo» del Plan 1B y ésta: aquella cuenta **lo que la app enseña**, ésta cuenta **lo que el usuario ha demostrado**. El criterio de salida del Plan 1 en el maestro pedía las dos.

`mastered` deja de ser un estado permanente. Cada cifra viene con su fecha: «47 palabras demostradas en reconocimiento, la más antigua hace 62 días». Una demostración de hace dos meses sin repaso posterior no vale lo mismo que una de ayer, y decirlo es más honesto que un número solo.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/analytics/mastery.test.ts
import { masteryBySkill, syllabusCoverage } from './mastery';

const now = new Date('2026-09-05T00:00:00.000Z');

function state(id: number, skill: string, stability: number, daysAgo = 1) {
  return {
    target_id: id,
    skill,
    stability,
    suspended: false,
    last_reviewed_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

describe('masteryBySkill', () => {
  it('cuenta por habilidad y no las mezcla', () => {
    const states = [state(1, 'recognition', 200), state(1, 'listening', 3), state(2, 'recognition', 200)];

    const result = masteryBySkill(states, now);

    expect(result.recognition.demonstrated).toBe(2);
    expect(result.listening.demonstrated).toBe(0);
  });

  it('acompaña cada cifra con la demostración más antigua', () => {
    // Una demostración de hace dos meses sin repaso posterior no vale lo mismo
    // que una de ayer.
    const states = [state(1, 'recognition', 200, 62), state(2, 'recognition', 200, 3)];

    expect(masteryBySkill(states, now).recognition.oldest_days).toBe(62);
  });

  it('no cuenta lo suspendido como demostrado', () => {
    const suspended = { ...state(1, 'recognition', 200), suspended: true };

    expect(masteryBySkill([suspended], now).recognition.demonstrated).toBe(0);
  });
});

describe('syllabusCoverage', () => {
  it('separa lo que la app enseña de lo que el usuario demuestra', () => {
    const scope = [1, 2, 3, 4];
    const states = [state(1, 'recognition', 200), state(2, 'recognition', 3)];

    const coverage = syllabusCoverage(states, scope, now);

    expect(coverage.in_scope).toBe(4);
    expect(coverage.started).toBe(2);
    expect(coverage.demonstrated).toBe(1);
  });

  it('no divide por cero con un alcance vacío', () => {
    expect(syllabusCoverage([], [], now).percent_demonstrated).toBe(0);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/analytics/mastery.ts
//
// "Cobertura del sílabo" del Plan 1B cuenta lo que la app enseña. Esto cuenta
// lo que el usuario ha demostrado. El criterio de salida del Plan 1 pedía las
// dos, y confundirlas haría creer que tener el contenido es saberlo.
import { MASTERED_STABILITY_DAYS } from '../scheduling/schedule';

export interface SkillStateRow {
  target_id: number;
  skill: string;
  stability: number | null;
  suspended: boolean;
  last_reviewed_at: string | null;
}

export interface SkillMastery {
  demonstrated: number;
  started: number;
  /** Días desde la demostración más antigua que aún se cuenta como válida. */
  oldest_days: number | null;
}

const SKILLS = ['recognition', 'recall', 'listening', 'reading', 'production'] as const;

function isDemonstrated(state: SkillStateRow): boolean {
  return !state.suspended && (state.stability ?? 0) >= MASTERED_STABILITY_DAYS;
}

export function masteryBySkill(
  states: readonly SkillStateRow[],
  now: Date,
): Record<string, SkillMastery> {
  const result: Record<string, SkillMastery> = {};

  for (const skill of SKILLS) {
    const mine = states.filter((state) => state.skill === skill);
    const demonstrated = mine.filter(isDemonstrated);

    let oldest: number | null = null;
    for (const state of demonstrated) {
      if (!state.last_reviewed_at) continue;
      const days = Math.floor((now.getTime() - Date.parse(state.last_reviewed_at)) / 86_400_000);
      if (oldest === null || days > oldest) oldest = days;
    }

    result[skill] = {
      demonstrated: demonstrated.length,
      started: mine.filter((state) => !state.suspended).length,
      oldest_days: oldest,
    };
  }

  return result;
}

export function syllabusCoverage(
  states: readonly SkillStateRow[],
  scope: readonly number[],
  now: Date,
): { in_scope: number; started: number; demonstrated: number; percent_demonstrated: number } {
  const inScope = new Set(scope);
  const relevant = states.filter(
    (state) => state.skill === 'recognition' && inScope.has(state.target_id),
  );
  const demonstrated = relevant.filter(isDemonstrated).length;

  return {
    in_scope: inScope.size,
    started: relevant.filter((state) => !state.suspended).length,
    demonstrated,
    percent_demonstrated: inScope.size === 0 ? 0 : Math.round((demonstrated / inScope.size) * 100),
  };
}
```

El umbral se **importa** de `schedule.ts` en vez de redefinirse. Si `cardPhase` y esta pantalla usaran umbrales distintos, el planificador y el progreso discreparían sobre qué está aprendido, y ése es exactamente el tipo de divergencia que costó un plan entero en flashcards. Exporta `MASTERED_STABILITY_DAYS` desde `schedule.ts` si todavía es privado.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain/src/analytics
git commit -m "feat(analytics): dominio por habilidad y cobertura demostrada, con fecha"
```

---

## Task 4: Lectura: velocidad y esfuerzo

**Files:**
- Create: `packages/domain/src/analytics/reading.ts`, `reading.test.ts`

**Interfaces:**
- Consumes: `reading_progress` (Plan 8), `word_looked_up` (Tarea 1).
- Produces: `readingSpeed(sessions)` y `lookupsPer100Tokens(lookups, tokens)`.

- [ ] **Step 1: Write the failing test**

```ts
describe('readingSpeed', () => {
  it('calcula caracteres por minuto', () => {
    const sessions = [{ chars: 90, seconds: 180, pinyin_shown: false }];

    expect(readingSpeed(sessions).chars_per_minute).toBe(30);
  });

  it('separa las lecturas con pinyin de las que no', () => {
    // Con pinyin visible se está leyendo una transcripción, no hanzi.
    const sessions = [
      { chars: 90, seconds: 180, pinyin_shown: false },
      { chars: 90, seconds: 90, pinyin_shown: true },
    ];

    const speed = readingSpeed(sessions);

    expect(speed.chars_per_minute).toBe(30);
    expect(speed.with_pinyin_chars_per_minute).toBe(60);
  });

  it('descarta sesiones absurdamente rápidas', () => {
    // Abrir y cerrar una lectura no es haberla leído; contarlo dispararía la
    // media y haría la métrica inútil.
    const sessions = [{ chars: 90, seconds: 2, pinyin_shown: false }];

    expect(readingSpeed(sessions).chars_per_minute).toBeNull();
  });

  it('devuelve null sin sesiones en vez de cero', () => {
    expect(readingSpeed([]).chars_per_minute).toBeNull();
  });
});

describe('lookupsPer100Tokens', () => {
  it('normaliza por longitud para poder comparar lecturas', () => {
    expect(lookupsPer100Tokens(6, 200)).toBe(3);
  });

  it('no divide por cero', () => {
    expect(lookupsPer100Tokens(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/analytics/reading.ts

export interface ReadingSession {
  chars: number;
  seconds: number;
  pinyin_shown: boolean | null;
}

/**
 * Por encima de diez caracteres por segundo no se está leyendo chino, se está
 * desplazando. Abrir y cerrar una lectura dispararía la media y volvería la
 * métrica inútil justo cuando más se usa la app.
 */
const MAX_PLAUSIBLE_CHARS_PER_SECOND = 10;

function average(sessions: readonly ReadingSession[]): number | null {
  const usable = sessions.filter(
    (session) =>
      session.seconds > 0 && session.chars / session.seconds <= MAX_PLAUSIBLE_CHARS_PER_SECOND,
  );

  if (usable.length === 0) return null;

  const chars = usable.reduce((sum, session) => sum + session.chars, 0);
  const seconds = usable.reduce((sum, session) => sum + session.seconds, 0);

  return Math.round((chars / seconds) * 60);
}

export function readingSpeed(sessions: readonly ReadingSession[]): {
  chars_per_minute: number | null;
  with_pinyin_chars_per_minute: number | null;
} {
  return {
    // Sin pinyin es la métrica que importa: con él se lee una transcripción.
    chars_per_minute: average(sessions.filter((session) => !session.pinyin_shown)),
    with_pinyin_chars_per_minute: average(sessions.filter((session) => session.pinyin_shown)),
  };
}

export function lookupsPer100Tokens(lookups: number, tokens: number): number | null {
  if (tokens <= 0) return null;
  return Math.round((lookups / tokens) * 100 * 10) / 10;
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain/src/analytics
git commit -m "feat(analytics): velocidad de lectura y consultas por 100 tokens"
```

---

## Task 5: Una consulta que reúne el historial

**Files:**
- Modify: `supabase/migrations/2026090601_analytics.sql`, `packages/data/src/repositories/stats.ts`, `types.ts`, `factory.ts`

**Interfaces:**
- Produces: RPC `learning_report()` y `getLearningReport(client)`.

Una sola llamada que devuelve el historial en crudo —repasos con su fase previa, intentos por habilidad, sesiones de lectura, consultas— y **el cálculo se hace en el cliente** con las funciones de las Tareas 2 a 4.

Es el mismo reparto que el Plan 5A hizo con la cola, y por la misma razón: la política y el cálculo viven en un solo sitio, en TypeScript, donde están probados. La base agrega y filtra, que es lo que sabe hacer bien.

- [ ] **Step 1: Escribir la RPC**

```sql
-- Devuelve el historial que la analítica necesita, sin calcular ninguna
-- métrica: el cálculo vive en packages/domain, probado con fixtures. Duplicarlo
-- aquí sería la tercera vez que este proyecto mantiene dos implementaciones de
-- la misma fórmula, y las dos anteriores costaron un plan entero cada una.
create or replace function public.learning_report(p_days integer default 90)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurred_at', e.occurred_at,
        'grade', e.payload->>'grade',
        'skill', e.skill,
        'phase_before', e.payload->>'phase_before'
      ))
      from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'review_rated'
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurred_at', e.occurred_at,
        'skill', e.skill,
        'correct', (e.payload->>'correct')::boolean,
        'mode', e.payload->>'mode'
      ))
      from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'exercise_attempted'
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), '[]'::jsonb),
    'lookups', coalesce((
      select count(*) from public.learning_event e
      where e.user_id = auth.uid()
        and e.kind = 'word_looked_up'
        and e.occurred_at >= now() - make_interval(days => p_days)
    ), 0),
    'reading_sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.reading_slug,
        'seconds', extract(epoch from (p.finished_at - p.started_at)),
        'pinyin_shown', p.pinyin_shown
      ))
      from public.reading_progress p
      where p.user_id = auth.uid()
        and p.finished_at is not null
        and p.started_at is not null
    ), '[]'::jsonb),
    'skill_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', s.target_id,
        'skill', s.skill,
        'stability', s.stability,
        'suspended', s.suspended,
        'last_reviewed_at', s.last_reviewed_at
      ))
      from public.learner_skill_state s
      where s.user_id = auth.uid() and s.target_kind = 'word'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.learning_report(integer) from public;
grant execute on function public.learning_report(integer) to authenticated;
```

**`review_rated` no guarda hoy `phase_before`.** Sin él, la Tarea 2 no puede excluir las tarjetas en aprendizaje y la retención sale contaminada. Añádelo al `jsonb_build_object` de `apply_review`, que ya tiene el estado previo a mano en `p_prior`:

```sql
    jsonb_build_object('grade', p_grade, 'card_id', p_card_id,
                       'phase_before', p_prior->>'state')
```

- [ ] **Step 2: Write the failing test**

```ts
  it('pide el historial de una sola vez', async () => {
    const client = reportClient();

    await getLearningReport(client);

    expect((client as any).rpc).toHaveBeenCalledWith('learning_report', { p_days: 90 });
  });

  it('devuelve listas vacías cuando no hay historial, no null', async () => {
    const client = reportClient({});

    const report = await getLearningReport(client);

    expect(report.reviews).toEqual([]);
    expect(report.attempts).toEqual([]);
  });
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations packages/data/src
git commit -m "feat(analytics): learning_report reúne el historial en una llamada"
```

---

## Task 6: La pantalla responde «¿voy bien?»

**Files:**
- Create: `apps/mobile/src/screens/ProgressScreen.tsx`, `ProgressScreen.test.tsx`
- Modify: `apps/mobile/src/screens/TodayScreen.tsx`

**Interfaces:**
- Consumes: todo lo anterior.

Lo que sustituye al conteo de actividad. Tres bloques, y ninguno muestra un número sin decir de dónde sale.

- [ ] **Step 1: Write the failing test**

```tsx
  it('muestra la retención con su tamaño de muestra', async () => {
    // Un 92 % sobre 5 repasos y sobre 500 no son lo mismo, y sin la muestra
    // no hay forma de saber cuál es.
    mockGetReport.mockResolvedValue(reportWith({ reviews: manyReviews }));

    await renderProgress();

    expect(screen.getByText(/92 %/)).toBeTruthy();
    expect(screen.getByText(/sobre 120 repasos/)).toBeTruthy();
  });

  it('dice que no hay muestra en vez de mostrar un cero', async () => {
    mockGetReport.mockResolvedValue(reportWith({ reviews: [] }));

    await renderProgress();

    expect(screen.getByText(/Aún no hay repasos suficientes/)).toBeTruthy();
    expect(screen.queryByText('0 %')).toBeNull();
  });

  it('explica por qué la comprensión inferencial está vacía', async () => {
    // El validador del Plan 7 exige evidencia textual en toda pregunta, así que
    // todas son literales por construcción. Callarlo daría a entender que el
    // usuario falla en algo que nadie le ha preguntado.
    await renderProgress();

    expect(screen.getByText(/todas las preguntas del catálogo son literales/i)).toBeTruthy();
  });

  it('desglosa el vocabulario demostrado por habilidad', async () => {
    await renderProgress();

    expect(screen.getByText('Reconocimiento')).toBeTruthy();
    expect(screen.getByText('Escucha')).toBeTruthy();
  });
```

- [ ] **Step 2: Write minimal implementation**

Los tres bloques:

1. **Memoria** — retención a 7 y 30 días con su muestra y la distancia al objetivo, y una frase que la interpreta: por encima del objetivo se está repasando de más, por debajo demasiado tarde.
2. **Competencias** — vocabulario demostrado por habilidad sobre el alcance del sílabo, con la antigüedad de la demostración más vieja. La gramática, por unidades completadas.
3. **Lectura** — velocidad con y sin pinyin, consultas por 100 tokens, y comprensión literal. La inferencial aparece con su motivo, no oculta.

Cada bloque sin datos dice qué falta para tenerlos. `TodayScreen` enlaza a la pantalla y deja de ser el sitio donde se miran los números.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src
git commit -m "feat(mobile): pantalla de progreso por competencias, con evidencia y muestra"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. Abrir la ficha de una palabra en una lectura registra un `word_looked_up`, y solo uno.
3. La pantalla de progreso muestra retención a 7 y 30 días **con su tamaño de muestra**.
4. Ninguna métrica sin datos muestra un cero: todas dicen qué falta.
5. El vocabulario demostrado aparece desglosado por habilidad, con la antigüedad de la demostración más antigua.
6. `git grep -n "cards_reviewed" apps/mobile/src` no devuelve nada en la pantalla de progreso: el conteo de actividad deja de ser la métrica principal.

## Lo que este plan deja explícitamente sin resolver

- **La comprensión inferencial no se mide**, porque no existe: el validador del Plan 7 exige evidencia textual en toda pregunta y las hace todas literales. Medirla pide contenido nuevo y relajar ese validador a propósito.
- **La retención solo se mide desde que `apply_review` guarde `phase_before`.** Los repasos anteriores a la Tarea 5 no lo tienen y quedan fuera de la muestra, que es preferible a contarlos mal.
- **No hay predicción de aprobado.** «¿Estoy listo para el examen?» necesita correlacionar estas métricas con resultados reales, y no hay ni un examen hecho. Lo que sí hay es cobertura demostrada por competencia, que es el dato honesto disponible.
- **Los umbrales no están calibrados.** «Demostrado» son 180 días de estabilidad porque es lo que el Plan 4A eligió, no porque se haya medido contra resultados. Con datos de varios meses habría que revisarlo.
- **Nada de esto se exporta.** Ver la evolución en una hoja de cálculo pediría una exportación, y con un solo usuario no compensa todavía.
