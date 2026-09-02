# Plan 2 — Contrato único de evaluación de ejercicios

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ninguna respuesta correcta se marque como incorrecta, en ninguno de los cinco tipos de ejercicio, y que la regla que lo decide viva en un único módulo con tests.

**Architecture:** Hoy la evaluación está repartida entre la forma que emite cada renderer, una función `evaluateExercise` en el repositorio de datos, y dos rutas de servidor que no existen. La forma que emite la interfaz y la que espera el evaluador no coinciden en dos de los cinco tipos, así que esos dos **nunca** pueden acertar. Este plan define un contrato discriminado de respuesta, mueve la evaluación a `packages/domain` —sin dependencias, para que pueda ejecutarse también en una Edge Function de Deno si algún día hace falta— y hace que la interfaz emita exactamente lo que el evaluador consume.

**Tech Stack:** Node 26 (`.nvmrc`), vitest para `packages/*`, Jest para `apps/mobile`, TypeScript.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. `apps/web/src/components/ExerciseRenderer.test.jsx` existe y tiene un test llamado *"submits matching completion as a backend-compatible answer"*: **no lo arregles ni lo mires**. Se queda roto.
- **`npm test` debe pasar al final de cada tarea.**
- **Prerrequisito: la Tarea 1 del Plan 1A** (`normalizePinyin` en `packages/domain/src/pinyin.ts`). Es una tarea pequeña y autocontenida; si este plan se ejecuta antes que el 1A, hazla aquí y el 1A se la encontrará hecha. No la dupliques.
- **Este plan no añade tipos de ejercicio ni cambia el temario.** Convertir el selector manual en unidades, ampliar el banco y añadir producción oral es el Plan 6.
- **Prohibido escribir mitigaciones.**

## Estado de partida verificado (2 de septiembre de 2026)

Siete defectos, todos medidos sobre el código y los datos actuales.

1. **`reorder` no puede acertar nunca.** `ReorderExercise` emite `string[]` (`['我','喜欢','喝','茶']`). El evaluador compara con `prompt.correct_order.join('')`, es decir `'我喜欢喝茶'`. Un array nunca es igual a una cadena.
2. **`matching` no puede acertar nunca.** `MatchingExercise` emite `Record<string,string>`. El evaluador compara con el literal `'matched'`, que es lo que la semilla guarda en su columna `answer`. La verdad sobre qué pares son correctos está en `prompt.pairs`, y el evaluador ni la mira.
3. **`matching` se puede enviar con un solo par.** `hasAnswer` en `ExercisesScreen` da por buena cualquier objeto no vacío.
4. **`matching` es trivial por posición.** El renderer pinta la columna derecha con `prompt.pairs.map(pair => pair.right)`, en el mismo orden que la izquierda. La solución correcta es siempre fila 1 con fila 1.
5. **`dictation` exige coincidencia casi exacta.** La normalización es `trim().toLowerCase()`. Para `你好` con `pinyin: 'nǐ hǎo'`, fallan `ni hao`, `ni3 hao3`, `nihao` y `你好。`.
6. **Cada comprobación hace cuatro viajes de red fallidos.** `checkExercise` prueba `check_exercise` con tres firmas distintas mediante `callRpcVariants`, luego invoca la Edge Function `check-exercise`, y solo entonces puntúa localmente. Comprobado: **no existe ninguna de las dos** en `supabase/`.
7. **El ejercicio viaja al cliente con su propia respuesta dentro.** `normalizeGeneratedExerciseRow` esparce el JSON del prompt en el payload y `normalizeExercise` lo vuelve a esparcir sobre el objeto que devuelve. El cliente recibe `correct: "喜欢"` como campo suelto, junto a `sentence`, `options` y `source_model`.

## Decisión: dónde vive la verdad

El punto 7 la zanja. Hoy **no hay ninguna autoridad de servidor**: la respuesta ya está en el cliente, y las dos rutas remotas que fingen comprobarla no existen. Mantener esa ficción cuesta cuatro viajes de red por respuesta y no protege nada.

La evaluación pasa a ser **explícitamente local**, en un módulo compartido:

- El módulo vive en `packages/domain/src/exercises/`, sin dependencias externas. Eso no es casualidad: es lo que permitiría ejecutarlo tal cual dentro de una Edge Function de Deno el día que haga falta una comprobación con autoridad.
- La respuesta correcta se envía al cliente **a propósito**, en un campo `solution` tipado, en vez de filtrarse por un `...payload`. Un ejercicio que se puede resolver sin red es un requisito de la arquitectura offline, no una concesión.
- Se eliminan los intentos a `check_exercise` y a `check-exercise`. Cuando existan, se añaden deliberadamente.
- Los intentos se siguen registrando en `exercise_attempts`, que es lo que alimenta la analítica.

El precio: un usuario que inspeccione la respuesta de red puede leer la solución. Para un entrenador personal de un solo estudiante sin nota que defender, ese precio es cero, y la alternativa —romper los ejercicios sin conexión— sí cuesta.

## File Structure

**Se crean:**
- `packages/domain/src/exercises/contract.ts` — tipos de respuesta y de solución, y sus constructores.
- `packages/domain/src/exercises/contract.test.ts`
- `packages/domain/src/exercises/normalize.ts` — normalización de texto y pinyin para comparar.
- `packages/domain/src/exercises/normalize.test.ts`
- `packages/domain/src/exercises/evaluate.ts` — el evaluador y la comprobación de completitud.
- `packages/domain/src/exercises/evaluate.test.ts`
- `packages/data/src/repositories/exercises.test.ts` — hoy no existe; el repositorio de ejercicios es el único sin tests.

**Se modifican:**
- `packages/domain/src/index.ts`
- `packages/data/src/types.ts`, `packages/data/src/repositories/exercises.ts`
- `apps/mobile/src/exercises/types.ts` y los cinco renderers
- `apps/mobile/src/exercises/useExerciseSession.ts`, `apps/mobile/src/screens/ExercisesScreen.tsx`
- `apps/mobile/src/exercises/ExerciseRenderer.test.tsx`, `useExerciseSession.test.tsx`, `apps/mobile/src/screens/ExercisesScreen.test.tsx`

---

## Task 1: Normalización de texto para comparar respuestas

**Files:**
- Create: `packages/domain/src/exercises/normalize.ts`
- Test: `packages/domain/src/exercises/normalize.test.ts`

**Interfaces:**
- Consumes: `normalizePinyin` de `../pinyin` (Plan 1A, Tarea 1).
- Produces:
  - `normalizeText(input: string): string` — para respuestas escritas en cualquier lengua.
  - `normalizeHanzi(input: string): string` — para texto chino: sin espacios ni puntuación.
  - `normalizePinyinInput(input: string): string` — pinyin tecleado por una persona.

  Los consume la Tarea 3.

Tres funciones y no una, porque las tres comparaciones son distintas. Un espacio en `ni hao` es irrelevante; un espacio en `to pay back` no. La puntuación china (`。，！？`) no se teclea igual que la latina y hay que quitar ambas.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/exercises/normalize.test.ts
import { normalizeHanzi, normalizePinyinInput, normalizeText } from './normalize';

describe('normalizeText', () => {
  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(normalizeText('  Student ')).toBe('student');
    expect(normalizeText('to  pay   back')).toBe('to pay back');
  });

  it('ignora la puntuación final', () => {
    expect(normalizeText('student.')).toBe('student');
    expect(normalizeText('¿estudiante?')).toBe('estudiante');
  });

  it('conserva los espacios interiores, que sí distinguen significado', () => {
    expect(normalizeText('to pay back')).not.toBe(normalizeText('topayback'));
  });
});

describe('normalizeHanzi', () => {
  it('quita espacios y puntuación china y latina', () => {
    expect(normalizeHanzi('你好。')).toBe('你好');
    expect(normalizeHanzi('我 喜欢 喝茶')).toBe('我喜欢喝茶');
    expect(normalizeHanzi('他说：“好！”')).toBe('他说好');
  });

  it('deja igual un texto ya limpio', () => {
    expect(normalizeHanzi('我喜欢喝茶')).toBe('我喜欢喝茶');
  });
});

describe('normalizePinyinInput', () => {
  it('acepta las cuatro formas de teclear la misma lectura', () => {
    const expected = normalizePinyinInput('nǐ hǎo');

    expect(normalizePinyinInput('ni hao')).toBe(expected);
    expect(normalizePinyinInput('ni3 hao3')).toBe(expected);
    expect(normalizePinyinInput('nihao')).toBe(expected);
    expect(normalizePinyinInput('Nǐ Hǎo')).toBe(expected);
  });

  it('acepta v como sustituto de ü, que es como se teclea', () => {
    expect(normalizePinyinInput('lv')).toBe(normalizePinyinInput('lǜ'));
    expect(normalizePinyinInput('nv')).toBe(normalizePinyinInput('nǚ'));
  });

  it('ignora la puntuación', () => {
    expect(normalizePinyinInput('nǐ hǎo!')).toBe(normalizePinyinInput('ni hao'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/domain/src/exercises/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "./normalize"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/exercises/normalize.ts
//
// Tres normalizaciones y no una, porque las tres comparaciones son distintas.
// Un espacio en "ni hao" es una separación de sílabas y sobra; un espacio en
// "to pay back" separa palabras y cambia el significado.
import { normalizePinyin } from '../pinyin';

// Puntuación latina y china de anchura completa. Se quita en todos los casos:
// nadie falla un ejercicio por olvidar un punto final.
const PUNCTUATION = /[.,!?;:'"()[\]{}¿¡…—–-]|[。，！？；：、“”‘’（）《》〈〉【】]/g;

export function normalizeText(input: string): string {
  return String(input ?? '')
    .replace(PUNCTUATION, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeHanzi(input: string): string {
  return String(input ?? '')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, '');
}

export function normalizePinyinInput(input: string): string {
  // Un teclado latino no produce ü, así que se escribe v. Se traduce antes de
  // normalizar porque normalizePinyin conserva la diéresis a propósito.
  const withUmlaut = String(input ?? '')
    .replace(PUNCTUATION, ' ')
    .replace(/v/gi, 'ü');

  return normalizePinyin(withUmlaut);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/domain/src/exercises/normalize.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/exercises/normalize.ts packages/domain/src/exercises/normalize.test.ts
git commit -m "feat(domain): normalización de texto, hanzi y pinyin para comparar respuestas"
```

---

## Task 2: Contrato discriminado de respuesta y de solución

**Files:**
- Create: `packages/domain/src/exercises/contract.ts`
- Test: `packages/domain/src/exercises/contract.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `type ExerciseKind = 'fill_blank' | 'multiple_choice' | 'reorder' | 'dictation' | 'matching'`
  - `type ExerciseAnswer` — unión discriminada por `kind`.
  - `type ExerciseSolution` — unión discriminada por `kind`.
  - `emptyAnswer(kind: ExerciseKind): ExerciseAnswer`
  - `toSolution(kind: ExerciseKind, prompt: unknown, storedAnswer: unknown): ExerciseSolution`

  Los consumen las Tareas 3, 4, 5 y 6.

La respuesta deja de ser `unknown`. Cada tipo declara su forma, y esa forma es la misma en el renderer, en el repositorio y en el evaluador. Ése es todo el arreglo de los defectos 1 y 2: cuando la forma es un tipo compartido, la discrepancia deja de poder existir.

`toSolution` traduce lo que hay guardado en la base —que mezcla convenciones, con `words` y `tokens`, `correct` y la columna `answer`— a una forma canónica. Es el único sitio donde se tolera el desorden histórico.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/exercises/contract.test.ts
import { emptyAnswer, toSolution } from './contract';

describe('emptyAnswer', () => {
  it('da una respuesta vacía con la forma de su tipo', () => {
    expect(emptyAnswer('fill_blank')).toEqual({ kind: 'fill_blank', text: '' });
    expect(emptyAnswer('multiple_choice')).toEqual({ kind: 'multiple_choice', option: '' });
    expect(emptyAnswer('reorder')).toEqual({ kind: 'reorder', tokens: [] });
    expect(emptyAnswer('dictation')).toEqual({ kind: 'dictation', text: '' });
    expect(emptyAnswer('matching')).toEqual({ kind: 'matching', pairs: {} });
  });
});

describe('toSolution', () => {
  it('acepta la respuesta de fill_blank desde el prompt o desde la columna answer', () => {
    expect(
      toSolution('fill_blank', { sentence: '我___喝茶。', correct: '喜欢' }, null),
    ).toEqual({ kind: 'fill_blank', accept: ['喜欢'] });

    expect(toSolution('fill_blank', { sentence: '我___喝茶。' }, '喜欢')).toEqual({
      kind: 'fill_blank',
      accept: ['喜欢'],
    });
  });

  it('acepta varias respuestas válidas en fill_blank', () => {
    expect(
      toSolution('fill_blank', { correct: ['喜欢', '爱'] }, null),
    ).toEqual({ kind: 'fill_blank', accept: ['喜欢', '爱'] });
  });

  it('lee el orden correcto de reorder como lista, no como cadena', () => {
    expect(
      toSolution('reorder', { words: ['喝', '我'], correct_order: ['我', '喜欢', '喝', '茶'] }, '我喜欢喝茶'),
    ).toEqual({ kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] });
  });

  it('reconstruye el orden desde la columna answer cuando falta correct_order', () => {
    expect(toSolution('reorder', { words: ['我', '好'] }, ['我', '好'])).toEqual({
      kind: 'reorder',
      order: ['我', '好'],
    });
  });

  it('lee los pares de matching del prompt e ignora el literal "matched"', () => {
    const solution = toSolution(
      'matching',
      { pairs: [{ left: '学生', right: 'student' }, { left: '老师', right: 'teacher' }] },
      'matched',
    );

    expect(solution).toEqual({
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher' },
    });
  });

  it('conserva el pinyin de dictation solo cuando se acepta', () => {
    expect(
      toSolution('dictation', { audio_text: '你好', pinyin: 'nǐ hǎo', accept_pinyin: true }, '你好'),
    ).toEqual({ kind: 'dictation', hanzi: '你好', pinyin: 'nǐ hǎo' });

    expect(
      toSolution('dictation', { audio_text: '你好', pinyin: 'nǐ hǎo', accept_pinyin: false }, '你好'),
    ).toEqual({ kind: 'dictation', hanzi: '你好', pinyin: null });
  });

  it('lee la opción correcta de multiple_choice', () => {
    expect(
      toSolution('multiple_choice', { question: '?', options: ['a', 'b'], correct: 'b' }, 'b'),
    ).toEqual({ kind: 'multiple_choice', correct: 'b' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/domain/src/exercises/contract.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/exercises/contract.ts
//
// La respuesta de un ejercicio deja de ser `unknown`. Cada tipo declara su
// forma, y esa forma es la misma en el renderer, en el repositorio de datos y
// en el evaluador. Ésa es toda la corrección de los dos tipos que nunca podían
// acertar: cuando la forma es un tipo compartido, la discrepancia entre lo que
// la interfaz emite y lo que el evaluador espera deja de poder existir.

export type ExerciseKind =
  | 'fill_blank'
  | 'multiple_choice'
  | 'reorder'
  | 'dictation'
  | 'matching';

export type ExerciseAnswer =
  | { kind: 'fill_blank'; text: string }
  | { kind: 'multiple_choice'; option: string }
  | { kind: 'reorder'; tokens: string[] }
  | { kind: 'dictation'; text: string }
  | { kind: 'matching'; pairs: Record<string, string> };

export type ExerciseSolution =
  | { kind: 'fill_blank'; accept: string[] }
  | { kind: 'multiple_choice'; correct: string }
  | { kind: 'reorder'; order: string[] }
  | { kind: 'dictation'; hanzi: string; pinyin: string | null }
  | { kind: 'matching'; pairs: Record<string, string> };

export function emptyAnswer(kind: ExerciseKind): ExerciseAnswer {
  switch (kind) {
    case 'fill_blank':
      return { kind, text: '' };
    case 'multiple_choice':
      return { kind, option: '' };
    case 'reorder':
      return { kind, tokens: [] };
    case 'dictation':
      return { kind, text: '' };
    case 'matching':
      return { kind, pairs: {} };
  }
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }

  const text = value === null || value === undefined ? '' : String(value);
  return text ? [text] : [];
}

/**
 * Traduce lo que hay guardado en la base a una forma canónica. Es el único
 * sitio donde se tolera el desorden histórico del esquema: el prompt guarda
 * `words` en unas filas y `tokens` en otras, la respuesta vive unas veces en
 * `prompt.correct` y otras en la columna `answer`, y `matching` guarda el
 * literal inútil "matched" mientras los pares reales están en el prompt.
 */
export function toSolution(
  kind: ExerciseKind,
  prompt: any,
  storedAnswer: unknown,
): ExerciseSolution {
  switch (kind) {
    case 'fill_blank': {
      const accept = asStringList(prompt?.correct ?? prompt?.answer ?? storedAnswer);
      return { kind, accept };
    }

    case 'multiple_choice': {
      const correct = String(prompt?.correct ?? storedAnswer ?? '');
      return { kind, correct };
    }

    case 'reorder': {
      // correct_order es la fuente buena. La columna answer guarda la frase ya
      // unida, que no permite reconstruir la separación en piezas.
      const order = Array.isArray(prompt?.correct_order)
        ? prompt.correct_order.map(String)
        : asStringList(storedAnswer);
      return { kind, order };
    }

    case 'dictation': {
      const hanzi = String(prompt?.audio_text ?? storedAnswer ?? '');
      const pinyin = prompt?.accept_pinyin && prompt?.pinyin ? String(prompt.pinyin) : null;
      return { kind, hanzi, pinyin };
    }

    case 'matching': {
      const pairs: Record<string, string> = {};
      for (const pair of Array.isArray(prompt?.pairs) ? prompt.pairs : []) {
        const left = String(pair?.left ?? '');
        if (left) pairs[left] = String(pair?.right ?? '');
      }
      return { kind, pairs };
    }
  }
}
```

Añade a `packages/domain/src/index.ts`:

```ts
export * from './exercises/contract';
export * from './exercises/evaluate';
export { normalizeHanzi, normalizePinyinInput, normalizeText } from './exercises/normalize';
```

La línea de `evaluate` fallará hasta la Tarea 3; añádela entonces.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/domain/src/exercises/contract.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/exercises/contract.ts packages/domain/src/exercises/contract.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): contrato discriminado de respuesta y solución de ejercicios"
```

---

## Task 3: El evaluador

**Files:**
- Create: `packages/domain/src/exercises/evaluate.ts`
- Test: `packages/domain/src/exercises/evaluate.test.ts`

**Interfaces:**
- Consumes: Tareas 1 y 2.
- Produces:
  - `isAnswerComplete(solution: ExerciseSolution, answer: ExerciseAnswer): boolean`
  - `evaluateAnswer(solution: ExerciseSolution, answer: ExerciseAnswer): Evaluation`
  - `interface Evaluation { correct: boolean; solution: ExerciseSolution; answer: ExerciseAnswer; detail: EvaluationDetail }`
  - `type EvaluationDetail = { kind: 'matching'; wrong: string[]; missing: string[] } | { kind: 'reorder'; first_wrong_index: number | null } | { kind: 'simple' }`

  Los consumen las Tareas 4 y 6.

`detail` existe porque la auditoría pide feedback que diagnostique y no solo señale. Para `matching`, saber **qué** pares fallaron es la diferencia entre "3/4" y una corrección útil. No cuesta nada calcularlo aquí y evita que la pantalla lo recalcule por su cuenta.

`isAnswerComplete` es lo que sustituye a `hasAnswer` en la pantalla, y es donde se corrige el defecto 3: `matching` no está completo hasta que hay tantos pares asignados como pares tiene el ejercicio.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/exercises/evaluate.test.ts
import { evaluateAnswer, isAnswerComplete } from './evaluate';
import type { ExerciseSolution } from './contract';

const fillBlank: ExerciseSolution = { kind: 'fill_blank', accept: ['喜欢'] };
const choice: ExerciseSolution = { kind: 'multiple_choice', correct: 'student' };
const reorder: ExerciseSolution = { kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] };
const dictation: ExerciseSolution = { kind: 'dictation', hanzi: '你好', pinyin: 'nǐ hǎo' };
const matching: ExerciseSolution = {
  kind: 'matching',
  pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
};

describe('isAnswerComplete', () => {
  it('exige todos los pares en matching antes de poder comprobar', () => {
    expect(isAnswerComplete(matching, { kind: 'matching', pairs: { 学生: 'student' } })).toBe(false);
    expect(
      isAnswerComplete(matching, {
        kind: 'matching',
        pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
      }),
    ).toBe(true);
  });

  it('exige todas las piezas en reorder', () => {
    expect(isAnswerComplete(reorder, { kind: 'reorder', tokens: ['我', '喜欢'] })).toBe(false);
    expect(isAnswerComplete(reorder, { kind: 'reorder', tokens: ['我', '喜欢', '喝', '茶'] })).toBe(true);
  });

  it('exige texto no vacío en los tipos escritos', () => {
    expect(isAnswerComplete(fillBlank, { kind: 'fill_blank', text: '  ' })).toBe(false);
    expect(isAnswerComplete(fillBlank, { kind: 'fill_blank', text: '喜欢' })).toBe(true);
    expect(isAnswerComplete(choice, { kind: 'multiple_choice', option: '' })).toBe(false);
  });
});

describe('evaluateAnswer', () => {
  it('acierta reorder comparando listas, no cadenas', () => {
    const result = evaluateAnswer(reorder, {
      kind: 'reorder',
      tokens: ['我', '喜欢', '喝', '茶'],
    });

    expect(result.correct).toBe(true);
  });

  it('señala la primera posición equivocada en reorder', () => {
    const result = evaluateAnswer(reorder, {
      kind: 'reorder',
      tokens: ['我', '喝', '喜欢', '茶'],
    });

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({ kind: 'reorder', first_wrong_index: 1 });
  });

  it('acierta matching comparando el mapa completo', () => {
    const result = evaluateAnswer(matching, {
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
    });

    expect(result.correct).toBe(true);
    expect(result.detail).toEqual({ kind: 'matching', wrong: [], missing: [] });
  });

  it('dice qué pares de matching están mal y cuáles faltan', () => {
    const result = evaluateAnswer(matching, {
      kind: 'matching',
      pairs: { 学生: 'teacher', 老师: 'teacher' },
    });

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({ kind: 'matching', wrong: ['学生'], missing: ['朋友'] });
  });

  it('acepta dictation en hanzi con y sin puntuación', () => {
    expect(evaluateAnswer(dictation, { kind: 'dictation', text: '你好' }).correct).toBe(true);
    expect(evaluateAnswer(dictation, { kind: 'dictation', text: '你好。' }).correct).toBe(true);
  });

  it('acepta dictation en las cuatro formas de teclear el pinyin', () => {
    for (const text of ['nǐ hǎo', 'ni hao', 'ni3 hao3', 'nihao']) {
      expect(evaluateAnswer(dictation, { kind: 'dictation', text }).correct).toBe(true);
    }
  });

  it('rechaza el pinyin cuando el ejercicio no lo acepta', () => {
    const hanziOnly: ExerciseSolution = { kind: 'dictation', hanzi: '你好', pinyin: null };

    expect(evaluateAnswer(hanziOnly, { kind: 'dictation', text: 'ni hao' }).correct).toBe(false);
  });

  it('ignora mayúsculas y espacios sobrantes en las respuestas escritas', () => {
    expect(evaluateAnswer(choice, { kind: 'multiple_choice', option: ' Student ' }).correct).toBe(true);
    expect(evaluateAnswer(fillBlank, { kind: 'fill_blank', text: ' 喜欢 ' }).correct).toBe(true);
  });

  it('acepta cualquiera de las respuestas válidas de fill_blank', () => {
    const many: ExerciseSolution = { kind: 'fill_blank', accept: ['喜欢', '爱'] };

    expect(evaluateAnswer(many, { kind: 'fill_blank', text: '爱' }).correct).toBe(true);
  });

  it('devuelve incorrecto sin romperse cuando la respuesta es de otro tipo', () => {
    const result = evaluateAnswer(reorder, { kind: 'fill_blank', text: '我喜欢喝茶' } as never);

    expect(result.correct).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/domain/src/exercises/evaluate.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/exercises/evaluate.ts
//
// La única regla que decide si una respuesta es correcta. Vive en
// packages/domain, sin dependencias, para que pueda ejecutarse tal cual dentro
// de una Edge Function de Deno el día que la comprobación necesite autoridad
// de servidor. Hoy corre en el cliente, a propósito: los ejercicios tienen que
// funcionar sin conexión.
import type { ExerciseAnswer, ExerciseSolution } from './contract';
import { normalizeHanzi, normalizePinyinInput, normalizeText } from './normalize';

export type EvaluationDetail =
  | { kind: 'matching'; wrong: string[]; missing: string[] }
  | { kind: 'reorder'; first_wrong_index: number | null }
  | { kind: 'simple' };

export interface Evaluation {
  correct: boolean;
  solution: ExerciseSolution;
  answer: ExerciseAnswer;
  detail: EvaluationDetail;
}

export function isAnswerComplete(
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
): boolean {
  if (solution.kind !== answer.kind) {
    return false;
  }

  switch (answer.kind) {
    case 'fill_blank':
    case 'dictation':
      return answer.text.trim().length > 0;
    case 'multiple_choice':
      return answer.option.trim().length > 0;
    case 'reorder':
      // Media frase no es una respuesta: comprobarla solo enseña que falta
      // algo, que el usuario ya sabe.
      return (
        solution.kind === 'reorder' && answer.tokens.length === solution.order.length
      );
    case 'matching':
      return (
        solution.kind === 'matching' &&
        Object.keys(answer.pairs).length === Object.keys(solution.pairs).length
      );
  }
}

function evaluationOf(
  correct: boolean,
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
  detail: EvaluationDetail = { kind: 'simple' },
): Evaluation {
  return { correct, solution, answer, detail };
}

export function evaluateAnswer(
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
): Evaluation {
  // Un desajuste de tipo es un error de programación, no del usuario. Se
  // devuelve incorrecto en vez de lanzar: una sesión de estudio no debe caerse
  // por un ejercicio mal formado.
  if (solution.kind !== answer.kind) {
    return evaluationOf(false, solution, answer);
  }

  switch (solution.kind) {
    case 'fill_blank': {
      const submitted = normalizeText((answer as { text: string }).text);
      const correct = solution.accept.some((option) => normalizeText(option) === submitted);
      return evaluationOf(correct, solution, answer);
    }

    case 'multiple_choice': {
      const submitted = normalizeText((answer as { option: string }).option);
      return evaluationOf(normalizeText(solution.correct) === submitted, solution, answer);
    }

    case 'reorder': {
      const tokens = (answer as { tokens: string[] }).tokens;
      let firstWrong: number | null = null;

      for (let index = 0; index < Math.max(tokens.length, solution.order.length); index += 1) {
        if (normalizeHanzi(tokens[index] ?? '') !== normalizeHanzi(solution.order[index] ?? '')) {
          firstWrong = index;
          break;
        }
      }

      return evaluationOf(firstWrong === null, solution, answer, {
        kind: 'reorder',
        first_wrong_index: firstWrong,
      });
    }

    case 'dictation': {
      const text = (answer as { text: string }).text;
      const asHanzi = normalizeHanzi(text) === normalizeHanzi(solution.hanzi);
      const asPinyin =
        solution.pinyin !== null &&
        normalizePinyinInput(text) === normalizePinyinInput(solution.pinyin);

      return evaluationOf(asHanzi || asPinyin, solution, answer);
    }

    case 'matching': {
      const submitted = (answer as { pairs: Record<string, string> }).pairs;
      const wrong: string[] = [];
      const missing: string[] = [];

      for (const [left, right] of Object.entries(solution.pairs)) {
        if (!(left in submitted)) {
          missing.push(left);
          continue;
        }
        if (normalizeText(submitted[left]) !== normalizeText(right)) {
          wrong.push(left);
        }
      }

      return evaluationOf(wrong.length === 0 && missing.length === 0, solution, answer, {
        kind: 'matching',
        wrong,
        missing,
      });
    }
  }
}
```

Ahora sí, añade a `packages/domain/src/index.ts` la línea que la Tarea 2 dejó pendiente:

```ts
export * from './exercises/evaluate';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: los 5 pasos en PASS, con 13 tests nuevos en `evaluate.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/exercises/evaluate.ts packages/domain/src/exercises/evaluate.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): evaluador único de respuestas con diagnóstico por tipo"
```

---

## Task 4: El repositorio usa el evaluador y deja de fingir servidor

**Files:**
- Modify: `packages/data/src/repositories/exercises.ts`, `packages/data/src/types.ts`
- Create: `packages/data/src/repositories/exercises.test.ts`

**Interfaces:**
- Consumes: Tareas 2 y 3.
- Produces: `Exercise` gana `solution: ExerciseSolution`; `ExerciseCheckResult` gana `detail: EvaluationDetail`. `checkExercise(id, answer: ExerciseAnswer, client)`. Los consume la Tarea 6.

Aquí se corrigen los defectos 6 y 7. Se borran los intentos a `check_exercise` y a `check-exercise` —cuatro viajes de red que nunca han funcionado— y la respuesta correcta deja de filtrarse por un `...payload` para viajar en un campo declarado.

- [ ] **Step 1: Write the failing test**

`packages/data/src/repositories/exercises.ts` no tiene tests hoy. Crea el fichero siguiendo el patrón de `decks.test.ts`:

```ts
// packages/data/src/repositories/exercises.test.ts
import { describe, expect, it, vi } from 'vitest';
import { checkExercise, generateExercise } from './exercises';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'order', 'limit', 'single', 'maybeSingle',
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
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const invoke = vi.fn().mockResolvedValue({ data: null, error: null });
  const chains: Record<string, any> = {};

  return {
    auth: auth(),
    rpc,
    functions: { invoke },
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

const matchingRow = {
  id: 'x1',
  type: 'matching',
  hsk_level: 1,
  prompt: {
    type: 'matching',
    pairs: [
      { left: '学生', right: 'student' },
      { left: '老师', right: 'teacher' },
    ],
  },
  answer: 'matched',
};

const reorderRow = {
  id: 'x2',
  type: 'reorder',
  hsk_level: 1,
  prompt: {
    type: 'reorder',
    words: ['喝', '我', '茶', '喜欢'],
    correct_order: ['我', '喜欢', '喝', '茶'],
  },
  answer: '我喜欢喝茶',
};

describe('exercises repository', () => {
  it('checkExercise marca correcto un matching completo y bien emparejado', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'student', 老师: 'teacher' } },
      client,
    );

    expect(result.correct).toBe(true);
  });

  it('checkExercise marca correcto un reorder bien ordenado', async () => {
    const client = clientFor({
      generated_exercises: { data: reorderRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x2',
      { kind: 'reorder', tokens: ['我', '喜欢', '喝', '茶'] },
      client,
    );

    expect(result.correct).toBe(true);
  });

  it('checkExercise dice qué pares fallaron', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'teacher', 老师: 'teacher' } },
      client,
    );

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({ kind: 'matching', wrong: ['学生'], missing: [] });
  });

  it('checkExercise no llama a ninguna RPC ni Edge Function', async () => {
    const client = clientFor({
      generated_exercises: { data: reorderRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    await checkExercise('x2', { kind: 'reorder', tokens: ['我'] }, client);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('generateExercise devuelve la solución en un campo declarado y sin campos sueltos', async () => {
    const client = clientFor({ generated_exercises: { data: [reorderRow], error: null } });
    client.functions.invoke = vi.fn().mockResolvedValue({ data: null, error: new Error('no') });

    const exercise = await generateExercise('reorder', 1, client);

    expect(exercise.solution).toEqual({
      kind: 'reorder',
      order: ['我', '喜欢', '喝', '茶'],
    });
    expect(Object.keys(exercise).sort()).toEqual(
      ['explanation', 'hsk_level', 'id', 'prompt', 'solution', 'type'].sort(),
    );
  });
});
```

Run: `npx vitest run packages/data/src/repositories/exercises.test.ts`
Expected: FAIL — cinco tests. El de matching y el de reorder fallan por los defectos 1 y 2; el de RPC porque hoy se llaman; el de las claves porque hoy se filtran `sentence`, `correct`, `source_model` y demás.

- [ ] **Step 2: Write minimal implementation**

En `packages/data/src/types.ts`, reexporta los tipos del dominio en vez de duplicarlos, y ajusta `Exercise`:

```ts
import type {
  Evaluation,
  EvaluationDetail,
  ExerciseAnswer,
  ExerciseSolution,
} from '@hanyu/domain';

export type { Evaluation, EvaluationDetail, ExerciseAnswer, ExerciseSolution };

export interface Exercise {
  id: string;
  type: ExerciseType;
  hsk_level: HskLevel;
  prompt: ExercisePrompt;
  solution: ExerciseSolution;
  explanation: string | null;
}

export interface ExerciseCheckResult {
  correct: boolean;
  expected_answer: ExerciseSolution;
  submitted_answer: ExerciseAnswer;
  detail: EvaluationDetail;
  explanation: string | null;
}
```

En `packages/data/src/repositories/exercises.ts`:

- Borra `normalizeCheckResult` y `evaluateExercise` enteras. La primera existía para aplanar respuestas de un servidor que no existe; la segunda es lo que el evaluador del dominio sustituye.
- Añade el import:

```ts
import { evaluateAnswer, toSolution } from '@hanyu/domain';
```

- Sustituye `normalizeExercise` por una versión que construye un objeto explícito, sin esparcir el payload:

```ts
/**
 * Devuelve exactamente los campos del contrato. La versión anterior hacía
 * `...payload`, así que el cliente recibía `correct`, `sentence` y
 * `source_model` como campos sueltos junto al prompt ya normalizado: la
 * respuesta viajaba por accidente. Ahora viaja a propósito, en `solution`,
 * porque los ejercicios tienen que poder resolverse sin conexión.
 */
function normalizeExercise(payload: any): Exercise {
  const type = String(payload.type || 'fill_blank') as ExerciseType;

  return {
    id: String(payload.id),
    type,
    hsk_level: Number(payload.hsk_level) as HskLevel,
    prompt: toExercisePrompt(type, payload),
    solution: toSolution(type, payload, payload.answer ?? null),
    explanation: payload.explanation ?? null,
  };
}
```

- Sustituye `checkExercise` entera:

```ts
export async function checkExercise(
  id: string,
  answer: ExerciseAnswer,
  client: HanyuClient,
): Promise<ExerciseCheckResult> {
  // No hay comprobación de servidor. La versión anterior intentaba una RPC
  // `check_exercise` con tres firmas distintas y después una Edge Function
  // `check-exercise`: cuatro viajes de red que siempre fallaban, porque
  // ninguna de las dos existe. La evaluación es local a propósito y la regla
  // vive en @hanyu/domain, lista para ejecutarse en servidor si algún día se
  // necesita autoridad.
  const userId = await getRequiredUserId(client);

  const { data: exerciseRow, error: exerciseError } = await client
    .from('generated_exercises')
    .select('id, type, prompt, answer')
    .eq('id', id as any)
    .single();

  if (exerciseError) {
    throw createRepositoryError(exerciseError, 'Failed to load exercise for scoring');
  }

  const row = exerciseRow as any;
  const prompt = parseJsonField(row.prompt, {});
  const storedAnswer = parseJsonField(row.answer, row.answer);
  const solution = toSolution(row.type, prompt, storedAnswer);
  const evaluation = evaluateAnswer(solution, answer);

  const { error: attemptError } = await client.from('exercise_attempts').insert({
    user_id: userId,
    exercise_id: id,
    correct: evaluation.correct,
    submitted_answer: answer,
  } as any);

  if (attemptError) {
    throw createRepositoryError(attemptError, 'Failed to record exercise attempt');
  }

  await incrementExerciseDone(client, userId);

  return {
    correct: evaluation.correct,
    expected_answer: evaluation.solution,
    submitted_answer: evaluation.answer,
    detail: evaluation.detail,
    explanation: prompt?.explanation ?? null,
  };
}
```

Si `callRpcVariants` queda sin usar en el fichero, quita también su import. Comprueba antes que no lo usa ningún otro repositorio.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS. `packages/data` compilará solo si `@hanyu/domain` está en sus dependencias; si el typecheck se queja del import, añade el alias que ya usa `vitest.config.js` también al `tsconfig.json` de `packages/data`.

- [ ] **Step 4: Commit**

```bash
git add packages/data/src
git commit -m "fix(data): evaluar con el módulo de dominio y retirar las dos rutas de servidor inexistentes"
```

---

## Task 5: Los renderers emiten la respuesta tipada

**Files:**
- Modify: `apps/mobile/src/exercises/types.ts` y los cinco renderers
- Modify: `apps/mobile/src/exercises/ExerciseRenderer.test.tsx`

**Interfaces:**
- Consumes: `ExerciseAnswer` (Tarea 2).
- Produces: `ExerciseRendererProps` con `value: ExerciseAnswer` y `onChange(value: ExerciseAnswer)`. Los consume la Tarea 6.

Con `value: unknown`, TypeScript no podía detectar que `ReorderExercise` emite una lista donde el evaluador espera una cadena. Tipar este borde es lo que hace que el defecto no pueda volver.

- [ ] **Step 1: Cambiar el contrato de props**

```tsx
// apps/mobile/src/exercises/types.ts
import type { ExerciseAnswer, ExercisePrompt } from '@hanyu/data';

export interface ExerciseRendererProps<TPrompt extends ExercisePrompt = ExercisePrompt> {
  prompt: TPrompt;
  value: ExerciseAnswer;
  disabled: boolean;
  onChange(value: ExerciseAnswer): void;
}
```

- [ ] **Step 2: Adaptar los cinco renderers**

`FillBlankExercise`: el `TextInput` y las opciones escriben el mismo campo.

```tsx
        value={value.kind === 'fill_blank' ? value.text : ''}
        editable={!disabled}
        onChangeText={(text) => onChange({ kind: 'fill_blank', text })}
```

y en cada opción:

```tsx
          accessibilityState={{
            selected: value.kind === 'fill_blank' && value.text === option,
            disabled,
          }}
          onPress={() => onChange({ kind: 'fill_blank', text: option })}
```

`MultipleChoiceExercise`:

```tsx
          accessibilityState={{
            selected: value.kind === 'multiple_choice' && value.option === option,
            disabled,
          }}
          onPress={() => onChange({ kind: 'multiple_choice', option })}
```

y el color del borde: `value.kind === 'multiple_choice' && value.option === option ? colors.vermilion : colors.border`.

`DictationExercise`:

```tsx
        value={value.kind === 'dictation' ? value.text : ''}
        onChangeText={(text) => onChange({ kind: 'dictation', text })}
```

`ReorderExercise`: sustituye la primera línea del cuerpo y las tres llamadas a `onChange`.

```tsx
  const ordered = value.kind === 'reorder' ? value.tokens : [];
```

```tsx
            onPress={() =>
              onChange({
                kind: 'reorder',
                tokens: ordered.filter((_, itemIndex) => itemIndex !== index),
              })
            }
```

```tsx
            onPress={() => onChange({ kind: 'reorder', tokens: [...ordered, token] })}
```

```tsx
        onPress={() => onChange({ kind: 'reorder', tokens: [] })}
```

`MatchingExercise`: el mapa tipado, y **la columna derecha barajada**, que corrige el defecto 4.

```tsx
  const matches = value.kind === 'matching' ? value.pairs : {};

  const selectRight = (right: string) => {
    if (!selectedLeft) {
      return;
    }
    onChange({ kind: 'matching', pairs: { ...matches, [selectedLeft]: right } });
    setSelectedLeft(null);
  };

  // La columna derecha se pintaba en el mismo orden que la izquierda, así que
  // el ejercicio se resolvía emparejando fila con fila sin leer nada. Se baraja
  // de forma determinista a partir del propio contenido —el orden no cambia
  // entre renderizados— y se garantiza que el resultado no coincida con el
  // original: un barajado que a veces devuelve la identidad deja el ejercicio
  // trivial justo esas veces, y además haría inestable el test.
  const rightColumn = useMemo(() => {
    const rights = prompt.pairs.map((pair) => pair.right);
    if (rights.length < 2) {
      return rights;
    }

    const shuffled = [...rights].sort((a, b) => hashString(a) - hashString(b));
    const unchanged = shuffled.every((right, index) => right === rights[index]);

    return unchanged ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  }, [prompt.pairs]);
```

con el ayudante al final del fichero:

```tsx
function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}
```

y la columna derecha itera `rightColumn.map(right => ...)` en vez de `prompt.pairs.map(pair => ...)`, usando `right` como `key`, como etiqueta y como argumento de `selectRight`.

Añade `useMemo` al import de React.

- [ ] **Step 3: Write the failing test**

`apps/mobile/src/exercises/ExerciseRenderer.test.tsx` construye sus ejercicios con un ayudante `exercise(prompt)`. Ahora `Exercise` exige `solution`, así que el ayudante toma dos argumentos:

```tsx
function exercise(prompt: Exercise['prompt'], solution: Exercise['solution']): Exercise {
  return {
    id: 'exercise-1',
    type: prompt.kind,
    hsk_level: 2,
    prompt,
    solution,
    explanation: null,
  };
}
```

Actualiza las llamadas que ya existen —cada una pasa ahora su solución y una respuesta tipada en `value`— y sustituye las aserciones sobre `onChange`. La de fill_blank queda así, y las de multiple choice y dictation siguen el mismo patrón:

```tsx
  it('emits a fill-blank draft', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          { kind: 'fill_blank', sentence: '我___汉语。' },
          { kind: 'fill_blank', accept: ['学习'] },
        )}
        value={{ kind: 'fill_blank', text: '' }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.changeText(view.getByPlaceholderText('Type your answer'), '学习');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'fill_blank', text: '学习' });
  });
```

Y añade estos tres, con cuatro pares en matching:

```tsx
const MATCHING_PAIRS = [
  { left: '学生', right: 'student' },
  { left: '老师', right: 'teacher' },
  { left: '朋友', right: 'friend' },
  { left: '医生', right: 'doctor' },
];

function matchingExercise() {
  return exercise(
    { kind: 'matching', pairs: MATCHING_PAIRS },
    {
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend', 医生: 'doctor' },
    },
  );
}

  it('reorder emits a typed answer with the pieces in order', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          { kind: 'reorder', tokens: ['喝', '我', '茶', '喜欢'] },
          { kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] },
        )}
        value={{ kind: 'reorder', tokens: [] }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Add 我' }));

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'reorder', tokens: ['我'] });
  });

  it('matching emits the chosen pair inside the map', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={matchingExercise()}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'matching',
      pairs: { 学生: 'student' },
    });
  });

  it('matching does not line the right column up with the left one', async () => {
    // Con las dos columnas en el mismo orden, el ejercicio se resuelve por
    // posición sin leer nada.
    const view = await render(
      <ExerciseRenderer
        exercise={matchingExercise()}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={jest.fn()}
      />,
    );

    const rendered = view
      .getAllByRole('button')
      .map((node) => String(node.props.accessibilityLabel ?? ''))
      .filter((label) => label.startsWith('Match '))
      .map((label) => label.slice('Match '.length));

    const original = MATCHING_PAIRS.map((pair) => pair.right);

    expect(rendered).toHaveLength(4);
    expect(rendered).not.toEqual(original);
    expect([...rendered].sort()).toEqual([...original].sort());
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/exercises
git commit -m "feat(mobile): los renderers emiten la respuesta tipada y matching deja de resolverse por posición"
```

---

## Task 6: La sesión exige respuesta completa y muestra el diagnóstico

**Files:**
- Modify: `apps/mobile/src/exercises/useExerciseSession.ts`, `apps/mobile/src/screens/ExercisesScreen.tsx`
- Modify: `apps/mobile/src/exercises/useExerciseSession.test.tsx`, `apps/mobile/src/screens/ExercisesScreen.test.tsx`

**Interfaces:**
- Consumes: `isAnswerComplete`, `emptyAnswer` (Tareas 2 y 3), `ExerciseCheckResult.detail` (Tarea 4).

Aquí se cierra el defecto 3 y se aprovecha el diagnóstico que el evaluador ya calcula.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/screens/ExercisesScreen.test.tsx` mockea `../lib/data` con `mockGenerateExercise` y `mockCheckExercise`, y busca los controles con `view.getByRole('button', { name })`. El test de dictado que ya existe hay que actualizarlo: `mockGenerateExercise` debe devolver también `solution`, y la última aserción pasa a `expect(mockCheckExercise).toHaveBeenCalledWith('exercise-1', { kind: 'dictation', text: '你好' })`.

Añade estos dos:

```tsx
  const MATCHING = {
    id: 'exercise-2',
    type: 'matching' as const,
    hsk_level: 2 as const,
    prompt: {
      kind: 'matching' as const,
      pairs: [
        { left: '学生', right: 'student' },
        { left: '老师', right: 'teacher' },
        { left: '朋友', right: 'friend' },
        { left: '医生', right: 'doctor' },
      ],
    },
    solution: {
      kind: 'matching' as const,
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend', 医生: 'doctor' },
    },
    explanation: null,
  };

  it('will not let a half-finished matching be checked', async () => {
    mockGenerateExercise.mockResolvedValue(MATCHING);
    const view = await render(<ExercisesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Matching' }));
    await fireEvent.press(view.getByRole('button', { name: 'Generate exercise' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Select 学生' })).toBeTruthy(),
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    // Un par de cuatro no es una respuesta.
    expect(view.getByRole('button', { name: 'Check answer' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
  });

  it('says which pairs were wrong', async () => {
    mockGenerateExercise.mockResolvedValue(MATCHING);
    mockCheckExercise.mockResolvedValue({
      correct: false,
      expected_answer: MATCHING.solution,
      submitted_answer: { kind: 'matching', pairs: {} },
      detail: { kind: 'matching', wrong: ['学生'], missing: [] },
      explanation: null,
    });
    const view = await render(<ExercisesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Matching' }));
    await fireEvent.press(view.getByRole('button', { name: 'Generate exercise' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Select 学生' })).toBeTruthy(),
    );

    for (const [left, right] of [
      ['学生', 'teacher'],
      ['老师', 'student'],
      ['朋友', 'friend'],
      ['医生', 'doctor'],
    ]) {
      await fireEvent.press(view.getByRole('button', { name: `Select ${left}` }));
      await fireEvent.press(view.getByRole('button', { name: `Match ${right}` }));
    }

    await fireEvent.press(view.getByRole('button', { name: 'Check answer' }));

    await waitFor(() => expect(view.getByText('Wrong: 学生')).toBeTruthy());
  });
```

- [ ] **Step 2: Write minimal implementation**

En `useExerciseSession.ts`, el borrador deja de ser `unknown` y arranca con la forma vacía de su tipo:

```ts
import { emptyAnswer, isAnswerComplete, type ExerciseAnswer } from '@hanyu/domain';
```

```ts
  const [draft, setDraft] = useState<ExerciseAnswer>(emptyAnswer('fill_blank'));
```

En `load`, tras recibir el ejercicio:

```ts
      setExercise(nextExercise);
      setDraft(emptyAnswer(nextExercise.type));
```

Y `check` deja de comprobar `draft === null`:

```ts
    if (
      checking.current ||
      status !== 'answering' ||
      !exercise ||
      !isAnswerComplete(exercise.solution, draft)
    ) {
      return;
    }
```

Expón la completitud para que la pantalla no tenga que recalcularla:

```ts
  const complete = exercise ? isAnswerComplete(exercise.solution, draft) : false;
```

y añade `complete` al objeto devuelto y a la interfaz `ExerciseSession`.

En `ExercisesScreen.tsx`, borra la función `hasAnswer` entera y usa lo que la sesión ya sabe:

```tsx
  const canCheck = session.status === 'answering' && session.complete;
```

Y bajo el resultado, muestra el diagnóstico:

```tsx
      {session.result?.detail.kind === 'matching' && session.result.detail.wrong.length > 0 ? (
        <Text style={[styles.detail, { color: colors.vermilion }]}>
          Wrong: {session.result.detail.wrong.join('、')}
        </Text>
      ) : null}
      {session.result?.detail.kind === 'reorder' &&
      session.result.detail.first_wrong_index !== null ? (
        <Text style={[styles.detail, { color: colors.vermilion }]}>
          First wrong position: {session.result.detail.first_wrong_index + 1}
        </Text>
      ) : null}
```

con el estilo correspondiente en `StyleSheet.create`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): exigir respuesta completa y mostrar qué falló al comprobar"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. Los cinco tipos aceptan una respuesta correcta. Comprobable a mano en la app: resolver uno de cada tipo y ver que ninguno se marca mal.
3. `matching` no se puede enviar hasta emparejar todos los pares, y su columna derecha no coincide con la izquierda.
4. `dictation` acepta `你好`, `你好。`, `nǐ hǎo`, `ni hao`, `ni3 hao3` y `nihao`.
5. Comprobar una respuesta hace **dos** consultas de lectura y dos escrituras, ninguna RPC y ninguna invocación de Edge Function.
6. El objeto `Exercise` que llega al cliente tiene exactamente seis claves: `id`, `type`, `hsk_level`, `prompt`, `solution`, `explanation`.

## Lo que este plan deja explícitamente sin resolver

- **`fill_blank` sigue mostrando todas las opciones mientras se escribe**, lo que reduce la recuperación activa. Es una decisión de diseño del ejercicio, no del contrato de evaluación: la toma el Plan 6.
- **Sigue habiendo dos semillas por combinación de nivel y tipo**, y la selección aleatoria puede repetir el mismo ejercicio seguido. Ampliar el banco y ordenar la práctica es el Plan 6.
- **No hay comprobación con autoridad de servidor.** La decisión está razonada arriba y el módulo está colocado donde podría ejecutarse en una Edge Function sin cambios. Implementarla es trabajo de otro plan y solo tiene sentido cuando haya nota que defender.
- **`exercise_template` no se toca.** El Plan 1C declara qué habilidad evalúa cada tipo; conectar el resultado de un ejercicio con el estado de memoria de esa habilidad es del Plan 4.
- **Las explicaciones siguen siendo las de la semilla.** El evaluador ya devuelve `detail`, pero un feedback que enseñe por qué un distractor es incorrecto es contenido, y llega con el Plan 6.
