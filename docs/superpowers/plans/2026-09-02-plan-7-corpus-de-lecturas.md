# Plan 7 — Corpus de lecturas: contenido real, validado en la build

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que «lectura» deje de significar el mismo párrafo de catorce caracteres para todos los niveles y formatos, y pase a ser un catálogo curado que ningún texto puede entrar sin pasar validaciones.

**Architecture:** La decisión central de este plan es **cuándo** se crea el contenido. Hoy se intenta crear en tiempo de ejecución y no se crea nada: la Edge Function devuelve una fila cacheada al azar o inserta un texto fijo. Este plan mueve la creación a **tiempo de construcción**: las lecturas son ficheros fuente en el repositorio, un script las valida y las compila al seed, y `npm test` falla si alguna no cumple. El contenido pasa a revisarse en un diff, como el código.

Eso resuelve de raíz lo que la auditoría pide con «la etiqueta AI nunca debe sustituir control de calidad», y de paso elimina la necesidad de un proveedor en runtime: no hay clave que configurar, no hay latencia, no hay respuesta impredecible delante del usuario, y el catálogo entero se puede auditar en un `git diff`.

**Tech Stack:** Node 26 (`.nvmrc`), vitest para `packages/*` y `scripts/`, Jest para `apps/mobile`, TypeScript, Supabase (Postgres, Edge Functions en Deno).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea**, y a partir de la Tarea 3 eso incluye validar el catálogo entero.
- **Depende del Plan 1B** (corpus con sentidos, gramática oficial) y del **1C** (`content_item`, `content_teaches`). No depende del 5B, pero es quien lo enciende: los tres pasos que el planificador diario deja apagados se encienden cuando este plan llena el catálogo.
- **Ninguna lectura entra sin pasar los validadores.** Ni las escritas a mano, ni las generadas, ni las de prueba. Un validador con excepciones no es un validador.
- **Prohibido escribir mitigaciones.**

## La decisión: generar en la build, no en runtime

El plan maestro planteaba la alternativa como «conectar un proveedor real detrás de validadores, o eliminar el ajuste». Al aterrizarlo aparece una tercera opción que es mejor que las dos:

| | Generación en runtime | **Generación en la build** |
|---|---|---|
| Cuándo se crea | Cuando el usuario pulsa | Cuando alguien escribe el fichero |
| Quién la revisa | Un validador, en el mejor caso | Un validador **y** un diff |
| Si sale mal | El usuario lo ve | La build falla |
| Coste | Clave, cuota, latencia | Ninguno |
| Reproducible | No | Sí: el texto está en git |
| Auditable | Consultando la base | `git log server/db/seeds/readings/` |

El contenido lo escribe quien ejecute el plan —persona o agente— y los validadores deciden si entra. **Que lo escriba un modelo no es el problema; que entre sin revisión, sí.** Con este reparto, un texto generado y uno escrito a mano pasan exactamente por el mismo filtro.

Consecuencias directas, y todas cierran cosas que la auditoría señala:

- `buildFallbackReading` desaparece. No hay texto de emergencia porque no hay generación que pueda fallar.
- El botón «Generate reading» pasa a llamarse lo que hace: abre una lectura del catálogo.
- `ai_provider` y `api_key_configured` se eliminan de los ajustes. No es esconder un selector placebo: es que deja de haber nada que seleccionar.

## Estado de partida verificado (2 de septiembre de 2026)

- **El fallback sigue exactamente como lo describe la auditoría.** `buildFallbackReading` en `supabase/functions/_shared/ai.ts:74` devuelve `你好！我每天学习汉语。我喜欢读书，也喜欢喝茶。` **para cualquier nivel y cualquier formato**; solo cambia el título.
- `generate-reading` busca hasta 20 filas cacheadas del nivel y formato pedidos, **devuelve una al azar**, y si no hay ninguna inserta el fallback y lo devuelve.
- **`generated_readings` no tiene dónde guardar lo que hace falta**: sus columnas son `hsk_level, format, title, content, pinyin_text, questions, source_model, created_by`. No hay tema, ni segmentación por frases, ni traducción, ni vínculo con vocabulario o gramática, ni estado de revisión.
- `settings.ai_provider` sigue vivo con `api_key_configured: false` **fijo en el código**, y `YouScreen.tsx:286` sigue pintando el selector.
- El tokenizador está **duplicado**: `supabase/functions/_shared/reading-tokenizer.ts` y `server/services/reading-tokenizer.js`. El segundo está congelado con el servidor legado.

## Sobre los temas

La auditoría lista nueve temas —vida diaria, estudio, trabajo, eventos, lugares, compras, salud, ocio y comunicación interpersonal— y este plan los usa. **No son una extracción del sílabo oficial**: el Plan 1B dejó anotado que el PDF describe temas y tareas en prosa y que extraerlos es trabajo editorial pendiente. Son una taxonomía razonable y declarada como tal, no una cita.

## File Structure

**Se crean:**
- `packages/domain/src/reading/tokenize.ts` — el tokenizador, ahora en un solo sitio.
- `packages/domain/src/reading/tokenize.test.ts`
- `packages/domain/src/reading/validate.ts` — los validadores deterministas.
- `packages/domain/src/reading/validate.test.ts`
- `server/db/seeds/readings/*.json` — una lectura por fichero.
- `scripts/build-readings.js` — valida y compila el catálogo.
- `scripts/build-readings.test.js`
- `supabase/migrations/2026090209_reading_catalog.sql`

**Se modifican:**
- `supabase/functions/generate-reading/index.ts`, `supabase/functions/_shared/ai.ts`
- `supabase/functions/_shared/reading-tokenizer.ts` (pasa a reexportar el de dominio)
- `packages/data/src/repositories/readings.ts`, `settings.ts`, `types.ts`
- `apps/mobile/src/screens/ReadingsScreen.tsx`, `YouScreen.tsx`
- `scripts/build-supabase-seed.js`, `package.json`

---

## Task 1: Un tokenizador, no dos

**Files:**
- Create: `packages/domain/src/reading/tokenize.ts`, `tokenize.test.ts`
- Modify: `supabase/functions/_shared/reading-tokenizer.ts`, `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `tokenizeReading(text: string, dictionary: DictionaryEntry[]): ReadingToken[]`. La consumen las Tareas 2 y 3, y la Edge Function.

Los validadores necesitan saber qué palabras contiene un texto, y eso es tokenizar. Antes de escribirlos hay que decidir dónde vive el tokenizador, porque ahora mismo hay dos copias y añadir una tercera en `scripts/` sería empezar el plan repitiendo el error que la auditoría señala en flashcards.

- [ ] **Step 1: Mover la implementación**

Copia `supabase/functions/_shared/reading-tokenizer.ts` a `packages/domain/src/reading/tokenize.ts` sin cambiar su lógica —la coincidencia más larga primero funciona— y exporta desde `packages/domain/src/index.ts`. Copia también su test.

`supabase/functions/_shared/reading-tokenizer.ts` pasa a ser una línea:

```ts
// El tokenizador vive en packages/domain. Deno lo consume por npm:; tener dos
// copias haría que el texto se partiese distinto en el validador y en la app.
export { tokenizeReading, type ReadingToken, type DictionaryEntry } from 'npm:@hanyu/domain';
```

- [ ] **Step 2: Write the failing test**

Los tests copiados deben pasar tal cual. Añade el que faltaba, que es el defecto §6.12 de la auditoría:

```ts
  it('elige la coincidencia más larga aunque una más corta aparezca antes', () => {
    const dictionary = [
      { hanzi: '中', pinyin: 'zhōng' },
      { hanzi: '中国', pinyin: 'zhōngguó' },
      { hanzi: '国人', pinyin: 'guórén' },
      { hanzi: '中国人', pinyin: 'zhōngguórén' },
    ];

    expect(tokenizeReading('中国人', dictionary).map((t) => t.text)).toEqual(['中国人']);
  });

  it('separa la puntuación como token propio', () => {
    // El Plan 4B reconstruye las frases apoyándose en esto.
    const tokens = tokenizeReading('你好。我', [{ hanzi: '你好', pinyin: 'nǐ hǎo' }]);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'punctuation', 'unknown']);
  });
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain supabase/functions/_shared/reading-tokenizer.ts
git commit -m "refactor(domain): un solo tokenizador de lecturas"
```

---

## Task 2: Los validadores

**Files:**
- Create: `packages/domain/src/reading/validate.ts`, `validate.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `tokenizeReading` (Tarea 1).
- Produces: `validateReading(reading, context): ValidationIssue[]`, donde una lista vacía significa que la lectura puede publicarse. La consumen las Tareas 3 y 4.

Los once validadores que enumera la auditoría, todos deterministas y todos con un motivo que se puede leer. Ninguno usa un modelo: si una regla necesitase juicio, no sería un validador sino una revisión, y ésa la hace quien mira el diff.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/reading/validate.test.ts
import { validateReading } from './validate';

const dictionary = [
  { hanzi: '我', pinyin: 'wǒ', hsk_level: 1 },
  { hanzi: '喜欢', pinyin: 'xǐhuān', hsk_level: 1 },
  { hanzi: '喝', pinyin: 'hē', hsk_level: 1 },
  { hanzi: '茶', pinyin: 'chá', hsk_level: 1 },
  { hanzi: '比', pinyin: 'bǐ', hsk_level: 2 },
  { hanzi: '咖啡', pinyin: 'kāfēi', hsk_level: 2 },
  { hanzi: '好喝', pinyin: 'hǎohē', hsk_level: 2 },
];

const context = { dictionary, max_level: 2, target_word_ids: [] };

const valid = {
  slug: 'tea-vs-coffee',
  title: '茶和咖啡',
  hsk_level: 2,
  format: 'short_text',
  topic: 'comida',
  sentences: [
    { zh: '我喜欢喝茶。', pinyin: 'Wǒ xǐhuān hē chá.', es: 'Me gusta beber té.' },
    { zh: '茶比咖啡好喝。', pinyin: 'Chá bǐ kāfēi hǎohē.', es: 'El té está más rico que el café.' },
  ],
  target_words: ['比'],
  target_grammar: ['6.3.4'],
  questions: [
    {
      prompt: '说话人更喜欢什么？',
      options: ['茶', '咖啡', '水'],
      answer_index: 0,
      evidence_sentence: 1,
    },
  ],
};

describe('validateReading', () => {
  it('acepta una lectura correcta', () => {
    expect(validateReading(valid, context)).toEqual([]);
  });

  it('rechaza vocabulario por encima del nivel', () => {
    const reading = {
      ...valid,
      sentences: [{ zh: '我喜欢喝茶。图书馆。', pinyin: '...', es: '...' }],
    };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('unknown_vocabulary');
  });

  it('exige que cada frase tenga pinyin y traducción', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶。', pinyin: '', es: '' }] };
    const kinds = validateReading(reading, context).map((i) => i.kind);

    expect(kinds).toContain('missing_pinyin');
    expect(kinds).toContain('missing_translation');
  });

  it('exige que cada frase termine en puntuación', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶', pinyin: 'a', es: 'b' }] };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('unsegmented');
  });

  it('rechaza una lectura demasiado corta para su nivel', () => {
    // El fallback actual tiene 22 caracteres y se sirve como lectura de
    // cualquier nivel. Ésta es la regla que lo habría rechazado.
    const reading = { ...valid, sentences: [{ zh: '我喜欢。', pinyin: 'a', es: 'b' }] };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('too_short');
  });

  it('exige que la respuesta correcta no esté siempre en la misma posición', () => {
    // Las dos preguntas del fallback tienen la respuesta en A.
    const reading = {
      ...valid,
      questions: [
        { ...valid.questions[0], answer_index: 0 },
        { ...valid.questions[0], answer_index: 0 },
        { ...valid.questions[0], answer_index: 0 },
      ],
    };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('answers_not_spread');
  });

  it('exige que cada pregunta apunte a una frase que exista', () => {
    const reading = {
      ...valid,
      questions: [{ ...valid.questions[0], evidence_sentence: 9 }],
    };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('missing_evidence');
  });

  it('rechaza distractores repetidos o iguales a la respuesta', () => {
    const reading = {
      ...valid,
      questions: [{ ...valid.questions[0], options: ['茶', '茶', '水'] }],
    };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('duplicate_options');
  });

  it('exige que las palabras objetivo aparezcan de verdad en el texto', () => {
    const reading = { ...valid, target_words: ['图书馆'] };

    expect(validateReading(reading, context).map((i) => i.kind)).toContain('target_absent');
  });

  it('señala dónde está el problema, no solo que lo hay', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶', pinyin: '', es: '' }] };
    const issue = validateReading(reading, context).find((i) => i.kind === 'missing_pinyin');

    expect(issue?.sentence_index).toBe(0);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/reading/validate.ts
//
// Once reglas deterministas. Ninguna usa un modelo: si una regla necesitase
// juicio no sería un validador sino una revisión, y ésa la hace quien mira el
// diff. Una lista vacía de problemas es la única condición para publicar.
import { tokenizeReading, type DictionaryEntry } from './tokenize';

export type IssueKind =
  | 'unknown_vocabulary'
  | 'missing_pinyin'
  | 'missing_translation'
  | 'unsegmented'
  | 'too_short'
  | 'too_long'
  | 'answers_not_spread'
  | 'missing_evidence'
  | 'duplicate_options'
  | 'target_absent'
  | 'no_questions';

export interface ValidationIssue {
  kind: IssueKind;
  detail?: string;
  sentence_index?: number;
  question_index?: number;
}

export interface ReadingSentence {
  zh: string;
  pinyin: string;
  es: string;
}

export interface ReadingQuestion {
  prompt: string;
  options: string[];
  answer_index: number;
  /** Índice de la frase que justifica la respuesta. */
  evidence_sentence: number;
}

export interface ReadingSource {
  slug: string;
  title: string;
  hsk_level: number;
  format: string;
  topic: string;
  sentences: ReadingSentence[];
  target_words: string[];
  target_grammar: string[];
  questions: ReadingQuestion[];
}

export interface ValidationContext {
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
  target_word_ids: number[];
}

/**
 * Longitud por nivel, en caracteres. Los mínimos existen porque un texto corto
 * no da contexto suficiente para inferir nada: el fallback actual tiene 22
 * caracteres y se servía como lectura de cualquier nivel.
 */
const LENGTH = {
  1: { min: 40, max: 120 },
  2: { min: 80, max: 220 },
  3: { min: 150, max: 400 },
} as const;

const SENTENCE_END = /[。！？…]$/;

export function validateReading(
  reading: ReadingSource,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowed = context.dictionary.filter((entry) => entry.hsk_level <= context.max_level);
  const allowedForms = new Set(allowed.map((entry) => entry.hanzi));

  reading.sentences.forEach((sentence, index) => {
    if (!sentence.pinyin.trim()) {
      issues.push({ kind: 'missing_pinyin', sentence_index: index });
    }
    if (!sentence.es.trim()) {
      issues.push({ kind: 'missing_translation', sentence_index: index });
    }
    if (!SENTENCE_END.test(sentence.zh.trim())) {
      issues.push({ kind: 'unsegmented', sentence_index: index });
    }

    for (const token of tokenizeReading(sentence.zh, allowed)) {
      if (token.type === 'unknown') {
        issues.push({ kind: 'unknown_vocabulary', detail: token.text, sentence_index: index });
      }
    }
  });

  const text = reading.sentences.map((sentence) => sentence.zh).join('');
  const length = [...text].filter((character) => !/[。！？…，、；：""''（）]/.test(character)).length;
  const bounds = LENGTH[reading.hsk_level as 1 | 2 | 3] ?? LENGTH[2];

  if (length < bounds.min) {
    issues.push({ kind: 'too_short', detail: `${length} < ${bounds.min}` });
  }
  if (length > bounds.max) {
    issues.push({ kind: 'too_long', detail: `${length} > ${bounds.max}` });
  }

  for (const target of reading.target_words) {
    if (!text.includes(target)) {
      issues.push({ kind: 'target_absent', detail: target });
    }
    if (!allowedForms.has(target)) {
      issues.push({ kind: 'unknown_vocabulary', detail: target });
    }
  }

  if (reading.questions.length === 0) {
    issues.push({ kind: 'no_questions' });
  }

  reading.questions.forEach((question, index) => {
    if (new Set(question.options).size !== question.options.length) {
      issues.push({ kind: 'duplicate_options', question_index: index });
    }
    if (
      question.evidence_sentence < 0 ||
      question.evidence_sentence >= reading.sentences.length
    ) {
      issues.push({ kind: 'missing_evidence', question_index: index });
    }
  });

  // Con tres o más preguntas, tenerlas todas en la misma opción convierte el
  // cuestionario en un test de pulsar siempre A. Las dos del fallback actual
  // caen justo en ese patrón.
  if (reading.questions.length >= 3) {
    const positions = new Set(reading.questions.map((question) => question.answer_index));
    if (positions.size === 1) {
      issues.push({ kind: 'answers_not_spread' });
    }
  }

  return issues;
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain
git commit -m "feat(domain): validadores deterministas de lecturas"
```

---

## Task 3: El catálogo se compila y se valida en la build

**Files:**
- Create: `scripts/build-readings.js`, `build-readings.test.js`, `supabase/migrations/2026090209_reading_catalog.sql`
- Modify: `scripts/build-supabase-seed.js`, `package.json`

**Interfaces:**
- Consumes: `validateReading` (Tarea 2).
- Produces: `loadReadings(): ReadingSource[]` y `validateCatalog(): { slug, issues }[]`. Las consume la Tarea 4.

Una lectura por fichero, en `server/db/seeds/readings/`. El script las valida todas y falla si alguna tiene problemas; `npm test` lo ejecuta, así que **una lectura mala rompe la build en vez de llegar al usuario**.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090209_reading_catalog.sql
--
-- generated_readings guardaba el texto y poco más: ni tema, ni traducción por
-- frase, ni qué enseña la lectura. Sin eso el planificador no puede recomendar
-- nada y el lector no puede mostrar la frase traducida.

create table if not exists public.reading (
  slug text primary key,
  hsk_level integer not null check (hsk_level between 1 and 3),
  format text not null check (format in ('short_text', 'story', 'dialogue')),
  title text not null,
  topic text not null,
  series text,
  series_index integer,
  -- Una frase por elemento: {zh, pinyin, es}. La segmentación es del autor, no
  -- se infiere partiendo por puntos, porque el lector la usa para alinear la
  -- traducción y el audio.
  sentences jsonb not null,
  questions jsonb not null default '[]'::jsonb,
  -- 'tts' mientras no haya grabación humana. La columna existe para que la
  -- diferencia sea consultable en vez de asumida.
  audio_kind text not null default 'tts' check (audio_kind in ('tts', 'human')),
  audio_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reading_level_topic on public.reading(hsk_level, topic);

alter table public.reading enable row level security;

drop policy if exists reading_select_authenticated on public.reading;
create policy reading_select_authenticated on public.reading
for select using (auth.role() = 'authenticated');

-- Qué enseña cada lectura, en las tablas que el Plan 1C creó y dejó vacías.
-- Esto es lo que enciende los pasos apagados del planificador del Plan 5B.
insert into public.content_item (kind, hsk_level, title, source_table, source_id)
select 'reading', r.hsk_level, r.title, 'reading', r.slug
from public.reading r
on conflict do nothing;

-- generated_readings queda para el histórico de intentos y deja de servir
-- contenido. reading_attempts la sigue referenciando.
comment on table public.generated_readings is
  'Obsoleta desde el Plan 7. El catálogo vive en public.reading.';
```

- [ ] **Step 2: Write the failing test**

```js
// scripts/build-readings.test.js
import { loadReadings, validateCatalog } from './build-readings.js';

describe('catálogo de lecturas', () => {
  it('carga las lecturas del directorio', () => {
    expect(loadReadings().length).toBeGreaterThan(0);
  });

  it('cada lectura tiene un slug único', () => {
    const slugs = loadReadings().map((reading) => reading.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todas las lecturas del catálogo pasan los validadores', () => {
    // Éste es el test que convierte el catálogo en algo en lo que se puede
    // confiar: una lectura mala rompe la build, no llega al usuario.
    const bad = validateCatalog().filter((entry) => entry.issues.length > 0);

    expect(
      bad.map((entry) => `${entry.slug}: ${entry.issues.map((i) => i.kind).join(', ')}`),
    ).toEqual([]);
  });
});
```

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/build-readings.js
//
// El contenido se crea en tiempo de construcción, no de ejecución: cada lectura
// es un fichero del repositorio que pasa por los validadores antes de entrar al
// seed. Un texto malo rompe la build en vez de llegar al usuario, y el catálogo
// entero se revisa en un diff.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReading } from '../packages/domain/src/reading/validate.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const readingDir = join(seedDir, 'readings');

export function loadReadings() {
  return readdirSync(readingDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(readingDir, name), 'utf8')));
}

function loadDictionary() {
  const dictionary = [];
  for (const level of [1, 2, 3]) {
    for (const word of JSON.parse(
      readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf8'),
    )) {
      dictionary.push({ hanzi: word.hanzi, pinyin: word.pinyin, hsk_level: level });
    }
  }
  return dictionary;
}

export function validateCatalog() {
  const dictionary = loadDictionary();

  return loadReadings().map((reading) => ({
    slug: reading.slug,
    issues: validateReading(reading, {
      dictionary,
      max_level: reading.hsk_level,
      target_word_ids: [],
    }),
  }));
}

if (process.argv[1] && process.argv[1].endsWith('build-readings.js')) {
  const results = validateCatalog();
  const bad = results.filter((entry) => entry.issues.length > 0);

  for (const entry of bad) {
    console.error(`\n${entry.slug}`);
    for (const issue of entry.issues) {
      const where =
        issue.sentence_index !== undefined
          ? ` (frase ${issue.sentence_index + 1})`
          : issue.question_index !== undefined
            ? ` (pregunta ${issue.question_index + 1})`
            : '';
      console.error(`  ${issue.kind}${where}${issue.detail ? `: ${issue.detail}` : ''}`);
    }
  }

  console.log(`\n${results.length} lecturas, ${bad.length} con problemas`);
  if (bad.length > 0) process.exit(1);
}
```

Añade a `package.json`: `"build-readings": "node scripts/build-readings.js"`, y en `scripts/build-supabase-seed.js` un bloque que emita `public.reading` desde `loadReadings()`, con `on conflict (slug) do update`.

- [ ] **Step 4: Run tests and commit**

Con el directorio vacío, `loadReadings()` devuelve `[]` y el primer test falla. Eso es correcto: la Tarea 4 lo arregla escribiendo contenido. Comitea el andamiaje con el test rojo, como hizo el Plan 1A con el contrato del corpus.

```bash
git add scripts/build-readings.js scripts/build-readings.test.js supabase/migrations/2026090209_reading_catalog.sql package.json
git commit -m "feat(readings): catálogo validado en la build, sin contenido todavía"
```

---

## Task 4: Las diez primeras lecturas

**Files:**
- Create: `server/db/seeds/readings/*.json` (diez ficheros)

**Interfaces:**
- Consumes: los validadores de la Tarea 2 y el compilador de la Tarea 3.

La auditoría es explícita: **10 lecturas impecables antes que 60 mediocres**. Diez es suficiente para que el planificador tenga qué recomendar y para descubrir si el formato aguanta; sesenta antes de saberlo es escribir sesenta veces el mismo error.

Reparto, con las series que dan continuidad narrativa:

| Slug | Tema | Formato | Serie | Gramática objetivo |
|---|---|---|---|---|
| `market-01-first-visit` | compras | short_text | mercado | `比` (6.3.4) |
| `market-02-too-expensive` | compras | dialogue | mercado | `太…了` |
| `market-03-buying-fruit` | compras | short_text | mercado | 数量补语 |
| `school-01-new-classmate` | estudio | story | escuela | `是…的` (6.3.5) |
| `school-02-forgot-homework` | estudio | dialogue | escuela | `因为…所以…` |
| `home-01-morning` | vida diaria | short_text | — | 动词重叠 |
| `home-02-cooking` | vida diaria | story | — | `着` |
| `health-01-i-feel-bad` | salud | dialogue | — | `虽然…但是…` |
| `travel-01-asking-the-way` | lugares | dialogue | — | 趋向补语 |
| `leisure-01-weekend-plan` | ocio | short_text | — | `一…就…` |

- [ ] **Step 1: Escribir la primera y validarla**

La primera va escrita entera, para que el resto tenga un modelo concreto en vez de una plantilla con puntos suspensivos. **Su vocabulario está verificado contra el corpus**: los 86 caracteres usan solo formas presentes en HSK 1–2 de la revisión 2025.

`server/db/seeds/readings/shop-01-tea-and-coffee.json`:

```json
{
  "slug": "shop-01-tea-and-coffee",
  "title": "去商店买东西",
  "hsk_level": 2,
  "format": "short_text",
  "topic": "compras",
  "series": "tienda",
  "series_index": 1,
  "target_words": ["比", "咖啡", "但是"],
  "target_grammar": ["6.3.4"],
  "sentences": [
    { "zh": "今天我和朋友去商店买东西。", "pinyin": "Jīntiān wǒ hé péngyou qù shāngdiàn mǎi dōngxi.", "es": "Hoy mi amigo y yo fuimos a la tienda a comprar cosas." },
    { "zh": "商店里的水果很多。", "pinyin": "Shāngdiàn lǐ de shuǐguǒ hěn duō.", "es": "En la tienda hay mucha fruta." },
    { "zh": "我买了苹果和茶。", "pinyin": "Wǒ mǎi le píngguǒ hé chá.", "es": "Compré manzanas y té." },
    { "zh": "朋友买了咖啡。", "pinyin": "Péngyou mǎi le kāfēi.", "es": "Mi amigo compró café." },
    { "zh": "咖啡比茶贵。", "pinyin": "Kāfēi bǐ chá guì.", "es": "El café es más caro que el té." },
    { "zh": "一个苹果三元，一个咖啡十元。", "pinyin": "Yí gè píngguǒ sān yuán, yí gè kāfēi shí yuán.", "es": "Una manzana cuesta tres yuanes; un café, diez." },
    { "zh": "但是朋友说咖啡很好喝。", "pinyin": "Dànshì péngyou shuō kāfēi hěn hǎo hē.", "es": "Pero mi amigo dice que el café está muy rico." },
    { "zh": "我觉得茶也很好喝。", "pinyin": "Wǒ juéde chá yě hěn hǎo hē.", "es": "Yo creo que el té también está muy rico." },
    { "zh": "我们喝了茶，也吃了苹果。", "pinyin": "Wǒmen hē le chá, yě chī le píngguǒ.", "es": "Bebimos té y también comimos manzanas." },
    { "zh": "我很喜欢那个商店。", "pinyin": "Wǒ hěn xǐhuan nàge shāngdiàn.", "es": "Me gusta mucho esa tienda." }
  ],
  "questions": [
    {
      "prompt": "咖啡和茶，哪个贵？",
      "options": ["茶", "咖啡", "水果"],
      "answer_index": 1,
      "evidence_sentence": 4
    },
    {
      "prompt": "我买了什么？",
      "options": ["苹果和茶", "咖啡", "水"],
      "answer_index": 0,
      "evidence_sentence": 2
    },
    {
      "prompt": "一个咖啡多少钱？",
      "options": ["三元", "一元", "十元"],
      "answer_index": 2,
      "evidence_sentence": 5
    }
  ]
}
```

Fíjate en tres cosas que los validadores comprueban y que ésta cumple a propósito: las respuestas caen en las posiciones 1, 0 y 2; cada pregunta apunta a la frase que la contesta; y `好喝` no existe como palabra en HSK 2, pero `好` y `喝` sí, así que el tokenizador lo parte en dos formas conocidas y el texto pasa.

**Palabras que parecen de este nivel y no lo están** —comprobado contra el corpus, para ahorrarte el intento—: `杯`, `市场`, `香蕉`, `老板`, `好喝`, `高兴`. Usa `商店` en vez de `市场`.

Reglas de autoría que los validadores no pueden comprobar y hay que respetar igual:

- **Todo el vocabulario dentro de HSK 1–2.** El validador lo comprueba, pero es más rápido escribir mirando el corpus que arreglar después.
- **Tres preguntas por lectura, con la respuesta repartida.** Dos permitirían coincidir en la misma posición sin que el validador se queje.
- **Cada pregunta apunta a la frase que la justifica.** Si no hay una frase que la conteste, la pregunta pide inferencia y esta lectura no es el sitio.
- **Los distractores tienen que ser plausibles.** Una opción absurda convierte tres opciones en dos.
- **La traducción española es por frase, no libre.** El lector la alinea con el chino.

Tras escribir cada una:

```bash
npm run build-readings
```

Expected: la lectura aparece sin problemas. Si sale `unknown_vocabulary`, la palabra no está en el corpus del nivel: cámbiala en vez de subir `max_level`.

- [ ] **Step 2: Escribir las nueve restantes**

Una por una, validando cada vez. Escribir las diez y validar al final oculta qué falló dónde.

- [ ] **Step 3: Verificar el catálogo completo**

```bash
npm run build-readings && node scripts/build-supabase-seed.js && npm test
```

Expected: `10 lecturas, 0 con problemas`, y los 5 pasos en PASS —incluido el test de la Tarea 3 que estaba rojo.

- [ ] **Step 4: Commit**

```bash
git add server/db/seeds/readings supabase/seed.sql
git commit -m "feat(readings): diez lecturas HSK 2 validadas, en tres series"
```

---

## Task 5: Retirar el fallback y la generación en runtime

**Files:**
- Modify: `supabase/functions/generate-reading/index.ts`, `supabase/functions/_shared/ai.ts`
- Modify: `packages/data/src/repositories/readings.ts`, `settings.ts`, `types.ts`
- Modify: `apps/mobile/src/screens/ReadingsScreen.tsx`, `YouScreen.tsx`

**Interfaces:**
- Produces: `getReadings(filters)` y `getReading(slug)` sobre `public.reading`.
- Elimina: `buildFallbackReading`, `generateReading`, `settings.ai_provider`, `settings.api_key_configured`.

Aquí se cierra el Crítico 4. No renombrando el botón para que mienta menos, sino quitando lo que no existía.

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/src/repositories/readings.test.ts
describe('readings repository', () => {
  it('lee del catálogo, no de generated_readings', async () => {
    const client = readingClient([{ slug: 'market-01-first-visit', title: '第一次去市场' }]);

    await getReadings({ level: 2 }, client);

    expect((client as any).from).toHaveBeenCalledWith('reading');
  });

  it('ya no expone una función de generación', async () => {
    const module = await import('./readings');

    expect('generateReading' in module).toBe(false);
  });
});
```

Y en `settings.test.ts`:

```ts
  it('ya no ofrece un proveedor de IA', async () => {
    // El selector prometía elegir motor y api_key_configured estaba fijado a
    // false en el código: no había nada que elegir.
    const settings = await getSettings(clientFor({ user_settings: { data: baseRow, error: null } }));

    expect('ai_provider' in settings).toBe(false);
    expect('api_key_configured' in settings).toBe(false);
  });
```

- [ ] **Step 2: Write minimal implementation**

- Borra `buildFallbackReading` de `supabase/functions/_shared/ai.ts`. Si `buildFallbackExercise` sigue en uso, déjalo: es del Plan 6.
- `supabase/functions/generate-reading/` se elimina entera. La app lee el catálogo directamente con el cliente de Supabase; una Edge Function que solo hace un `select` es una capa sin trabajo.
- En `readings.ts`, `getReadings` y `getReading` consultan `public.reading`:

```ts
const READING_SELECT =
  'slug, hsk_level, format, title, topic, series, series_index, sentences, questions, audio_kind, audio_url';

export async function getReadings(
  params: { level?: HskLevel; topic?: string; format?: ReadingFormat } = {},
  client: HanyuClient,
): Promise<ReadingSummary[]> {
  let query = client.from('reading').select(READING_SELECT).order('hsk_level').order('slug');

  if (params.level) query = query.eq('hsk_level', params.level);
  if (params.topic) query = query.eq('topic', params.topic);
  if (params.format) query = query.eq('format', params.format);

  const { data, error } = await query;

  if (error) {
    throw createRepositoryError(error, 'Failed to load readings');
  }

  return (data ?? []) as unknown as ReadingSummary[];
}
```

`generateReading` desaparece, y con ella su entrada en `factory.ts`.
- En la migración, retira las columnas del selector:

```sql
alter table public.user_settings drop column if exists ai_provider;
```

- En `settings.ts`, quita `ai_provider` de `DEFAULT_SETTINGS`, de `normalizeSettings`, de `sanitizeUpdates`, de las tres cadenas `select`, y borra `api_key_configured`, que estaba fijado a `false` en el código.
- En `YouScreen.tsx`, elimina el `OptionRow` del proveedor y la constante `PROVIDERS`.
- En `ReadingsScreen.tsx`, el botón «Generate reading» pasa a ser la lista del catálogo filtrada por nivel y tema. No hay nada que generar.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add supabase packages apps
git commit -m "feat(readings): retirar el fallback, la generación en runtime y el selector de IA"
```

---

## Task 6: El audio dice lo que es

**Files:**
- Modify: `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `packages/data/src/types.ts`

**Interfaces:**
- Consumes: `reading.audio_kind` y `audio_url` (Tarea 3).

El plan maestro pide audio humano para el corpus principal. Grabarlo no es trabajo de este plan —hace falta un hablante nativo— pero **sí lo es dejar de presentar el TTS como si fuera lo mismo**.

- [ ] **Step 1: Write the failing test**

```tsx
  it('avisa de que el audio es sintético cuando lo es', async () => {
    mockGetReading.mockResolvedValue({ ...baseReading, audio_kind: 'tts', audio_url: null });

    await renderDetail();

    expect(screen.getByText('Voz sintética')).toBeTruthy();
  });

  it('no avisa cuando la grabación es humana', async () => {
    mockGetReading.mockResolvedValue({
      ...baseReading,
      audio_kind: 'human',
      audio_url: 'https://example.test/market-01.mp3',
    });

    await renderDetail();

    expect(screen.queryByText('Voz sintética')).toBeNull();
  });
```

- [ ] **Step 2: Write minimal implementation**

`ReadingDetail` gana `audio_kind` y `audio_url`. Cuando `audio_kind` es `'tts'`, junto al botón de reproducir aparece una etiqueta discreta «Voz sintética». Cuando hay `audio_url`, se reproduce el fichero en lugar del TTS.

Es una línea de interfaz, pero es la diferencia entre que el usuario sepa que la pronunciación puede no ser fiable y que la dé por buena.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/data/src
git commit -m "feat(readings): distinguir el audio sintético del grabado"
```

---

## Criterio de salida del plan

1. `npm test` en verde, incluido el validador del catálogo completo.
2. `npm run build-readings` informa `10 lecturas, 0 con problemas`.
3. `grep -rn "buildFallbackReading\|generateReading\|ai_provider\|api_key_configured" apps packages supabase --include=*.ts --include=*.tsx` no devuelve nada.
4. Meter a mano una lectura con vocabulario de HSK 4 en el directorio hace fallar `npm test`.
5. Las tres lecturas de la serie del mercado se leen en orden y comparten personajes.
6. El planificador del Plan 5B enciende su paso de lectura: deja de decir «todavía no hay lecturas».

## Lo que este plan deja explícitamente sin resolver

- **Diez lecturas, no sesenta.** Es deliberado y es lo que pide la auditoría. Ampliar el catálogo es repetir la Tarea 4, que ya no tiene incógnitas.
- **No hay audio humano.** El esquema lo distingue y la interfaz lo avisa, pero grabar necesita un hablante nativo. Hasta entonces el TTS se presenta como lo que es.
- **Los temas no vienen del sílabo.** Son los nueve de la auditoría. Extraer los oficiales sigue siendo el trabajo editorial que el Plan 1B dejó anotado.
- **No hay generación en runtime, y por tanto no hay ampliación automática del catálogo.** Es la contrapartida de que todo el contenido esté revisado. Si algún día compensa, el sitio donde enchufarla es la Tarea 3: generar el fichero, no la respuesta.
- **Las notas gramaticales contextuales y el resaltado por palabra conocida** son del Plan 8, que ya tendrá catálogo del que tirar.
