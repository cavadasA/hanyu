# Plan 4B — Recuperación activa: cinco habilidades y una valoración con evidencia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que estudiar deje de ser «revelo la respuesta y me pongo la nota», que cada habilidad tenga su propio estado de memoria, y que la valoración salga de lo que el usuario hizo y no solo de lo que dice que sabía.

**Architecture:** Los tres modos actuales —reconocimiento, recuerdo y escucha— cambian la cara de la tarjeta pero terminan igual: revelar y pulsar uno de cuatro botones. No se recoge ninguna evidencia, y los tres escriben en el mismo estado de memoria. Este plan hace tres cosas: convierte cada modo en una habilidad con estado propio sobre `learner_skill_state`, exige una respuesta real donde se puede exigir, y deriva la valoración de esa respuesta dejando la autoevaluación como corrección y no como única señal. La comparación de respuestas reutiliza el módulo de normalización que ya escribió el Plan 2.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 4A.** Sin el planificador por habilidad, generar tarjetas de escucha no sirve de nada: no habría dónde programarlas por separado.
- **No se inventan frases.** El corpus no tiene ni una frase de ejemplo por palabra, y este plan no las fabrica. Lo que hace es capturar las que el usuario encuentra al leer, y recuperar las 17 que existían y se perdieron. El contenido editorial es el Plan 7.
- **Prohibido escribir mitigaciones.**

## Estado de partida verificado (2 de septiembre de 2026)

Medido sobre el repositorio con los Planes 1A, 1B, 1C, 2 y 3 ya ejecutados:

- **Los tres modos son autoevaluación pura.** `recognition` muestra el hanzi, `recall` muestra la glosa, `listening` reproduce TTS. Los tres terminan en `revealed` y cuatro botones. No hay ni un campo de entrada en toda la pantalla de tarjetas.
- **Los tres escriben en el mismo sitio.** `learner_skill_state` tiene filas solo de `recognition`: una por cada `srs_cards`. Nada genera las otras cuatro habilidades.
- **`ReadingToken` es `{ id, text, type, word }`.** No lleva la frase a la que pertenece ni desplazamientos dentro del texto. Sí lleva los signos de puntuación como tokens propios (`type: 'punctuation'`), así que la frase se puede reconstruir recorriendo la lista.
- **`addCard(wordId, client, deckId)` no acepta contexto.** Al añadir una palabra desde una lectura, la frase donde apareció se pierde.
- **No queda ni una frase de ejemplo en el repositorio.** El corpus de palabras no tiene campo para ellas, y `grammar-points.json` pasó de 6 puntos con 17 frases a 165 puntos con ninguna.

### Un daño que hay que reparar antes de seguir

El Plan 1B regenera `grammar-points.json` entero desde el sílabo oficial. El sílabo enumera los puntos pero no los explica ni los ejemplifica, así que la regeneración dejó `examples` vacío en los 165. El plan documentaba que quedarían vacíos, pero **no protegió las 17 frases que ya existían**, y se borraron junto con los campos `pattern` y `explanation`.

Es el mismo defecto que el Plan 1A sí evitó para las glosas españolas, donde el importador arrastra lo curado en vez de sobrescribirlo. La asimetría fue un descuido, no una decisión.

Las frases son recuperables del commit `52c3768`, anterior a `d80d84e`. La Tarea 1 las recupera y añade la protección que faltaba.

## Qué material contextual existe de verdad

Esto condiciona el plan entero y conviene tenerlo delante:

| Habilidad | Estímulo | ¿Hay material para todas las palabras? |
|---|---|---|
| `recognition` | hanzi → significado | Sí. El corpus tiene hanzi y glosa. |
| `recall` | significado → escribir el hanzi | Sí. |
| `listening` | audio → escribir lo oído | Sí, con TTS del dispositivo. |
| `reading` | frase con hueco → la palabra | **No.** Solo para palabras con una frase capturada. |
| `production` | hablar | **No.** No hay evaluación de voz; queda fuera. |

Así que `reading` —el cloze contextual— existe solo para las palabras que el usuario se ha encontrado leyendo. No es una limitación que se pueda tapar generando frases: una frase inventada por la app enseñaría un uso que nadie ha validado. El Plan 7 traerá el corpus editorial y con él la cobertura completa.

## File Structure

**Se crean:**
- `server/db/seeds/grammar-examples.json` — las frases recuperadas, ahora como fichero curado aparte del generado.
- `apps/mobile/src/lib/sentenceOf.ts` — reconstruye la frase de un token dentro de una lectura.
- `apps/mobile/src/lib/sentenceOf.test.ts`
- `packages/domain/src/scheduling/grade.ts` — deriva la valoración de la evidencia.
- `packages/domain/src/scheduling/grade.test.ts`
- `apps/mobile/src/ui/WrittenAnswer.tsx` — el campo de respuesta y su corrección.
- `apps/mobile/src/ui/WrittenAnswer.test.tsx`
- `supabase/migrations/2026090206_word_context.sql`

**Se modifican:**
- `scripts/import-syllabus.js` — deja de destruir lo curado.
- `packages/data/src/repositories/flashcards.ts`, `words.ts`, `types.ts`
- `apps/mobile/src/readings/ReadingText.tsx`, `WordSheet.tsx`
- `apps/mobile/src/ui/FlashCardView.tsx`, `apps/mobile/src/screens/CardsScreen.tsx`

---

## Task 1: Recuperar las frases y dejar de destruir lo curado

**Files:**
- Create: `server/db/seeds/grammar-examples.json`
- Modify: `scripts/import-syllabus.js`, `scripts/corpus-contract.test.js`, `scripts/build-supabase-seed.js`

**Interfaces:**
- Produces: `grammar_points.examples` y `.pattern` poblados para los puntos que los tienen. Los consumen las Tareas 5 y 6.

- [ ] **Step 1: Rescatar lo perdido**

```bash
git show 52c3768:server/db/seeds/grammar-points.json > /tmp/grammar-old.json
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const old = JSON.parse(readFileSync('/tmp/grammar-old.json', 'utf8'));
const curated = old.map((point) => ({
  hsk_level: point.hsk_level,
  title: point.title,
  pattern: point.pattern ?? null,
  explanation: point.explanation ?? null,
  examples: point.examples ?? [],
}));
writeFileSync('server/db/seeds/grammar-examples.json', JSON.stringify(curated, null, 2) + '\n');
console.log('recuperados', curated.length, 'puntos con', curated.reduce((n, p) => n + p.examples.length, 0), 'frases');
"
```

Expected: `recuperados 6 puntos con 17 frases`.

El fichero es **curado**, no generado: es la contrapartida de `sense-glosses-es.json` para la gramática. Nunca se sobrescribe desde el sílabo.

- [ ] **Step 2: Write the failing test**

En `scripts/corpus-contract.test.js`:

```js
  it('conserva las frases de ejemplo curadas al regenerar la gramática', () => {
    // El sílabo enumera los puntos pero no los ejemplifica. Regenerar sin
    // arrastrar lo curado borró 17 frases escritas a mano; esta prueba impide
    // que vuelva a pasar.
    const curated = JSON.parse(
      readFileSync(join(seedDir, 'grammar-examples.json'), 'utf8'),
    );
    const grammar = JSON.parse(readFileSync(join(seedDir, 'grammar-points.json'), 'utf8'));

    const missing = [];
    for (const entry of curated) {
      if (entry.examples.length === 0) continue;

      const point = grammar.find(
        (candidate) =>
          candidate.hsk_level === entry.hsk_level &&
          (candidate.title === entry.title || candidate.detail === entry.title),
      );

      if (!point || !Array.isArray(point.examples) || point.examples.length === 0) {
        missing.push(`L${entry.hsk_level} ${entry.title}`);
      }
    }

    expect(missing).toEqual([]);
  });
```

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL — seis puntos sin ejemplos.

- [ ] **Step 3: Write minimal implementation**

En `scripts/import-syllabus.js`, tras construir `grammar` y antes de escribirlo:

```js
/**
 * El sílabo enumera los puntos de gramática pero no los explica ni los
 * ejemplifica. Lo curado a mano vive en grammar-examples.json y se superpone
 * al generado, igual que sense-glosses-es.json hace con las glosas españolas.
 * Sin esto, cada regeneración borra el trabajo editorial.
 */
const curatedGrammar = JSON.parse(
  readFileSync(join(seedDir, 'grammar-examples.json'), 'utf-8'),
);

for (const point of grammar) {
  const curated = curatedGrammar.find(
    (entry) =>
      entry.hsk_level === point.hsk_level &&
      (entry.title === point.title || entry.title === point.detail),
  );

  if (!curated) continue;

  point.pattern = curated.pattern ?? point.pattern ?? null;
  point.explanation = curated.explanation ?? point.explanation ?? null;
  point.examples = curated.examples ?? [];
}
```

Y en `scripts/build-supabase-seed.js`, `buildGrammarRows` vuelve a emitir `pattern`, `explanation` y `examples`, que la regeneración había dejado a null.

- [ ] **Step 4: Regenerar y verificar**

```bash
npm run import-syllabus && node scripts/build-supabase-seed.js && npm test
```

Expected: los 5 pasos en PASS, y el contrato en verde.

- [ ] **Step 5: Commit**

```bash
git add server/db/seeds scripts/
git commit -m "fix(corpus): recuperar las frases de gramática que la regeneración borró"
```

---

## Task 2: La frase donde apareció la palabra

**Files:**
- Create: `apps/mobile/src/lib/sentenceOf.ts`, `sentenceOf.test.ts`, `supabase/migrations/2026090206_word_context.sql`
- Modify: `apps/mobile/src/readings/ReadingText.tsx`, `WordSheet.tsx`, `packages/data/src/repositories/flashcards.ts`, `types.ts`

**Interfaces:**
- Produces:
  - `sentenceOf(tokens: ReadingToken[], tokenId: string): { text: string; tokens: ReadingToken[] } | null`
  - `addCard(wordId, client, options?: { deckId?: string; context?: WordContext })`
  - `interface WordContext { sentence: string; source_kind: 'reading'; source_id: string }`

  Los consumen las Tareas 5 y 6.

La auditoría lo pide en dos sitios: guardar la frase exacta al añadir una palabra desde una lectura, y tener contexto en la tarjeta. Es lo mismo, y hoy se pierde porque `WordSheet` solo recibe el token.

`ReadingToken` no lleva la frase, pero los signos de puntuación **sí están en la lista como tokens propios**, así que la frase es el tramo entre dos de ellos.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/sentenceOf.test.ts
import type { ReadingToken } from '@hanyu/data';
import { sentenceOf } from './sentenceOf';

function token(id: string, text: string, type: ReadingToken['type'] = 'word'): ReadingToken {
  return { id, text, type, word: null };
}

const tokens: ReadingToken[] = [
  token('t0', '我'),
  token('t1', '喜欢'),
  token('t2', '喝茶'),
  token('t3', '。', 'punctuation'),
  token('t4', '她'),
  token('t5', '看书'),
  token('t6', '，', 'punctuation'),
  token('t7', '我'),
  token('t8', '睡觉'),
  token('t9', '。', 'punctuation'),
];

describe('sentenceOf', () => {
  it('devuelve la frase que contiene el token, con su puntuación final', () => {
    expect(sentenceOf(tokens, 't1')?.text).toBe('我喜欢喝茶。');
  });

  it('no corta en una coma: la frase llega hasta el punto', () => {
    // Una coma separa cláusulas, no frases. Cortar ahí daría un contexto
    // demasiado corto para entender el uso de la palabra.
    expect(sentenceOf(tokens, 't5')?.text).toBe('她看书，我睡觉。');
    expect(sentenceOf(tokens, 't8')?.text).toBe('她看书，我睡觉。');
  });

  it('devuelve la frase aunque el texto no termine en puntuación', () => {
    expect(sentenceOf([token('a', '你好')], 'a')?.text).toBe('你好');
  });

  it('devuelve null cuando el token no está en la lista', () => {
    expect(sentenceOf(tokens, 'nope')).toBeNull();
  });

  it('devuelve también los tokens de la frase, para poder marcar el hueco', () => {
    expect(sentenceOf(tokens, 't1')?.tokens.map((t) => t.id)).toEqual(['t0', 't1', 't2', 't3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @hanyu/mobile -- sentenceOf`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/lib/sentenceOf.ts
import type { ReadingToken } from '@hanyu/data';

/**
 * Reconstruye la frase a la que pertenece un token.
 *
 * El tokenizador no guarda frases ni desplazamientos, pero sí emite los signos
 * de puntuación como tokens propios, así que la frase es el tramo entre dos
 * terminadores.
 *
 * La coma no termina frase: separa cláusulas. Cortar en ella daría contextos de
 * tres caracteres, inútiles para entender cómo se usa la palabra.
 */
const SENTENCE_END = new Set(['。', '！', '？', '…', '.', '!', '?']);

export interface Sentence {
  text: string;
  tokens: ReadingToken[];
}

export function sentenceOf(tokens: ReadingToken[], tokenId: string): Sentence | null {
  const index = tokens.findIndex((token) => token.id === tokenId);
  if (index < 0) {
    return null;
  }

  let start = index;
  while (start > 0) {
    const previous = tokens[start - 1];
    if (previous.type === 'punctuation' && SENTENCE_END.has(previous.text)) break;
    start -= 1;
  }

  let end = index;
  while (end < tokens.length - 1) {
    if (tokens[end].type === 'punctuation' && SENTENCE_END.has(tokens[end].text)) break;
    end += 1;
  }

  const slice = tokens.slice(start, end + 1);
  return { text: slice.map((token) => token.text).join(''), tokens: slice };
}
```

La migración guarda el contexto. Una palabra puede aparecer en varias frases, así que la tabla no es uno a uno:

```sql
-- supabase/migrations/2026090206_word_context.sql
--
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
```

`addCard` acepta el contexto y lo escribe. Sustituye su firma de tres argumentos por una con opciones —`addCard(wordId, client, { deckId, context })`— y actualiza sus dos llamantes. Recuerda que el Plan 4A quitó `next_review_at` y `status` de `srs_cards`, así que el `upsert` de esta función se queda en `{ user_id, word_id }`.

En `ReadingText`, pasa la frase a `WordSheet`:

```tsx
        <WordSheet
          text={selected.text}
          word={selected.word}
          sentence={sentenceOf(tokens, selected.id)}
          readingId={readingId}
          onClose={() => setSelected(null)}
        />
```

`ReadingText` necesita `readingId` como prop nueva; `ReadingDetailScreen` ya lo tiene.

`WordSheet` recibe la `Sentence` —que lleva texto y tokens— y construye con ella el `WordContext` que viaja a la base. Son tipos distintos a propósito: los tokens sirven para resaltar el hueco en pantalla y no tienen por qué persistirse.

```tsx
interface Props {
  word: Word | null;
  text: string;
  sentence: Sentence | null;
  readingId: string;
  onClose(): void;
}
```

y dentro de `addCard`:

```tsx
    await flashcards.current.addCard(word.id, {
      context: sentence
        ? { sentence: sentence.text, source_kind: 'reading', source_id: readingId }
        : undefined,
    });
```

Sobre el botón, la frase capturada, para que el usuario vea qué se está guardando con la palabra:

```tsx
      {sentence ? (
        <Text style={[styles.context, { color: colors.textMuted }]}>{sentence.text}</Text>
      ) : null}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src supabase/migrations/2026090206_word_context.sql packages/data/src
git commit -m "feat(mobile): capturar la frase donde apareció la palabra al añadirla desde una lectura"
```

---

## Task 3: Las cinco habilidades se generan

**Files:**
- Modify: `packages/data/src/repositories/flashcards.ts`, `packages/data/src/types.ts`, `apps/mobile/src/screens/CardsScreen.tsx`
- Modify: `supabase/migrations/2026090206_word_context.sql`

**Interfaces:**
- Consumes: `learner_skill_state` (Plan 1C), `get_due_cards(p_skill)` (Plan 4A), `word_context` (Tarea 2).
- Produces: `availableSkills(word, hasContext): LearningSkill[]` y una cola por habilidad.

Hasta ahora una palabra producía un estado de memoria. Ahora produce uno por habilidad **de las que tienen material**. Generar una tarjeta de cloze para una palabra sin frase daría una tarjeta vacía, y generar una de producción oral daría una que nadie puede evaluar.

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/src/repositories/flashcards.test.ts
describe('availableSkills', () => {
  it('siempre ofrece reconocimiento, recuerdo y escucha', () => {
    expect(availableSkills({ hasContext: false })).toEqual([
      'recognition',
      'recall',
      'listening',
    ]);
  });

  it('añade lectura en contexto solo cuando hay una frase guardada', () => {
    expect(availableSkills({ hasContext: true })).toContain('reading');
  });

  it('nunca ofrece producción: no hay evaluación de voz', () => {
    // Declararla sin poder evaluarla daría una tarjeta que el usuario no puede
    // aprobar nunca.
    expect(availableSkills({ hasContext: true })).not.toContain('production');
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
/**
 * Las habilidades que una palabra puede ejercitar hoy dependen del material
 * que exista para ella, no de un catálogo fijo. `production` está declarada en
 * el enum desde el Plan 1C pero no se genera: sin evaluación de voz sería una
 * tarjeta imposible de aprobar.
 */
export function availableSkills(input: { hasContext: boolean }): LearningSkill[] {
  const skills: LearningSkill[] = ['recognition', 'recall', 'listening'];

  if (input.hasContext) {
    skills.push('reading');
  }

  return skills;
}
```

Y la introducción progresiva, en la migración: las filas de habilidad se crean cuando la palabra entra en estudio, pero solo `recognition` arranca desbloqueada.

```sql
-- Una palabra no se estudia en cuatro frentes desde el primer día. Las
-- habilidades derivadas arrancan suspendidas y se liberan cuando la de
-- reconocimiento tiene estabilidad suficiente: producir o reconocer de oído
-- algo que todavía no se reconoce escrito es frustración, no práctica.
create or replace function public.unlock_derived_skills(p_min_stability numeric default 7)
returns integer
language sql
security definer
set search_path = public
as $$
  with unlocked as (
    update public.learner_skill_state s
    set suspended = false, updated_at = now()
    where s.user_id = auth.uid()
      and s.skill <> 'recognition'
      and s.suspended
      and exists (
        select 1 from public.learner_skill_state base
        where base.user_id = s.user_id
          and base.target_kind = s.target_kind
          and base.target_id = s.target_id
          and base.skill = 'recognition'
          and coalesce(base.stability, 0) >= p_min_stability
      )
    returning 1
  )
  select count(*)::integer from unlocked;
$$;
```

En `CardsScreen`, el selector de modo pasa a elegir habilidad y la cola se pide para ella: `service.loadDueCards(50, skill)`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/data/src apps/mobile/src supabase/migrations
git commit -m "feat(cards): una palabra genera una tarjeta por habilidad con material disponible"
```

---

## Task 4: La valoración sale de la evidencia

**Files:**
- Create: `packages/domain/src/scheduling/grade.ts`, `grade.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `normalizeHanzi`, `normalizePinyinInput`, `normalizeText` (Plan 2).
- Produces: `gradeWrittenAnswer(input): { grade: Grade; correct: boolean; reason: GradeReason }`.

Éste es el corazón del Alto 3. La autoevaluación no desaparece —seguirá siendo la corrección— pero deja de ser la única señal.

Las reglas no son arbitrarias y conviene que estén escritas donde se puedan discutir: una respuesta correcta y rápida sin ayudas es `easy`; correcta pero lenta o con una pista es `hard`; correcta a secas es `good`; incorrecta es `again`. El tiempo se compara con un umbral por habilidad, no absoluto.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/scheduling/grade.test.ts
import { gradeWrittenAnswer } from './grade';

const base = { expected: '你好', submitted: '你好', kind: 'hanzi' as const, elapsed_ms: 4000, hints: 0 };

describe('gradeWrittenAnswer', () => {
  it('una respuesta correcta, rápida y sin ayudas es easy', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1500 }).grade).toBe('easy');
  });

  it('una respuesta correcta a ritmo normal es good', () => {
    expect(gradeWrittenAnswer(base).grade).toBe('good');
  });

  it('una respuesta correcta pero lenta es hard', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 20000 }).grade).toBe('hard');
  });

  it('una respuesta correcta con pista es hard aunque sea rápida', () => {
    // Acertar con ayuda no demuestra lo mismo que acertar sin ella.
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1000, hints: 1 }).grade).toBe('hard');
  });

  it('una respuesta incorrecta es again', () => {
    const result = gradeWrittenAnswer({ ...base, submitted: '你号' });

    expect(result.grade).toBe('again');
    expect(result.correct).toBe(false);
  });

  it('ignora la puntuación y los espacios sobrantes', () => {
    expect(gradeWrittenAnswer({ ...base, submitted: ' 你好。' }).correct).toBe(true);
  });

  it('acepta el pinyin tecleado de las cuatro formas', () => {
    for (const submitted of ['nǐ hǎo', 'ni hao', 'ni3 hao3', 'nihao']) {
      const result = gradeWrittenAnswer({
        expected: 'nǐ hǎo',
        submitted,
        kind: 'pinyin',
        elapsed_ms: 4000,
        hints: 0,
      });
      expect(result.correct).toBe(true);
    }
  });

  it('explica por qué bajó la nota', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 20000 }).reason).toBe('slow');
    expect(gradeWrittenAnswer({ ...base, hints: 1 }).reason).toBe('hint');
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1500 }).reason).toBe('fast');
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/scheduling/grade.ts
//
// La valoración deja de ser solo lo que el usuario dice que sabía. Sigue
// pudiendo corregirla a mano —a veces uno teclea mal algo que sí sabe— pero la
// señal por defecto sale de lo que hizo: si acertó, cuánto tardó y si pidió
// ayuda.
import { normalizeHanzi, normalizePinyinInput, normalizeText } from '../exercises/normalize';
import type { Grade } from './schedule';

export type GradeReason = 'fast' | 'normal' | 'slow' | 'hint' | 'wrong';

export interface WrittenAnswerInput {
  expected: string;
  submitted: string;
  kind: 'hanzi' | 'pinyin' | 'text';
  elapsed_ms: number;
  hints: number;
}

/**
 * Umbrales de tiempo. No son absolutos: por debajo del primero la respuesta
 * salió sin esfuerzo de recuperación, y por encima del segundo hubo búsqueda
 * activa, que es justo lo que un intervalo más corto debe volver a entrenar.
 */
const FAST_MS = 3000;
const SLOW_MS = 12000;

function matches(input: WrittenAnswerInput): boolean {
  switch (input.kind) {
    case 'hanzi':
      return normalizeHanzi(input.submitted) === normalizeHanzi(input.expected);
    case 'pinyin':
      return normalizePinyinInput(input.submitted) === normalizePinyinInput(input.expected);
    case 'text':
      return normalizeText(input.submitted) === normalizeText(input.expected);
  }
}

export function gradeWrittenAnswer(input: WrittenAnswerInput): {
  grade: Grade;
  correct: boolean;
  reason: GradeReason;
} {
  if (!matches(input)) {
    return { grade: 'again', correct: false, reason: 'wrong' };
  }

  if (input.hints > 0) {
    return { grade: 'hard', correct: true, reason: 'hint' };
  }

  if (input.elapsed_ms >= SLOW_MS) {
    return { grade: 'hard', correct: true, reason: 'slow' };
  }

  if (input.elapsed_ms <= FAST_MS) {
    return { grade: 'easy', correct: true, reason: 'fast' };
  }

  return { grade: 'good', correct: true, reason: 'normal' };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain
git commit -m "feat(domain): derivar la valoración de la respuesta, el tiempo y las ayudas"
```

---

## Task 5: Escribir, escuchar y completar

**Files:**
- Create: `apps/mobile/src/ui/WrittenAnswer.tsx`, `WrittenAnswer.test.tsx`
- Modify: `apps/mobile/src/ui/FlashCardView.tsx`, `apps/mobile/src/screens/CardsScreen.tsx`

**Interfaces:**
- Consumes: `gradeWrittenAnswer` (Tarea 4), `sentenceOf` y `word_context` (Tarea 2).

Tres modos dejan de terminar en «revelar y ponerse nota»:

- **`recall`**: se muestra la glosa y hay que **escribir el hanzi**.
- **`listening`**: suena el audio y hay que **escribir lo que se oye**.
- **`reading`**: se muestra la frase capturada con la palabra sustituida por un hueco.

`recognition` se queda como está, y es deliberado: reconocer es la única de las cuatro donde pedir producción cambiaría lo que se mide.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/ui/WrittenAnswer.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WrittenAnswer } from './WrittenAnswer';

describe('WrittenAnswer', () => {
  it('valora la respuesta correcta sin pedir autoevaluación', async () => {
    const onGraded = jest.fn();
    await render(
      <WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true }),
    );
  });

  it('muestra la respuesta esperada cuando se falla', async () => {
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={jest.fn()} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你号');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('你好')).toBeTruthy();
  });

  it('cuenta la pista y la nota baja por ello', async () => {
    const onGraded = jest.fn();
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Show a hint' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'hint' }));
  });

  it('deja corregir la valoración a mano', async () => {
    // Teclear mal algo que sí se sabe no debe costar un intervalo entero.
    const onGraded = jest.fn();
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你号');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await fireEvent.press(screen.getByRole('button', { name: 'I actually knew it' }));

    expect(onGraded).toHaveBeenLastCalledWith(
      expect.objectContaining({ grade: 'hard', correct: true }),
    );
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```tsx
// apps/mobile/src/ui/WrittenAnswer.tsx
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { gradeWrittenAnswer, type Grade, type GradeReason } from '@hanyu/domain';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

export interface WrittenGrade {
  grade: Grade;
  correct: boolean;
  reason: GradeReason;
}

interface Props {
  expected: string;
  kind: 'hanzi' | 'pinyin' | 'text';
  onGraded(result: WrittenGrade): void;
}

export function WrittenAnswer({ expected, kind, onGraded }: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<WrittenGrade | null>(null);
  const [hints, setHints] = useState(0);
  const startedAt = useRef(Date.now());

  function check() {
    const graded = gradeWrittenAnswer({
      expected,
      submitted: value,
      kind,
      elapsed_ms: Date.now() - startedAt.current,
      hints,
    });

    setResult(graded);
    onGraded(graded);
  }

  // Teclear mal algo que sí se sabe no debe costar un intervalo entero. Se
  // concede `hard` y no `good`: haber necesitado la corrección es en sí una
  // señal de que la recuperación no fue limpia.
  function overrideAsKnown() {
    const corrected: WrittenGrade = { grade: 'hard', correct: true, reason: 'hint' };
    setResult(corrected);
    onGraded(corrected);
  }

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Type the answer"
        placeholderTextColor={colors.textMuted}
        value={value}
        editable={result === null}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setValue}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />

      {result === null ? (
        <View style={styles.actions}>
          <Button
            label="Show a hint"
            variant="outline"
            onPress={() => {
              setHints((count) => count + 1);
              setValue([...expected][0] ?? '');
            }}
          />
          <Button label="Check" onPress={check} disabled={value.trim().length === 0} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text
            style={[
              styles.verdict,
              { color: result.correct ? colors.success : colors.vermilion },
            ]}
          >
            {result.correct ? 'Correct' : expected}
          </Text>
          {result.correct ? null : (
            <Button label="I actually knew it" variant="outline" onPress={overrideAsKnown} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm, width: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    fontSize: tokens.fontSize.lg,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  verdict: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
});
```

La pista rellena el primer carácter de la respuesta esperada: da un punto de partida sin regalar la respuesta, y queda contada para que la nota lo refleje.

En `FlashCardView`, los tres modos con respuesta renderizan `WrittenAnswer` en lugar del botón «Show answer»:

```tsx
          {mode !== 'recognition' && !revealed ? (
            <WrittenAnswer
              expected={mode === 'listening' ? (card.hanzi ?? '') : (card.hanzi ?? '')}
              kind="hanzi"
              onGraded={(result) => onRate?.(result.grade)}
            />
          ) : null}
```

Los cuatro botones de valoración quedan solo para `recognition`, donde no hay nada que escribir. Para `reading`, el enunciado es la frase de `card.context` con la palabra sustituida por `____`, y `expected` sigue siendo la palabra.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src
git commit -m "feat(cards): respuesta escrita en recuerdo, escucha y contexto"
```

---

## Task 6: La ficha dice todo lo que sabe

**Files:**
- Modify: `apps/mobile/src/ui/FlashCardView.tsx`, `packages/data/src/repositories/flashcards.ts`

**Interfaces:**
- Consumes: `traditional`, `classifier`, `sense_index`, `variants` (Planes 1A y 1B); `word_context` (Tarea 2); `grammar_points.examples` (Tarea 1).
- Produces: `DueCard` gana `sense_index: number | null`, `variants: string[]` y `context: WordContext | null`.

La cara de respuesta muestra hoy hanzi, pinyin y glosa. El corpus tiene bastante más desde el Plan 1A, y no enseñarlo es desperdiciar el trabajo hecho.

- [ ] **Step 1: Write the failing test**

En `apps/mobile/src/ui/FlashCardView.test.tsx`:

```tsx
  it('muestra la forma tradicional, el clasificador y la frase de origen al revelar', async () => {
    const card = {
      ...baseCard,
      hanzi: '还',
      traditional: '還',
      pinyin: 'huán',
      sense_index: 2,
      classifier: null,
      meaning_es: 'devolver; restituir',
      context: { sentence: '我明天还你钱。', source_kind: 'reading' as const },
    };

    await render(<FlashCardView card={card} mode="recognition" revealed onRate={jest.fn()} />);

    expect(screen.getByText('繁 還')).toBeTruthy();
    expect(screen.getByText('我明天还你钱。')).toBeTruthy();
  });

  it('distingue las acepciones de la misma forma escrita', async () => {
    // 还 hái y 还 huán son entradas distintas del sílabo; una tarjeta que no lo
    // diga pide recordar dos cosas a la vez.
    const card = { ...baseCard, hanzi: '还', pinyin: 'huán', sense_index: 2 };

    await render(<FlashCardView card={card} mode="recognition" revealed onRate={jest.fn()} />);

    expect(screen.getByLabelText('Sense 2')).toBeTruthy();
  });
```

- [ ] **Step 2: Write minimal implementation**

La cara de respuesta añade, cuando existan: la forma tradicional, el clasificador, el índice de sentido como insignia, las variantes aceptadas, y la frase de origen con la palabra resaltada. `getDueCards` trae `word_context` en la misma consulta, tomando la más reciente por palabra.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/data/src
git commit -m "feat(cards): la ficha muestra sentido, forma tradicional, clasificador y contexto"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `grammar-points.json` vuelve a tener las 17 frases, y regenerar desde el sílabo no las borra.
3. Añadir una palabra desde una lectura guarda la frase, y esa frase aparece en la tarjeta.
4. `recall`, `listening` y `reading` piden escribir. Solo `recognition` se resuelve revelando.
5. Una palabra con contexto tiene cuatro filas en `learner_skill_state`; sin contexto, tres.
6. Las habilidades derivadas arrancan suspendidas y se liberan cuando el reconocimiento se sostiene.

## Lo que este plan deja explícitamente sin resolver

- **`production` no se genera.** Está en el enum desde el Plan 1C, pero sin evaluación de voz sería una tarjeta imposible de aprobar. Necesita reconocimiento de habla, que es otro plan y otra decisión de proveedor.
- **El cloze solo existe para palabras leídas.** El corpus no tiene frases por palabra y este plan no las inventa. La cobertura completa llega con el corpus editorial del Plan 7.
- **La escritura a mano de caracteres no se evalúa.** Escribir con teclado demuestra que se recuerda la forma, no que se sepa trazarla. El sílabo evalúa ambas cosas; la segunda pide un lienzo y reconocimiento de trazo.
- **Los umbrales de tiempo son fijos.** `FAST_MS` y `SLOW_MS` deberían depender de la longitud de la respuesta y del historial del usuario. Calibrarlos necesita los datos que recoge el Plan 9.
- **El audio sigue siendo TTS del dispositivo.** Audio humano es el Plan 7.
