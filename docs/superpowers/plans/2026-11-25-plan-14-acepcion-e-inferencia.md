# Plan 14 — Acepción por contexto y comprensión inferencial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar los dos límites que los Planes 8 y 9 aceptaron a propósito: que el lector muestre **la acepción correcta** de cada palabra en su frase, y que haya **preguntas inferenciales** que permitan medir esa comprensión.

**Architecture:** Los dos límites salieron de pensar en análisis **en tiempo de ejecución**: desambiguar en el móvil pide análisis sintáctico, y una pregunta inferencial no tiene una frase que la demuestre. Pero desde el Plan 7 las lecturas son contenido de build, así que ambas cosas se pueden **anotar al escribir la lectura y validar en la build**. La acepción se resuelve sola por el pinyin de la frase en la mayoría de los casos, y una anotación explícita cubre el resto. Una pregunta inferencial declara las frases que combina y por qué, y un validador comprueba que no sea literal.

**Tech Stack:** TypeScript, vitest, Jest.

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 8 («Tokenización con desambiguación de sentido y pronunciación») y §Plan 9 («comprensión literal e inferencial»).

**Depende de:** Plan 10 terminado (las 48 lecturas). La Tarea 1 reutiliza la alineación hanzi↔pinyin de `scripts/lib/ssml.js` (Plan 10, Tarea 6).

## Global Constraints

- La regla «ninguna lectura entra sin pasar los validadores» se mantiene: las dos anotaciones nuevas son **obligatorias** donde aplican.
- Ninguna métrica sin datos muestra un cero (Plan 9).
- Prohibido escribir mitigaciones. `npm test` en verde al final de cada tarea.

## Review Focus

1. **Palabra ambigua con el mismo pinyin** (会 «saber» / «reunión», 点 «tocar; marcar» / «pedir; punto», 花 «flor» / «gastar»): el pinyin no decide. Sin anotación, la build falla con `sense_unresolved`, nombrando la lectura, la frase y la palabra.
2. **Anotación que contradice al pinyin** (anotar 长 como `zhǎng` en una frase con `cháng`): la build falla con `sense_conflict`.
2b. **Entradas duplicadas** (好, 多, 家… repetidas con el mismo pinyin, significado y categoría en dos niveles): cuentan como una sola, la de nivel más bajo. Nunca piden anotación.
2c. **Acepción por encima del nivel** (会 «reunión», L3, en una lectura HSK 2): la build falla con `sense_above_level`.
3. **Pregunta inferencial cuya opción correcta aparece literalmente en una frase**: la build falla con `inference_is_literal`.
4. **Lectura sin ninguna pregunta inferencial** tras este plan: la build falla con `no_inferential`.
5. **Alumno sin preguntas inferenciales respondidas**: la métrica muestra «sin datos», no 0 %.

---

## Estado de partida verificado (25 de noviembre de 2026)

- **Ambigüedad real del corpus:** de 1 009 entradas HSK 1–3, **20 hanzi** tienen más de una entrada. Se reparten así:
  - **El pinyin decide (5):** 还 hái/huán, 只 zhī/zhǐ, 长 cháng/zhǎng, 得 de/děi, 地 de/dì.
  - **Duplicados exactos (10):** 多, 分, 给, 好, 回, 家, 那, 有些, 头, 一会儿. Mismo pinyin, significado y categoría en dos niveles: no son dos acepciones.
  - **Mismo pinyin, acepciones distintas (5):** 点 (L1 = L3 «tocar; marcar» / L2 «pedir; punto»), 会 (L1 «saber» / L3 «reunión»), 过去 (L2 / L3), 花 (L2 «flor» / L2 «gastar»), 站 (L2 «estación» / L3 «estar de pie»).
- `tokenize.ts:56-63` adjunta `senses` cuando hay más de una entrada, y `WordSheet.tsx` las ordena por nivel y las muestra todas. Por eso hoy la ficha de 好 muestra dos veces la misma acepción.
- **La tokenización que ve el alumno no se hace en la build.** La hace la Edge Function `supabase/functions/tokenize-reading`, en tiempo de ejecución, con el diccionario L1–3 de la tabla `words`. Las lecturas llegan a la base de datos por `scripts/build-supabase-seed.js` → `supabase/seed.sql`.
- `validate.ts` tokeniza con el diccionario ≤ nivel de la lectura. Por eso, una acepción L3 de una forma L1 (会 «reunión») entra hoy en una lectura HSK 2 sin que nada lo detecte.
- `reading_attempts` guarda `answers` (id de pregunta → opción), `score` y `total`. No guarda el tipo de pregunta. Los ids de pregunta son `q${index}`.
- `validate.ts:38` exige un `evidence_sentence` por pregunta. Con eso, todas las preguntas son literales por construcción.
- `ProgressScreen.tsx:578-581` pinta «Comprensión inferencial» como ausente declarada.

## File Structure

**Se crean:** `packages/domain/src/reading/senses.ts` (+ test).
**Se modifican:**
- `packages/domain/src/reading/validate.ts` (+ test).
- `packages/domain/src/reading/tokenize.ts` (+ test).
- `scripts/build-readings.js`, `scripts/build-supabase-seed.js` y `supabase/seed.sql`.
- `supabase/functions/tokenize-reading/handler.ts` (+ test). El redespliegue de la función y la carga del seed remoto los hace el usuario cuando hace push.
- `server/db/seeds/readings/*.json` (las 48) y `server/db/seeds/hsk*-words.json` (solo `sense_index` donde la clave natural no baste).
- `packages/data/src/repositories/readings.ts`, `stats.ts`, `types.ts`.
- `apps/mobile/src/readings/WordSheet.tsx`, `ReadingQuestions.tsx` (+ tests).
- `packages/domain/src/analytics/reading.ts` (+ test).
- `apps/mobile/src/screens/ProgressScreen.tsx` (+ test).

---

### Task 1: La acepción se resuelve en la build

**Interfaces:**
- Produces:
  ```ts
  // La acepción se nombra con la clave natural de `words`: (hanzi, hsk_level, sense_index).
  export interface SenseKey { hsk_level: number; sense_index: number | null }
  export interface SenseAnnotation extends SenseKey { sentence: number; hanzi: string; occurrence: number }
  export interface ResolvedSense extends SenseKey { sentence: number; hanzi: string; occurrence: number; by: 'only' | 'pinyin' | 'annotation' }
  export function distinctSenses<T extends DictionaryEntry>(entries: T[]): T[];
  export function resolveSenses(
    reading: { hsk_level: number; sentences: Array<{ tokens: Array<{ text: string; pinyin: string | null }> }>; senses?: SenseAnnotation[] },
    dictionary: DictionaryEntry[],   // L1–3, el mismo que usa la Edge Function
  ): { resolved: ResolvedSense[];
       issues: Array<{ kind: 'sense_unresolved' | 'sense_conflict' | 'annotation_orphan' | 'sense_above_level'; sentence: number; hanzi: string; detail?: string }> };
  ```
  `resolveSenses` recibe la frase ya tokenizada y con el pinyin alineado por token; la alineación se enchufa después (Step 2). Las candidatas de cada token son `distinctSenses` de sus entradas: dos entradas con el mismo pinyin, `meaning_en`, `meaning_es` y `pos` son la misma, y queda la de nivel más bajo.

  Orden de resolución:
  1. Una sola candidata → `only`.
  2. Si no, se filtran las candidatas cuyo pinyin coincide con el pinyin alineado del token. El cambio de tono de 一 (yī/yí/yì) y de 不 (bù/bú) no cuenta. Si queda una → `pinyin`.
  3. Si quedan varias → se exige anotación (`annotation`). Si no la hay → `sense_unresolved`.

  Una anotación que no coincide con el pinyin, o que nombra una entrada que no es candidata, da `sense_conflict`. Una que no corresponde a ningún token con varias candidatas da `annotation_orphan`. Una acepción resuelta de nivel mayor que el de la lectura da `sense_above_level`.
- La lectura del seed lleva `sentences[i].senses`: la lista de `ResolvedSense` de esa frase. La Edge Function `tokenize-reading` la aplica: el `word` del token pasa a ser la acepción resuelta, y el cliente ya no adivina.

- [ ] **Step 1: Failing tests:**
  - `长城很长。` con pinyin `Chángchéng hěn cháng.` → 长 resuelto por `pinyin` con la entrada `cháng`.
  - `他会说汉语。` sin anotación → `sense_unresolved` (会 tiene dos entradas `huì`).
  - La misma frase con `{ sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 1, sense_index: 1 }` → `annotation`.
  - Una anotación `zhǎng` sobre una frase con `cháng` → `sense_conflict`.
  - 好 (L1 y L2 idénticas) → `only` con la entrada L1, sin anotación.
  - 会 anotado como «reunión» (L3) en una lectura HSK 2 → `sense_above_level`.
  - 一会儿 con pinyin de frase `yīhuìr` frente a `yíhuìr` en el diccionario → coincide.
- [ ] **Step 2:** implementar `senses.ts`. Después del Plan 10, mover la alineación de `scripts/lib/ssml.js` a `packages/domain/src/reading/align-pinyin.ts`, para no depender de `scripts/`, y enchufarla en `build-readings.js`. La tokenización de la build para resolver usa el diccionario L1–3, el mismo que usa la Edge Function. Si no, los `occurrence` no coincidirían.
- [ ] **Step 3:** Anotar las 48 lecturas donde la build lo pida. `build-supabase-seed.js` escribe `sentences[i].senses` en `supabase/seed.sql`. La Edge Function aplica la acepción dada (test).
- [ ] **Step 4:** `npm test` → PASS. Commit `feat(reader): acepción resuelta en la build`.

### Task 2: El lector muestra la acepción de la frase

**Interfaces:**
- Consumes: el `word` del token, que la Edge Function ya fija en la acepción resuelta; `token.senses`, sin duplicados (`distinctSenses` en `tokenize.ts`).
- `WordSheet` muestra **primero y destacada** la acepción resuelta. Las demás van plegadas bajo «Otros significados», no se borran: el alumno puede querer verlas. «Añadir a Cards» añade la acepción resuelta, no la primera por nivel. La ficha de 好 muestra una sola acepción.

- [ ] **Step 1: Failing tests:** con «reunión» como `word` resuelto de 会, el primer significado visible es «reunión» y «saber» solo aparece al desplegar; «Añadir a Cards» envía el `word_id` de «reunión»; dos entradas idénticas de 好 se muestran como una.
- [ ] **Step 2:** implementar → PASS. Commit `feat(reader): la ficha de palabra muestra la acepción del contexto`.

### Task 3: Preguntas inferenciales

**Interfaces:**
- `ReadingQuestion` pasa a:
  ```ts
  type ReadingQuestion =
    | { kind: 'literal'; prompt; options; answer_index; evidence_sentence: number }
    | { kind: 'inferential'; prompt; options; answer_index; evidence_sentences: number[]; rationale_es: string };
  ```
  Las preguntas existentes sin `kind` se leen como `literal`: no hay que reescribirlas.
- La pregunta inferencial va **siempre al final** de las preguntas de la lectura. Los ids son `q${index}`, y una inserción en medio cambiaría el significado de las respuestas ya guardadas. El validador lo exige: `inference_not_last` si hay una literal detrás de una inferencial.
- Reglas nuevas del validador:
  - `inference_needs_two`: menos de 2 `evidence_sentences`.
  - `inference_is_literal`: el texto de la opción correcta aparece entero en alguna frase de evidencia.
  - `rationale_missing`: falta `rationale_es`, o tiene menos de 20 caracteres.
  - `no_inferential`: con `--complete`, una lectura sin ninguna pregunta inferencial.
  - `inference_not_last`: una pregunta literal detrás de una inferencial.

- [ ] **Step 1: Failing tests:**
  - Una pregunta inferencial cuya respuesta 「六点」 aparece en la frase 0 → `inference_is_literal`.
  - Una pregunta que combina 「妈妈做好了午饭」 y 「中午回家」 con respuesta 「家里」 a «¿Dónde come al mediodía?» → `[]`.
  - Una pregunta inferencial con una sola frase de evidencia → `inference_needs_two`.
- [ ] **Step 2:** implementar → PASS.
- [ ] **Step 3:** Añadir **una pregunta inferencial a cada una de las 48 lecturas**, sin tocar las literales. Las respuestas inferenciales también cuentan para la regla `answers_not_spread`.
- [ ] **Step 4:** `ReadingQuestions` muestra la explicación (`rationale_es`) después de responder una inferencial. Test.
- [ ] **Step 5:** Commit `feat(readings): preguntas inferenciales validadas`.

### Task 4: La métrica existe

**Interfaces:**
- Produces: `comprehensionByKind(attempts): { literal: Ratio | null; inferential: Ratio | null }` en `analytics/reading.ts`. `null` si hay menos de 5 respuestas de ese tipo.
- El tipo se guarda: `reading_attempts` gana `inferential_score` e `inferential_total` (migración, por defecto 0). Así, los intentos antiguos cuentan enteros como literales, y lo eran. `submitReadingAnswers` los rellena según el `kind` de cada pregunta. El RPC `learning_report` los devuelve, y `stats.ts` los lleva al informe.
- `ProgressScreen` sustituye la ausencia declarada por la métrica real, con «sin datos» cuando es `null`.

- [ ] **Step 1: Failing tests:** 4 respuestas inferenciales → `inferential: null`; 6 con 3 aciertos → `0.5`; la pantalla con `null` muestra «Sin datos todavía», nunca «0 %».
- [ ] **Step 2:** implementar → PASS.
- [ ] **Step 3:** Actualizar el maestro, en los Planes 8 y 9: los dos límites quedan cerrados. Commit `feat(analytics): comprensión inferencial medida`.

---

## Criterio de salida

1. `npm test` en verde con `--complete`: 0 `sense_unresolved` y 48/48 lecturas con al menos una pregunta inferencial.
2. En el simulador: tocar 点 en una frase con 点 «pedir» (L2), como 「我们点了两个菜」, muestra «pedir» primero, y «tocar; marcar» (L1) plegado debajo. No se usa 会 «reunión»: es L3 y en una lectura HSK 2 da `sense_above_level`.
3. Progreso muestra comprensión literal e inferencial por separado, o «sin datos».

## Lo que este plan deja sin resolver

- **Texto que no sea del catálogo.** Si algún día el alumno pega su propio texto, ahí no hay anotaciones y vuelve el problema original. Hoy la app no tiene esa función.
- **Inferencias de más de dos pasos** (actitud del autor, intención implícita). Están por encima de HSK 2.
