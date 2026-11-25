# Plan 11 — Gramática: los 165 puntos oficiales con explicación, ejemplos y errores típicos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada uno de los 165 puntos gramaticales del sílabo oficial (HSK 1–3) tenga patrón, explicación en español, ejemplos validados dentro de su nivel y al menos un error típico diagnosticado, y que la pantalla de detalle lo muestre entero.

**Architecture:** Mismo modelo que lecturas y ejercicios: **contenido como fichero del repositorio, validado en la build**. Un fichero por punto (`server/db/seeds/grammar/<nivel>-<código>.json`) sustituye a `grammar-examples.json`. Un validador de dominio comprueba que los ejemplos usan solo vocabulario hasta el nivel del punto, que de verdad contienen la estructura que ilustran (marcadores declarados) y que cada ejemplo trae pinyin y traducción. `import-syllabus.js` superpone ese contenido sobre los títulos oficiales, como ya hace hoy con los 6 curados.

**Tech Stack:** Node 26, vitest, Jest, TypeScript, Supabase.

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 1 (§7 familias gramaticales HSK 2) y §Plan 6 («explicaciones que diagnostican el error, no que solo lo señalan»).

## Global Constraints

- Idioma de explicaciones y traducciones: **español**, como lecturas (`es`) y ejercicios. Los 6 puntos actuales, en inglés, se reescriben.
- Ninguna explicación con la forma «X (pinyin) means 'Y'» (regla del Plan 6, se aplica aquí también).
- Los ejemplos de un punto de nivel N solo usan vocabulario de niveles ≤ N (mismo diccionario que `build-readings.js:loadDictionary`).
- Clave de un punto: `(hsk_level, code)`. **`code` solo no es único**: 47 códigos se repiten entre niveles.
- Orden de producción: HSK 2 → HSK 1 → HSK 3 (el examen objetivo es HSK 2 y HSK 1 es su prerrequisito).
- `npm test` en verde al final de cada tarea. Prohibido escribir mitigaciones.

## Review Focus

1. **Ejemplo que no ilustra el punto** (p. ej. un ejemplo de 动词重叠 sin ninguna forma AA/ABAB): el validador lo rechaza por `marker_absent`.
2. **Punto con el mismo código en dos niveles** (47 casos): el contenido de `2-2.6.6` nunca acaba en el punto de nivel 1; test explícito con un código duplicado.
3. **Puntos morfológicos de un solo ítem** (前缀 `小—、第—`): el marcador con guion se normaliza (`小`, `第`) y el validador no exige una frase larga imposible.
4. **Lectura que apunta a un punto** (`target_grammar`): la pantalla de detalle enlaza las lecturas reales que lo usan; si ninguna lo usa, no pinta la sección.
5. **Ejemplo con un nombre propio fuera de diccionario** (王老师): se rechaza como `unknown_vocabulary`, igual que hace hoy `validateReading`, que no tiene excepción para nombres. Los ejemplos usan pronombres o sustantivos del nivel (老师, 朋友, 妈妈).

---

## Estado de partida verificado (25 de noviembre de 2026)

- `grammar-points.json`: 165 puntos (HSK 1: 49, HSK 2: 59, HSK 3: 57). Solo 6 tienen `pattern`, `explanation` y `examples`: `1-2.6.6`, `1-2.9.3`, `1-3.1.1`, `2-6.1.1`, `2-6.4.3`, `3-6.2.1`. Los 159 restantes tienen solo `title`, `group`, `category` e `items`.
- Los 6 completos están **en inglés** (`explanation` y `examples[].en`).
- **Bug de render:** el seed guarda los ejemplos como `{ zh, pinyin, en }` (`2026090602_seed_initial_corpus.sql:1704`), pero `GrammarPoint.examples` está tipado como `{ chinese, pinyin, english }` (`types.ts:344`) y `GrammarDetailScreen.tsx:113-121` lee `example.chinese` y `example.english`. Resultado: **de los ejemplos solo se ve el pinyin**. `normalizeGrammarPoint` no traduce las claves.
- Los títulos de sección de la pantalla están en inglés (`Pattern`, `Explanation`, `Examples`).

## Formato de un punto

```json
{
  "hsk_level": 2,
  "code": "2.2.1",
  "pattern": "V + V / V + 一 + V / V + 了 + V / AB + AB",
  "explanation": "Repetir un verbo suaviza la acción: indica que dura poco o que se hace de forma relajada. …",
  "markers": ["看看", "试一试", "想了想", "休息休息"],
  "examples": [
    { "zh": "你看看这本书。", "pinyin": "Nǐ kànkan zhè běn shū.", "es": "Échale un vistazo a este libro." }
  ],
  "common_errors": [
    { "wrong": "我看看了三个小时书。", "right": "我看了三个小时书。", "why": "La reduplicación indica brevedad; no encaja con una duración larga." }
  ],
  "see_also": [{ "hsk_level": 1, "code": "2.2.1" }]
}
```

Mínimos: 3 ejemplos, 1 error típico, ≥ 1 marcador; cada marcador aparece en al menos un ejemplo y cada ejemplo contiene al menos un marcador.

## File Structure

**Se crean:**
- `packages/domain/src/grammar/validate.ts` (+ `.test.ts`)
- `scripts/build-grammar.js` (+ `.test.js`)
- `server/db/seeds/grammar/<nivel>-<código>.json` — 165 ficheros.

**Se modifican:**
- `scripts/import-syllabus.js` — superpone `grammar/*.json` en lugar de `grammar-examples.json`.
- `scripts/corpus-contract.test.js:312`
- `supabase/migrations/2026112502_grammar_content.sql` — columna `common_errors jsonb not null default '[]'`, `see_also jsonb not null default '[]'`.
- `packages/data/src/types.ts`, `packages/data/src/repositories/grammar.ts`
- `apps/mobile/src/screens/GrammarDetailScreen.tsx` (+ test)

**Se borra:** `server/db/seeds/grammar-examples.json` (su contenido migra a 6 ficheros de `grammar/`).

---

### Task 1: Los ejemplos se ven, y el contrato de datos queda en `zh/pinyin/es`

**Files:**
- Modify: `packages/data/src/types.ts:335-346`, `packages/data/src/repositories/grammar.ts`, `apps/mobile/src/screens/GrammarDetailScreen.tsx`
- Test: `apps/mobile/src/screens/GrammarScreen.test.tsx` (o `GrammarDetailScreen.test.tsx` nuevo), `packages/data/src/repositories/grammar.test.ts` (nuevo)

**Interfaces:**
- Produces:
  ```ts
  export interface GrammarExample { zh: string; pinyin: string; es: string }
  export interface GrammarError { wrong: string; right: string; why: string }
  export interface GrammarPoint { /* … campos actuales … */
    examples: GrammarExample[];
    common_errors: GrammarError[];
    see_also: Array<{ hsk_level: HskLevel; code: string }>;
  }
  ```

- [ ] **Step 1: Failing test** de pantalla: con un punto `{ examples: [{ zh: '我喝茶。', pinyin: 'Wǒ hē chá.', es: 'Bebo té.' }] }`, `getByText('我喝茶。')` y `getByText('Bebo té.')`. Hoy falla: solo se pinta el pinyin.
- [ ] **Step 2: Failing test** de repositorio: `normalizeGrammarPoint` con `common_errors` ausente devuelve `[]`.
- [ ] **Step 3:** Cambiar el tipo, leer `zh`/`es` en la pantalla, títulos en español (`Estructura`, `Explicación`, `Ejemplos`, `Errores típicos`, `Ver también`), sección de errores con `wrong` tachado, `right` y `why`.
- [ ] **Step 4:** `npm test` → PASS. Commit `fix(grammar): pintar el hanzi y la traducción de los ejemplos`.

### Task 2: Validador de puntos gramaticales

**Files:**
- Create: `packages/domain/src/grammar/validate.ts`, `packages/domain/src/grammar/validate.test.ts`

**Interfaces:**
- Consumes: `tokenize` de `packages/domain/src/reading/tokenize.ts`, el mismo `dictionary` que usa `validateReading`.
- Produces:
  ```ts
  export type GrammarIssueKind = 'too_few_examples' | 'no_common_error' | 'no_markers'
    | 'marker_absent' | 'marker_unused' | 'unknown_vocabulary' | 'missing_pinyin'
    | 'missing_translation' | 'english_explanation' | 'means_pattern' | 'see_also_unknown';
  export function validateGrammarEntry(
    entry: GrammarEntry,
    ctx: { dictionary: Array<{ hanzi: string; hsk_level: number }>; known_points: Array<{ hsk_level: number; code: string }> },
  ): Array<{ kind: GrammarIssueKind; example_index?: number; detail?: string }>;
  ```

- [ ] **Step 1: Failing tests**, uno por `GrammarIssueKind`, con valores concretos:
  - 2 ejemplos → `too_few_examples`.
  - Ejemplo `我看了书。` con marcadores `['看看']` → `marker_absent` en `example_index: 0`.
  - Marcador `试一试` que no aparece en ningún ejemplo → `marker_unused`.
  - Punto de nivel 1 con ejemplo que contiene `已经` (HSK 2) → `unknown_vocabulary`.
  - `explanation` que casa con `/\b(the|is|are|and)\b/i` → `english_explanation`.
  - `explanation` que casa con `/\(\s*[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ ]+\s*\)\s*means/i` → `means_pattern`.
  - `see_also` a `(4, '9.9.9')` → `see_also_unknown`.
  - Entrada correcta → `[]`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. Marcadores: coincidencia de subcadena tras quitar `—` y espacios. **Step 4:** PASS. Commit `feat(grammar): validador de contenido gramatical`.

### Task 3: Build y seed desde `grammar/*.json`

**Files:**
- Create: `scripts/build-grammar.js`, `scripts/build-grammar.test.js`, `supabase/migrations/2026112502_grammar_content.sql`
- Modify: `scripts/import-syllabus.js`, `scripts/build-supabase-seed.js`, `scripts/corpus-contract.test.js`, `package.json` (`"build-grammar"`)
- Delete: `server/db/seeds/grammar-examples.json`

**Interfaces:**
- Produces: `npm run build-grammar` imprime `HSK 1: x/49 · HSK 2: y/59 · HSK 3: z/57 · issues: n` y sale con 1 si `n > 0`. Con `--complete` sale con 1 también si algún punto oficial no tiene fichero.

- [ ] **Step 1: Failing tests** (`build-grammar.test.js`): fichero `2-2.6.6.json` se aplica al punto `(2, '2.6.6')` y no al `(1, '2.6.6')`; fichero cuyo nombre no casa con `hsk_level`/`code` → error; fichero para un punto que no existe en el sílabo → error; `--complete` con 164/165 → exit 1.
- [ ] **Step 2:** Migrar los 6 puntos actuales a ficheros, **reescritos en español** y con `markers` y `common_errors`, para que pasen el validador.
- [ ] **Step 3:** Implementar. Como hace `build-readings.test.js:46` con las lecturas, `build-grammar.test.js` añade «todos los puntos con fichero pasan el validador», que es lo que mete el catálogo en `npm test`; la comprobación de completitud (`--complete`) entra en la Tarea 5. Migración con las dos columnas. `build-supabase-seed.js` emite `common_errors` y `see_also`.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat(grammar): contenido gramatical como ficheros validados`.

### Task 4: Enlace con lecturas

**Files:**
- Modify: `packages/data/src/repositories/grammar.ts`, `apps/mobile/src/screens/GrammarDetailScreen.tsx`

**Interfaces:**
- Produces: `getGrammarReadings(level: HskLevel, code: string, client): Promise<Array<{ slug: string; title: string; sentence: string }>>` — lecturas de `reading_catalog` cuyo `target_grammar` contiene `{ code, level }`, con la primera frase que contiene un marcador del punto.

- [ ] **Step 1: Failing tests:** repositorio filtra por `(level, code)` y no por `code` solo; pantalla con 0 lecturas no pinta la sección «En lecturas»; con 1, la pinta y navega a `practice/readings/<slug>`.
- [ ] **Step 2–3:** implementar → PASS. Commit `feat(grammar): ejemplos reales desde las lecturas`.

### Task 5: Producción editorial de los 159 puntos

Contenido, no código. **Un commit por bloque de ~10 puntos**, cada uno con `npm test` en verde.

- [ ] **Step 1: HSK 2 (57 puntos).** Por cada punto: estructura, explicación de 2–5 frases en español centrada en *cuándo* se usa y *en qué se diferencia* de lo que el alumno confundirá, 3–5 ejemplos, 1–2 errores típicos reales de hispanohablantes, `see_also` hacia los puntos de nivel 1 que amplía.
- [ ] **Step 2: HSK 1 (46 puntos).** Igual.
- [ ] **Step 3: HSK 3 (56 puntos).** Igual.
- [ ] **Step 4:** Revisión de un profesor de chino por nivel antes de cerrar ese nivel; se anota en el commit quién revisó.
- [ ] **Step 5:** Añadir a `build-grammar.test.js` el test «los 165 puntos oficiales tienen fichero». Commit `content(grammar): 165/165 puntos con contenido validado`.

---

## Criterio de salida

1. `npm run build-grammar -- --complete` → `HSK 1: 49/49 · HSK 2: 59/59 · HSK 3: 57/57 · issues: 0`.
2. `npm test` en verde con `--complete`.
3. En el simulador, el detalle de `2-2.2.1` muestra hanzi, pinyin y español de cada ejemplo, la sección de errores típicos y al menos una lectura enlazada.
4. `grammar-examples.json` ya no existe y ningún script lo referencia (`grep -r grammar-examples scripts` vacío).

## Lo que este plan deja sin resolver

- **Ejercicios generados desde la gramática** (p. ej. fill-blank sobre los marcadores). Es el paso natural siguiente, pero pertenece al banco de ejercicios del Plan 6.
- **Audio de los ejemplos.** Se oyen con TTS, como el resto de frases sueltas de la app; el compromiso de audio humano del maestro es para el corpus de lecturas.
