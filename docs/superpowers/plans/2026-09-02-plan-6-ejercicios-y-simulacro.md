# Plan 6 — Ejercicios: de un selector a una unidad, y un simulacro de verdad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que practicar deje de ser «elige nivel y tipo y te doy un ejercicio al azar de dos», y pase a ser una unidad con objetivo y progreso, con un cuaderno de errores detrás y un simulacro que se parezca al examen.

**Architecture:** El Plan 2 dejó la evaluación resuelta —contrato tipado, evaluador único, diagnóstico por tipo— y el 5B dejó las unidades derivadas del sílabo. Lo que falta es todo lo de en medio: el banco tiene dos ejercicios por combinación de nivel y tipo, la pantalla es un selector manual, y no hay ni sesión ni memoria de lo fallado. Este plan reutiliza el modelo del Plan 7 para el contenido —ficheros validados en la build— y el del 5B para la sesión, y añade lo único genuinamente nuevo: el formato del examen, transcrito de la muestra oficial.

**Tech Stack:** Node 26 (`.nvmrc`), vitest para `packages/*` y `scripts/`, Jest para `apps/mobile`, TypeScript, Supabase.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea**, y desde la Tarea 2 eso incluye validar el banco entero.
- **Depende del Plan 2** (contrato y evaluador), del **5B** (unidades y modo Exam) y del **1C** (`learning_event`, `exercise_template`).
- **Ningún ejercicio entra sin pasar los validadores**, igual que ninguna lectura en el Plan 7.
- **Prohibido escribir mitigaciones.**
- **No se inventa la estructura del examen.** Se transcribe de la muestra oficial, y lo que no se pueda leer se deja anotado en vez de rellenarse.

## Estado de partida verificado (2 de septiembre de 2026)

- **El banco tiene exactamente 2 ejercicios por combinación nivel×tipo**: 30 en total, 2 por cada uno de los 15 pares. La auditoría lo decía y sigue igual.
- **`ExercisesScreen` es un selector manual**: una fila de niveles HSK 1–3 y una rejilla de cinco tipos. No hay sesión, ni longitud, ni progreso, ni resumen.
- **La evaluación ya está bien.** El Plan 2 dejó en `packages/domain/src/exercises/` el contrato (`ExerciseKind`, `ExerciseAnswer`, `ExerciseSolution`), `evaluateAnswer` con `EvaluationDetail`, e `isAnswerComplete`. Este plan no toca nada de eso: lo consume.
- **`exercise_template` ya mapea tipo a habilidad** desde el Plan 1C: `multiple_choice` y `matching` son reconocimiento, `fill_blank` es lectura, `reorder` es producción, `dictation` es escucha.
- Los ejercicios semilla llevan `explanation`, pero es una glosa del vocabulario —«喜欢 (xǐhuān) means 'to like'»—, no un diagnóstico del error.

## La fuente del examen

Verificado accesible el 2 de septiembre de 2026, en el centro de recursos oficial `kw.chinesetest.cn`:

| Documento | URL | Estado |
|---|---|---|
| Esquema oficial de HSK 2 | `https://www.chinesetest.cn/userfiles/file/dagang/HSK2.pdf` | HTTP 200, 834 954 bytes |
| Muestra de examen HSK 2 | `https://www.chinesetest.cn/userfiles/file/HSK/level2/H20901.pdf` | HTTP 200, 380 840 bytes |

**Los dos usan fuentes CID con codificación propia.** Al inflar sus streams salen los números —de la muestra se leen `35`, `25`, `2`, `25`, `22`, `55`, `5`, que parecen la tabla de secciones, preguntas y minutos— pero el texto chino no es legible sin descodificar el CMap incrustado.

Sería fácil suponer la estructura a partir de esos números y probablemente acertar. **No se hace.** Es la misma situación que el sílabo en el Plan 1B: la fuente es oficial, no es legible por máquina, y transcribirla es parte del trabajo, no un supuesto del plan. La Tarea 1 la transcribe mirando el documento; el resto del plan consume esa transcripción.

## File Structure

**Se crean:**
- `server/db/seeds/exam-structure.json` — la estructura transcrita, fichero curado.
- `packages/domain/src/exercises/validate.ts`, `validate.test.ts`
- `packages/domain/src/exercises/diagnose.ts`, `diagnose.test.ts`
- `server/db/seeds/exercises/*.json` — un ejercicio por fichero.
- `scripts/build-exercises.js`, `build-exercises.test.js`
- `supabase/migrations/2026090210_exercise_units.sql`
- `apps/mobile/src/screens/MistakesScreen.tsx`, `MistakesScreen.test.tsx`

**Se modifican:**
- `apps/mobile/src/screens/ExercisesScreen.tsx`, `apps/mobile/src/exercises/useExerciseSession.ts`, `FillBlankExercise.tsx`
- `packages/data/src/repositories/exercises.ts`, `types.ts`, `factory.ts`
- `scripts/build-supabase-seed.js`, `package.json`

---

## Task 1: Transcribir la estructura del examen

**Files:**
- Create: `server/db/seeds/exam-structure.json`
- Modify: `data/sources.json`, `scripts/corpus-contract.test.js`

**Interfaces:**
- Produces: `exam-structure.json` con las secciones de HSK 2, sus tipos de pregunta, cuántas hay de cada una y cuántos minutos. La consume la Tarea 6.

- [ ] **Step 1: Descargar y fijar las fuentes**

Añade los dos PDF a `data/sources.json`, el manifiesto que creó el Plan 1B, con sus sumas medidas:

```bash
node --input-type=module -e "
const { createHash } = await import('node:crypto');
for (const [id, url] of [
  ['exam-outline-2', 'https://www.chinesetest.cn/userfiles/file/dagang/HSK2.pdf'],
  ['exam-sample-2', 'https://www.chinesetest.cn/userfiles/file/HSK/level2/H20901.pdf'],
]) {
  const b = Buffer.from(await (await fetch(url)).arrayBuffer());
  console.log(id, createHash('sha256').update(b).digest('hex'), b.length);
}
"
```

Y ejecuta `npm run fetch-syllabus` para dejarlos en `data/`.

- [ ] **Step 2: Transcribir mirando el documento**

Abre `data/HSK2_sample.pdf` en un lector y escribe `server/db/seeds/exam-structure.json`. La forma, con los campos que la Tarea 6 necesita:

```json
{
  "hsk_level": 2,
  "source": "H20901",
  "source_note": "Transcrito a mano de la muestra oficial. El PDF usa fuentes CID y no se puede extraer por script.",
  "total_minutes": 0,
  "answer_sheet_minutes": 0,
  "sections": [
    {
      "code": "listening",
      "title": "听力",
      "minutes": 0,
      "parts": [
        { "code": "1", "question_count": 0, "format": "", "our_type": "" }
      ]
    }
  ]
}
```

`our_type` mapea cada parte oficial a uno de los cinco tipos que la app ya sabe renderizar, o a `null` si ninguno sirve. **Un `null` es información valiosa**: dice qué parte del examen la app todavía no puede practicar, y la Tarea 6 lo muestra en vez de esconderlo.

- [ ] **Step 3: Write the failing test**

En `scripts/corpus-contract.test.js`:

```js
  it('la estructura del examen cuadra consigo misma', () => {
    const exam = JSON.parse(readFileSync(join(seedDir, 'exam-structure.json'), 'utf8'));

    const questions = exam.sections.flatMap((s) => s.parts).reduce((n, p) => n + p.question_count, 0);
    const minutes = exam.sections.reduce((n, s) => n + s.minutes, 0);

    expect(questions).toBeGreaterThan(0);
    expect(minutes + exam.answer_sheet_minutes).toBe(exam.total_minutes);
  });

  it('cada parte declara si la app puede practicarla', () => {
    const exam = JSON.parse(readFileSync(join(seedDir, 'exam-structure.json'), 'utf8'));
    const known = new Set(['fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching', null]);

    for (const part of exam.sections.flatMap((s) => s.parts)) {
      expect(known.has(part.our_type)).toBe(true);
    }
  });
```

El primer test es el que cazaría una transcripción descuidada: si los minutos de las secciones más los de la hoja de respuestas no dan el total, algo se copió mal.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add data/sources.json server/db/seeds/exam-structure.json scripts/corpus-contract.test.js
git commit -m "feat(exam): transcribir la estructura oficial del examen HSK 2"
```

---

## Task 2: El banco de ejercicios se valida en la build

**Files:**
- Create: `packages/domain/src/exercises/validate.ts`, `validate.test.ts`, `scripts/build-exercises.js`, `build-exercises.test.js`
- Create: `server/db/seeds/exercises/*.json`
- Modify: `scripts/build-supabase-seed.js`, `package.json`

**Interfaces:**
- Consumes: `toSolution`, `ExerciseKind` (Plan 2); `tokenizeReading` (Plan 7).
- Produces: `validateExercise(exercise, context): ValidationIssue[]` y `validateBank()`.

Mismo modelo que el Plan 7 con las lecturas, y por la misma razón: un ejercicio malo debe romper la build, no llegar al usuario. Dos por combinación es tan poco que la pantalla repite el mismo inmediatamente, cosa que la auditoría señala.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/exercises/validate.test.ts
import { validateExercise } from './validate';

const context = {
  dictionary: [
    { hanzi: '我', pinyin: 'wǒ', hsk_level: 1 },
    { hanzi: '喜欢', pinyin: 'xǐhuan', hsk_level: 1 },
    { hanzi: '喝', pinyin: 'hē', hsk_level: 1 },
    { hanzi: '茶', pinyin: 'chá', hsk_level: 1 },
    { hanzi: '贵', pinyin: 'guì', hsk_level: 1 },
    { hanzi: '咖啡', pinyin: 'kāfēi', hsk_level: 2 },
    { hanzi: '比', pinyin: 'bǐ', hsk_level: 2 },
  ],
  max_level: 2,
};

const valid = {
  slug: 'l2-bi-comparison-01',
  type: 'fill_blank' as const,
  hsk_level: 2,
  unit_code: '6.3.4',
  prompt: { sentence: '咖啡___茶贵。', options: ['比', '喜欢', '喝', '茶'], correct: '比' },
  explanation: '比 compara dos cosas: A 比 B + adjetivo.',
};

describe('validateExercise', () => {
  it('acepta un ejercicio correcto', () => {
    expect(validateExercise(valid, context)).toEqual([]);
  });

  it('exige que la respuesta esté entre las opciones', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, correct: '虽然' } };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('answer_not_in_options');
  });

  it('rechaza opciones repetidas', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, options: ['比', '比', '喝', '茶'] } };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('duplicate_options');
  });

  it('rechaza vocabulario fuera de nivel', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, sentence: '咖啡___图书馆贵。' } };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('unknown_vocabulary');
  });

  it('exige que fill_blank tenga un hueco', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, sentence: '咖啡比茶贵。' } };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('no_blank');
  });

  it('exige una explicación que no sea solo la traducción de la respuesta', () => {
    // "比 (bǐ) means 'than'" no explica por qué la respuesta es ésa.
    const broken = { ...valid, explanation: "比 (bǐ) means 'than'." };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('gloss_not_explanation');
  });

  it('exige que el ejercicio declare a qué unidad pertenece', () => {
    const broken = { ...valid, unit_code: '' };

    expect(validateExercise(broken, context).map((i) => i.kind)).toContain('no_unit');
  });
});
```

- [ ] **Step 2: Write minimal implementation**

El validador que merece un comentario es el de la explicación, porque es el que distingue este banco del actual:

```ts
/**
 * Una explicación que solo traduce la respuesta no explica nada: el usuario ya
 * sabe cuál era, lo que no sabe es por qué. Las 30 semillas actuales son todas
 * de esta forma —"喜欢 (xǐhuān) means 'to like'"— así que ninguna sobreviviría
 * a esta regla, y ése es el punto.
 *
 * La heurística es deliberadamente tosca: una explicación que cabe en el patrón
 * "X (pinyin) means 'Y'" y no dice nada más, se rechaza. Detectar una buena
 * explicación es imposible automáticamente; detectar esta forma concreta de
 * explicación vacía, no.
 */
const GLOSS_ONLY = /^\s*\S+\s*\([^)]*\)\s*means\s+['"][^'"]*['"]\.?\s*$/i;
```

```ts
// packages/domain/src/exercises/validate.ts
import { tokenizeReading, type DictionaryEntry } from '../reading/tokenize';

export type ExerciseIssueKind =
  | 'answer_not_in_options'
  | 'duplicate_options'
  | 'unknown_vocabulary'
  | 'no_blank'
  | 'gloss_not_explanation'
  | 'no_unit';

export interface ExerciseIssue {
  kind: ExerciseIssueKind;
  detail?: string;
}

export interface ExerciseValidationContext {
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
}

const BLANK = '___';

export function validateExercise(
  exercise: { slug: string; type: string; unit_code: string; prompt: any; explanation: string },
  context: ExerciseValidationContext,
): ExerciseIssue[] {
  const issues: ExerciseIssue[] = [];
  const allowed = context.dictionary.filter((entry) => entry.hsk_level <= context.max_level);

  if (!exercise.unit_code) {
    issues.push({ kind: 'no_unit' });
  }

  if (GLOSS_ONLY.test(exercise.explanation ?? '')) {
    issues.push({ kind: 'gloss_not_explanation' });
  }

  const options: string[] = exercise.prompt?.options ?? [];
  if (options.length > 0) {
    if (new Set(options).size !== options.length) {
      issues.push({ kind: 'duplicate_options' });
    }
    if (exercise.prompt?.correct && !options.includes(exercise.prompt.correct)) {
      issues.push({ kind: 'answer_not_in_options', detail: exercise.prompt.correct });
    }
  }

  const sentence: string = exercise.prompt?.sentence ?? '';

  if (exercise.type === 'fill_blank' && !sentence.includes(BLANK)) {
    issues.push({ kind: 'no_blank' });
  }

  // El hueco se quita antes de tokenizar: "___" no es una palabra y saldría
  // como vocabulario desconocido en todos los fill_blank del banco.
  for (const token of tokenizeReading(sentence.split(BLANK).join(''), allowed)) {
    if (token.type === 'unknown') {
      issues.push({ kind: 'unknown_vocabulary', detail: token.text });
    }
  }

  return issues;
}
```

`scripts/build-exercises.js` es el gemelo de `build-readings.js`: carga `server/db/seeds/exercises/*.json`, valida todos, imprime los problemas con su ubicación y sale con código 1 si hay alguno.

- [ ] **Step 3: Migrar las 30 semillas y ampliar**

Convierte `exercises-pool.json` a un fichero por ejercicio en `server/db/seeds/exercises/`, añadiendo `slug` y `unit_code`. **Las 30 fallarán el validador de la explicación**, y eso es correcto: reescribe las explicaciones para que digan por qué, no qué.

Después amplía hasta **al menos 6 por combinación de nivel y tipo** —90 en total— priorizando las unidades de HSK 2. Con dos, la pantalla repite el mismo ejercicio de inmediato; con seis, no.

- [ ] **Step 4: Verificar y commitear**

```bash
npm run build-exercises && npm test
```

```bash
git add packages/domain/src/exercises scripts/ server/db/seeds/exercises
git commit -m "feat(exercises): banco validado en la build, con explicaciones que explican"
```

---

## Task 3: La sesión es una unidad, no un selector

**Files:**
- Create: `supabase/migrations/2026090210_exercise_units.sql`
- Modify: `apps/mobile/src/screens/ExercisesScreen.tsx`, `apps/mobile/src/exercises/useExerciseSession.ts`, `packages/data/src/repositories/exercises.ts`

**Interfaces:**
- Consumes: `active_unit()` (Plan 5B), `exercise_template` (Plan 1C).
- Produces: RPC `build_exercise_session(p_unit_code, p_length)`.

La progresión de siete pasos que pide la auditoría —input, noticing, discriminación, reconstrucción, producción, transferencia, repaso— no se implementa como siete pantallas nuevas. **Se implementa como un orden sobre los tipos que ya existen**, porque cada tipo cae naturalmente en un escalón:

| Escalón | Tipo | Por qué |
|---|---|---|
| Discriminación | `multiple_choice` | Elegir entre opciones es reconocer |
| Discriminación | `matching` | Emparejar es reconocer en bloque |
| Reconstrucción | `fill_blank` | Recuperar desde el contexto |
| Reconstrucción | `reorder` | Construir con las piezas dadas |
| Producción | `dictation` | Escribir sin piezas |

Input, noticing y transferencia no tienen tipo que los represente y **no se fingen**: input y noticing los cubre la lectura de la unidad (Plan 7), y transferencia necesitaría producción libre, que no hay forma de evaluar. La sesión los declara igual que el planificador del 5B declara sus huecos.

- [ ] **Step 1: Write the failing test**

```tsx
  it('propone la unidad activa en vez de pedir que elijas nivel y tipo', async () => {
    mockBuildSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });

    await renderExercises();

    expect(screen.getByText('离合词')).toBeTruthy();
    expect(screen.queryByText('HSK 1')).toBeNull();
  });

  it('ordena los ejercicios de discriminación a producción', async () => {
    mockBuildSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [
        { slug: 'e1', type: 'dictation' },
        { slug: 'e2', type: 'multiple_choice' },
        { slug: 'e3', type: 'reorder' },
      ],
      length: 3,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    // multiple_choice primero, dictation al final.
    expect(screen.getByTestId('exercise-slug').props.children).toBe('e2');
  });

  it('muestra el progreso y termina con un resumen', async () => {
    mockBuildSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [{ slug: 'e1', type: 'multiple_choice' }],
      length: 1,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('no repite el mismo ejercicio dos veces seguidas', async () => {
    // Con dos ejercicios por combinación, la pantalla actual podía dar el
    // mismo dos veces seguidas.
    mockBuildSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [{ slug: 'e1', type: 'multiple_choice' }, { slug: 'e1', type: 'multiple_choice' }],
      length: 2,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByText('1/1')).toBeTruthy();
  });
```

- [ ] **Step 2: Write minimal implementation**

`build_exercise_session` selecciona ejercicios de la unidad activa, sin repetir `slug`, hasta `p_length`. El orden por escalón lo pone el cliente con una función pura en `packages/domain/src/exercises/order.ts`:

```ts
/**
 * El orden va de reconocer a producir. No es una preferencia estética: empezar
 * por dictado obliga a producir algo que todavía no se reconoce, y eso mide
 * frustración, no aprendizaje.
 */
const STEP: Record<ExerciseKind, number> = {
  multiple_choice: 0,
  matching: 0,
  fill_blank: 1,
  reorder: 1,
  dictation: 2,
};

export function orderExercises<T extends { type: ExerciseKind }>(exercises: readonly T[]): T[] {
  return [...exercises].sort((a, b) => STEP[a.type] - STEP[b.type]);
}
```

`ExercisesScreen` pierde la fila de niveles y la rejilla de tipos, y gana cabecera de unidad, contador de progreso y pantalla de resumen, siguiendo el patrón de fases que `CardsScreen` ya usa.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/domain/src/exercises packages/data/src supabase/migrations
git commit -m "feat(exercises): sesión por unidad con progresión de reconocimiento a producción"
```

---

## Task 4: El cuaderno de errores

**Files:**
- Create: `apps/mobile/src/screens/MistakesScreen.tsx`, `MistakesScreen.test.tsx`
- Modify: `supabase/migrations/2026090210_exercise_units.sql`, `packages/data/src/repositories/exercises.ts`

**Interfaces:**
- Consumes: `learning_event` (Plan 1C).
- Produces: RPC `mistake_queue(p_limit)` y `getMistakes(client)`.

Un error que no vuelve no enseña nada. Hoy los intentos se registran y ahí se quedan.

El cuaderno no es una lista de vergüenzas: es una cola. Un fallo entra, y sale cuando se acierta dos veces seguidas en días distintos. Dos veces porque una puede ser suerte; en días distintos porque acertar al minuto siguiente mide memoria de trabajo.

- [ ] **Step 1: Write the failing test**

```ts
  it('mete en la cola lo fallado', async () => {
    const client = mistakeClient([{ target_id: 42, misses: 1, hits_since: 0 }]);

    expect(await getMistakes(client)).toHaveLength(1);
  });

  it('saca de la cola lo acertado dos veces en días distintos', async () => {
    const client = mistakeClient([{ target_id: 42, misses: 1, hits_since: 2, distinct_days: 2 }]);

    expect(await getMistakes(client)).toHaveLength(0);
  });

  it('mantiene en la cola lo acertado dos veces el mismo día', async () => {
    // Acertar dos veces seguidas mide memoria de trabajo, no aprendizaje.
    const client = mistakeClient([{ target_id: 42, misses: 1, hits_since: 2, distinct_days: 1 }]);

    expect(await getMistakes(client)).toHaveLength(1);
  });
```

- [ ] **Step 2: Write minimal implementation**

```sql
-- Un error que no vuelve no enseña nada. La cola se calcula del log de eventos
-- en vez de guardarse aparte: así no hay dos verdades que mantener de acuerdo.
create or replace function public.mistake_queue(p_limit integer default 20)
returns table(target_id bigint, misses integer, hits_since integer, distinct_days integer)
language sql
security definer
set search_path = public
as $$
  with attempts as (
    select
      e.target_id,
      e.occurred_at,
      (e.payload->>'correct')::boolean as correct,
      max(case when (e.payload->>'correct')::boolean is false then e.occurred_at end)
        over (partition by e.target_id) as last_miss
    from public.learning_event e
    where e.user_id = auth.uid()
      and e.kind = 'exercise_attempted'
      and e.target_kind = 'word'
  )
  select
    a.target_id,
    count(*) filter (where not a.correct)::integer as misses,
    count(*) filter (where a.correct and a.occurred_at > a.last_miss)::integer as hits_since,
    count(distinct date(a.occurred_at)) filter (
      where a.correct and a.occurred_at > a.last_miss
    )::integer as distinct_days
  from attempts a
  where a.last_miss is not null
  group by a.target_id
  having count(*) filter (where a.correct and a.occurred_at > a.last_miss) < 2
      or count(distinct date(a.occurred_at)) filter (
           where a.correct and a.occurred_at > a.last_miss
         ) < 2
  order by max(a.last_miss) desc
  limit greatest(1, p_limit);
$$;
```

`MistakesScreen` lista las palabras de la cola con lo que se falló y un botón para practicarlas, que arranca una sesión con esos objetivos.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations packages/data/src apps/mobile/src
git commit -m "feat(exercises): cuaderno de errores con salida por dos aciertos en días distintos"
```

---

## Task 5: Fill blank deja de regalar la respuesta, y el fallo se explica

**Files:**
- Create: `packages/domain/src/exercises/diagnose.ts`, `diagnose.test.ts`
- Modify: `apps/mobile/src/exercises/FillBlankExercise.tsx`

**Interfaces:**
- Consumes: `EvaluationDetail` (Plan 2).
- Produces: `diagnose(detail: EvaluationDetail): string`.

Dos defectos pequeños con la misma raíz: la pantalla ayuda cuando no debe y calla cuando debería hablar.

- [ ] **Step 1: Write the failing test**

```tsx
  it('no muestra las opciones mientras se escribe', async () => {
    // Ver las cuatro opciones convierte recuperación activa en reconocimiento.
    await render(<FillBlankExercise prompt={prompt} value={answer} onChange={jest.fn()} />);

    expect(screen.queryByText('已经')).toBeNull();
  });

  it('ofrece las opciones solo si se piden', async () => {
    await render(<FillBlankExercise prompt={prompt} value={answer} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByText('Ver opciones'));

    expect(screen.getByText('已经')).toBeTruthy();
  });
```

```ts
// packages/domain/src/exercises/diagnose.test.ts
describe('diagnose', () => {
  it('dice qué posición estaba mal en un reorder', () => {
    const detail = { kind: 'reorder' as const, first_wrong_index: 2 };

    expect(diagnose(detail)).toMatch(/tercera/);
  });

  it('dice cuántas parejas fallaron en un matching', () => {
    const detail = { kind: 'matching' as const, wrong_pairs: ['茶', '咖啡'] };

    expect(diagnose(detail)).toMatch(/2/);
  });

  it('distingue un fallo de tono de uno de sílaba en dictado', () => {
    // Escribir "cha2" por "cha3" es un error distinto de escribir "sha".
    const detail = { kind: 'dictation' as const, syllables_match: true, tones_match: false };

    expect(diagnose(detail)).toMatch(/tono/i);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

`FillBlankExercise` esconde las opciones tras un botón «Ver opciones», y usarlo cuenta como pista —lo que el Plan 4B ya sabe penalizar en la nota.

```ts
// packages/domain/src/exercises/diagnose.ts
//
// La explicación del ejercicio dice por qué la respuesta correcta lo es. Esto
// dice qué pasó con la tuya. Son cosas distintas y hasta ahora solo existía la
// primera, y a medias.
import type { EvaluationDetail } from './evaluate';

const ORDINAL = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta'];

export function diagnose(detail: EvaluationDetail): string {
  switch (detail.kind) {
    case 'reorder': {
      const position = ORDINAL[detail.first_wrong_index] ?? `posición ${detail.first_wrong_index + 1}`;
      return `El orden se tuerce en la ${position} pieza.`;
    }
    case 'matching': {
      const count = detail.wrong_pairs.length;
      return `${count} ${count === 1 ? 'pareja' : 'parejas'} sin emparejar bien: ${detail.wrong_pairs.join('、')}.`;
    }
    case 'dictation':
      // Confundir el tono y confundir la sílaba son errores distintos: el
      // primero es de escucha fina, el segundo de vocabulario.
      if (detail.syllables_match && !detail.tones_match) {
        return 'Las sílabas están bien; falla el tono.';
      }
      return 'La sílaba no es la que suena.';
    default:
      return 'No es la respuesta correcta.';
  }
}
```

Si `EvaluationDetail` del Plan 2 no trae `first_wrong_index`, `wrong_pairs`, `syllables_match` o `tones_match`, añádelos ahí: el evaluador ya calcula esa información para decidir, y descartarla obligaba a recalcularla aquí.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain/src/exercises apps/mobile/src/exercises
git commit -m "feat(exercises): recuperación activa en fill blank y diagnóstico del fallo"
```

---

## Task 6: El simulacro

**Files:**
- Modify: `apps/mobile/src/screens/ExercisesScreen.tsx`, `packages/data/src/repositories/exercises.ts`
- Modify: `supabase/migrations/2026090210_exercise_units.sql`

**Interfaces:**
- Consumes: `exam-structure.json` (Tarea 1), el modo Exam (Plan 5B).
- Produces: RPC `build_mock_exam(p_level, p_scope)` con `p_scope` en `('section', 'full')`.

El simulacro respeta las tres reglas del modo Exam que fijó el Plan 5B: sin ayudas, con tiempo, y **no reprograma nada**. Y añade una cuarta propia: **enseña qué partes del examen no puede simular**.

- [ ] **Step 1: Write the failing test**

```tsx
  it('cronometra cada sección con los minutos oficiales', async () => {
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'listening', title: '听力', minutes: 25, exercises: [] }],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Simulacro'));

    expect(screen.getByText('25:00')).toBeTruthy();
  });

  it('dice qué partes del examen no puede simular todavía', async () => {
    // Ser honesto sobre la cobertura vale más que aparentar un examen completo.
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'listening', title: '听力', minutes: 25, exercises: [] }],
      unsupported: [{ section: '书写', reason: 'no_matching_type' }],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Simulacro'));

    expect(screen.getByText(/书写/)).toBeTruthy();
  });

  it('no reprograma ninguna tarjeta', async () => {
    mockBuildMock.mockResolvedValue({
      sections: [
        { code: 'reading', title: '阅读', minutes: 22, exercises: [{ slug: 'e1', type: 'multiple_choice' }] },
      ],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Simulacro'));
    await fireEvent.press(screen.getByText('Empezar'));
    await answerFirst();

    expect(mockRateCard).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Write minimal implementation**

`build_mock_exam` lee `exam-structure.json` —sembrado en una tabla `exam_structure` por `build-supabase-seed.js`— y para cada parte con `our_type` no nulo selecciona esa cantidad de ejercicios del tipo correspondiente. Las partes con `our_type` nulo se devuelven en `unsupported` con su motivo.

El cronómetro por sección reutiliza `useSessionTimer`, que el Plan 4A dejó con cobertura de `start`, `stop` y reinicio.

`p_scope` distingue practicar una sección de hacer el examen entero. Una sección son 22 o 25 minutos y cabe en un rato; el completo pide casi una hora, y ofrecer solo esa opción es garantizar que no se use.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/data/src supabase/migrations
git commit -m "feat(exam): simulacro por secciones con los tiempos oficiales"
```

---

## Criterio de salida del plan

1. `npm test` en verde, incluido el validador del banco completo.
2. `npm run build-exercises` informa al menos 6 ejercicios por combinación de nivel y tipo, 0 con problemas.
3. Ninguna explicación del banco tiene la forma «X (pinyin) means 'Y'».
4. `ExercisesScreen` no ofrece elegir nivel ni tipo: propone la unidad activa.
5. Fallar un ejercicio mete la palabra en el cuaderno, y sale tras dos aciertos en días distintos.
6. El simulacro cronometra por sección y nombra las partes del examen que no puede simular.

## Lo que este plan deja explícitamente sin resolver

- **Speaking y pronunciación.** Sin evaluación de voz no hay forma de puntuarlo, y un ejercicio que no se puede aprobar es peor que no tenerlo. Es la misma decisión que tomó el Plan 4B con la habilidad `production`.
- **Escritura a mano de caracteres.** El sílabo la evalúa; simularla pide un lienzo y reconocimiento de trazo, que es un subsistema entero.
- **Input, noticing y transferencia** no tienen tipo de ejercicio propio. Los dos primeros los cubre la lectura de la unidad; el tercero necesitaría producción libre.
- **La estructura del examen se transcribe a mano.** Los PDF oficiales usan fuentes CID y no se pueden extraer por script. Si algún día se publica una versión legible, la Tarea 1 se automatiza.
- **Solo se transcribe HSK 2.** Los otros niveles tienen su PDF en la misma URL, cambiando el número.
