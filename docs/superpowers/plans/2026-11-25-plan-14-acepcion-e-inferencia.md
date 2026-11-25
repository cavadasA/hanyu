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

1. **Palabra ambigua con el mismo pinyin** (会 «saber» / «reunión», 点 «en punto» / «pedir», 分 «minuto» / «céntimo»): el pinyin no decide. Sin anotación, la build falla con `sense_unresolved`, nombrando la lectura, la frase y la palabra.
2. **Anotación que contradice al pinyin** (anotar 长 como `zhǎng` en una frase con `cháng`): la build falla con `sense_conflict`.
3. **Pregunta inferencial cuya opción correcta aparece literalmente en una frase**: la build falla con `inference_is_literal`.
4. **Lectura sin ninguna pregunta inferencial** tras este plan: la build falla con `no_inferential`.
5. **Alumno sin preguntas inferenciales respondidas**: la métrica muestra «sin datos», no 0 %.

---

## Estado de partida verificado (25 de noviembre de 2026)

- **Ambigüedad real del corpus:** de 1 009 entradas HSK 1–3, solo **20 hanzi** tienen más de una entrada (点, 多, 分, 给, 还, 好, 回, 会, 家, 那, 有些, 只, 长, 得, 地…). En varios de ellos (长, 还, 得, 地, 只…) las acepciones tienen pinyin distinto, así que el pinyin de la frase ya decide. El problema es mucho más pequeño de lo que parecía al escribir el Plan 8.
- `tokenize.ts:56-63` adjunta `senses` cuando hay más de una entrada, y `WordSheet.tsx` las ordena por nivel y las muestra todas.
- `validate.ts:38` exige un `evidence_sentence` por pregunta. Con eso, todas las preguntas son literales por construcción.
- `ProgressScreen.tsx:578-581` pinta «Comprensión inferencial» como ausente declarada.

## File Structure

**Se crean:** `packages/domain/src/reading/senses.ts` (+ test).
**Se modifican:**
- `packages/domain/src/reading/validate.ts` (+ test).
- `packages/domain/src/reading/tokenize.ts` (+ test).
- `scripts/build-readings.js`.
- `server/db/seeds/readings/*.json` (las 48).
- `packages/data/src/repositories/readings.ts`, `types.ts`.
- `apps/mobile/src/readings/WordSheet.tsx`, `ReadingQuestions.tsx` (+ tests).
- `packages/domain/src/analytics/reading.ts` (+ test).
- `apps/mobile/src/screens/ProgressScreen.tsx` (+ test).

---

### Task 1: La acepción se resuelve en la build

**Interfaces:**
- Produces:
  ```ts
  export interface SenseAnnotation { sentence: number; hanzi: string; occurrence: number; sense_index: number }
  export function resolveSenses(
    reading: ReadingSource & { senses?: SenseAnnotation[] },
    dictionary: DictionaryEntry[],
  ): { resolved: Array<{ sentence: number; token_id: string; sense_index: number; by: 'only' | 'pinyin' | 'annotation' }>;
       issues: Array<{ kind: 'sense_unresolved' | 'sense_conflict' | 'annotation_orphan'; sentence: number; hanzi: string }> };
  ```
  Orden de resolución:
  1. Una sola entrada → `only`.
  2. Si no, se filtran las entradas cuyo pinyin coincide con la sílaba alineada de la frase. Si queda una → `pinyin`.
  3. Si quedan varias → se exige anotación (`annotation`). Si no la hay → `sense_unresolved`.

  Una anotación que no coincide con el pinyin da `sense_conflict`; una que no corresponde a ningún token ambiguo da `annotation_orphan`.
- La lectura compilada lleva `sentences[i].tokens[j].sense_index` resuelto, y el cliente ya no adivina.

- [ ] **Step 1: Failing tests:**
  - `长城很长。` con pinyin `Chángchéng hěn cháng.` → 长 resuelto por `pinyin` con la entrada `cháng`.
  - `他会说汉语。` sin anotación → `sense_unresolved` (会 tiene dos entradas `huì`).
  - La misma frase con `{ sentence: 0, hanzi: '会', occurrence: 0, sense_index: <saber> }` → `annotation`.
  - Una anotación `zhǎng` sobre una frase con `cháng` → `sense_conflict`.
- [ ] **Step 2:** implementar reutilizando la alineación de `scripts/lib/ssml.js`, que se mueve a `packages/domain/src/reading/align-pinyin.ts` para no depender de `scripts/`.
- [ ] **Step 3:** Anotar las 48 lecturas donde la build lo pida, y llevar el `sense_index` resuelto al catálogo.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat(reader): acepción resuelta en la build`.

### Task 2: El lector muestra la acepción de la frase

**Interfaces:**
- Consumes: `token.sense_index` del catálogo.
- `WordSheet` muestra **primero y destacada** la acepción resuelta. Las demás van plegadas bajo «Otros significados», no se borran: el alumno puede querer verlas. «Añadir a Cards» añade la acepción resuelta, no la primera por nivel.

- [ ] **Step 1: Failing tests:** con `sense_index` de «reunión» para 会, el primer significado visible es «reunión» y «saber» solo aparece al desplegar; «Añadir a Cards» envía el `word_id` de «reunión».
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
- Reglas nuevas del validador:
  - `inference_needs_two`: menos de 2 `evidence_sentences`.
  - `inference_is_literal`: el texto de la opción correcta aparece entero en alguna frase de evidencia.
  - `rationale_missing`: falta `rationale_es`, o tiene menos de 20 caracteres.
  - `no_inferential`: con `--complete`, una lectura sin ninguna pregunta inferencial.

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
- Produces: `comprehensionByKind(events): { literal: Ratio | null; inferential: Ratio | null }` en `analytics/reading.ts`. `null` si hay menos de 5 respuestas de ese tipo.
- `ProgressScreen` sustituye la ausencia declarada por la métrica real, con «sin datos» cuando es `null`.

- [ ] **Step 1: Failing tests:** 4 respuestas inferenciales → `inferential: null`; 6 con 3 aciertos → `0.5`; la pantalla con `null` muestra «Sin datos todavía», nunca «0 %».
- [ ] **Step 2:** implementar → PASS.
- [ ] **Step 3:** Actualizar el maestro, en los Planes 8 y 9: los dos límites quedan cerrados. Commit `feat(analytics): comprensión inferencial medida`.

---

## Criterio de salida

1. `npm test` en verde con `--complete`: 0 `sense_unresolved` y 48/48 lecturas con al menos una pregunta inferencial.
2. En el simulador: tocar 会 en 「我们下午有一个会」 muestra «reunión» primero.
3. Progreso muestra comprensión literal e inferencial por separado, o «sin datos».

## Lo que este plan deja sin resolver

- **Texto que no sea del catálogo.** Si algún día el alumno pega su propio texto, ahí no hay anotaciones y vuelve el problema original. Hoy la app no tiene esa función.
- **Inferencias de más de dos pasos** (actitud del autor, intención implícita). Están por encima de HSK 2.
