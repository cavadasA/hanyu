# Plan 12 — Simulacro HSK 2 (formato 3.0): las 9 partes, con audio, imágenes y escritura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revisión 2 (25-nov-2026).** La primera versión de este plan se escribió contra H20901, la muestra de 2009. La Tarea 1 encontró la muestra oficial del HSK 2 con formato 3.0 y se paró, como exigía el plan, porque la estructura cambia: 3 secciones, 9 partes, sección nueva de escritura y ningún ✓/✗. Esta versión está reescrita sobre esa muestra. La transcripción completa está en `docs/hsk/hsk2-3.0-estructura.md` (Tarea 1).

**Goal:** Que el simulacro reproduzca el examen HSK 2 del formato 3.0: 听力 25 preguntas en 3 partes, 阅读 25 en 4 partes, 书写 10 en 2 partes. Las 60 preguntas con el formato de cada parte y los tiempos oficiales, y un resultado por sección que diga dónde flojea el alumno.

**Architecture:** El simulacro deja de construirse con ejercicios de práctica (`generated_exercises`) y pasa a tener **contenido propio de examen**: grupos de preguntas que comparten estímulo (3 imágenes propias, un grupo de 5–6 imágenes, un banco de 6 palabras o componentes), escritos como ficheros del repositorio y validados en la build. Se agrupan en **formas fijas** (A, B, C), igual que un examen real. El audio de 听力 sale del pipeline de medios y de la síntesis del Plan 10. Las imágenes salen del mismo pipeline, con manifiesto de licencia. Los caracteres incompletos de 书写 1 se dibujan **a partir de los datos de trazos** (Make Me a Hanzi), sin hacer imágenes a mano. La escritura a mano de 书写 2 usa Hanzi Writer, y el Plan 13 reutiliza ese componente.

**Tech Stack:** Node 26, vitest, Jest, TypeScript, Supabase (Postgres + Storage), `expo-audio`, `expo-file-system` (lo añade el Plan 10), `react-native-webview` + Hanzi Writer, `hanzi-writer-data`, datos de descomposición de Make Me a Hanzi.

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 6 («Formatos fieles a la muestra oficial; simulacros parciales y completos con tiempo») y la muestra oficial `HSK（二级）样卷.pdf` (formato 3.0, 15-jul-2026).

**Depende de:** Plan 10, Tareas 2 (pipeline de medios) y 6 (`synthesize-audio`). Independiente del Plan 11.

## Global Constraints

- Estructura, literal de la portada de la muestra: «HSK（二级）分三部分，共 60 题：听力（25 题，约 17 分钟）；阅读（25 题，25 分钟）；书写（10 题，10 分钟）。听力结束后，有 3 分钟填写答题卡。»
- Partes: 听力 5 + 10 + 10; 阅读 5 + 5 + 10 + 5; 书写 5 + 5.
- Todo texto impreso lleva pinyin encima, como en la muestra.
- **No hay puntuación oficial publicada** para el formato 3.0: ni máximo ni aprobado. El resultado da **porcentaje de aciertos por sección y total**, sin «aprobado/no aprobado» ni escala inventada. El campo `official_scale` queda en `null` hasta que CTI publique la escala; entonces se rellena sin tocar código.
- **No se copia contenido de la muestra oficial** (preguntas, imágenes ni audio): es material con copyright. De ella se toma solo la estructura.
- El modo Exam del Plan 5B: sin ayudas, con tiempo, y no reprograma ninguna tarjeta.
- Ninguna pregunta entra sin pasar el validador de su parte, y ningún medio sin manifiesto válido.
- Vocabulario: hasta HSK 2 del corpus (`hsk1-words.json` 300 + `hsk2-words.json` 203 ≈ 500 acumuladas). Coincide con lo que dicen fuentes externas del 3.0 (~500 acumuladas), así que **no hay que cambiar el corpus**.
- Prohibido escribir mitigaciones.

## Review Focus

1. **App en segundo plano durante 听力**: el audio no se pausa (en el examen real tampoco). Al volver, la pregunta activa es la que corresponde al audio por reloj.
2. **Sin red a mitad de examen**: el examen se descarga entero (audio, imágenes, datos de trazos) antes de empezar. Sin descarga completa no se puede empezar.
3. **书写 2 con otro carácter válido** (escribir 好 donde iba 可): cuenta como fallo, y la corrección dice qué carácter se esperaba. **Trazos en otro orden pero carácter correcto**: acierto, porque el examen evalúa el carácter, no el orden.
4. **Opción del banco repetida**: en 阅读 2, 阅读 3 y 书写 1 cada opción se usa una vez por grupo. El validador rechaza dos respuestas iguales, y la interfaz quita la opción de la pregunta anterior si se reutiliza.
5. **Pregunta sin responder al acabar el tiempo**: cuenta como fallo, nunca sale del denominador.

---

## Estado de partida verificado (25 de noviembre de 2026)

- `build_mock_exam` (`2026090405_exercises_exam_hardening.sql:230-330`) solo sirve dos partes de lectura, y además con formato que no es el del examen. Todo lo demás sale como `unsupported`.
- `exam-structure.json` está transcrito de H20901 (2009): 听力 35/4 partes y 阅读 25 en 22 min, sin sección de escritura. **Está obsoleto.**
- No se guarda ningún intento ni ninguna puntuación de simulacro.
- **Fuente del formato 3.0**: zip oficial enlazado desde `chinesetest.cn/syllabus` («Sample Questions»). Contiene `HSK（二级）样卷.pdf`, `HSK（二级）样卷答案.pdf` y `音频/HSK（二级）样卷.mp3`. El HSK 3.0 empieza en todo el mundo el 13-dic-2026 (@HSKTestOfficial).
- La muestra **no dice cuántas veces suena cada audio ni las pausas**: hay que medirlo en el mp3 (Tarea 1).

## Formato de cada parte (muestra 3.0)

| Parte | Preguntas | Estímulo | Respuesta | Grupo |
|---|---|---|---|---|
| L1 听力 1 | 5 | frase en audio | 1 de **3 imágenes propias** (A/B/C) | 1 pregunta |
| L2 听力 2 | 10 | diálogo corto en audio | imagen del grupo | grupo 1: 6 imágenes A–F, el ejemplo gasta una; grupo 2: 5 imágenes A–E, sin ejemplo |
| L3 听力 3 | 10 | diálogo de 2 turnos + pregunta en audio | A/B/C texto con pinyin | 1 pregunta |
| R1 阅读 1 | 5 | frase | imagen del grupo | 6 imágenes A–F, el ejemplo gasta una |
| R2 阅读 2 | 5 | frase o minidiálogo con （ ） | palabra del banco | 6 palabras A–F, el ejemplo gasta una |
| R3 阅读 3 | 10 | frase | su respuesta china | grupo 1: 6 opciones A–F, el ejemplo gasta una; grupo 2: 5 opciones A–E |
| R4 阅读 4 | 5 | texto corto + pregunta ★ | A/B/C texto | 1 pregunta |
| W1 书写 1 | 5 | palabra de 2 caracteres con un carácter al que le falta un componente | componente del banco | 6 componentes A–F, el ejemplo gasta uno |
| W2 书写 2 | 5 | frase con pinyin y un （ ） | **escribir a mano el carácter** | 1 pregunta |

## File Structure

**Se crean:**
- `docs/hsk/hsk2-3.0-estructura.md` — transcripción de la muestra.
- `packages/domain/src/exam/{types,validate,score,timeline}.ts` (+ tests).
- `packages/domain/src/exam/components.ts` (+ test) — genera el carácter incompleto a partir de los datos de trazos.
- `server/db/seeds/exam/hsk2/<forma>/<parte>-<nn>.json`.
- `server/db/seeds/hanzi-decomposition.json` — subconjunto de Make Me a Hanzi (`decomposition`, `matches`) para los caracteres HSK 1–2, con la licencia en `server/db/seeds/LICENSES.md`.
- `content/images/exam/hsk2/<forma>/…` + `manifest.json`; `content/audio/exam/hsk2/<forma>/…` + `manifest.json`.
- `scripts/build-exam.js` (+ test).
- `supabase/migrations/2026112503_exam_forms.sql`.
- `apps/mobile/src/expression/CharacterWriting.tsx` (+ test) y `apps/mobile/assets/hanzi-writer/` — **el Plan 13 lo reutiliza**.
- `apps/mobile/src/exam/`:
  - `ExamRunner.tsx`, `ListeningSection.tsx`, `ReadingSection.tsx`, `WritingSection.tsx`.
  - Una vista por tipo de parte: `ImageTriple.tsx`, `ImageChoiceGroup.tsx`, `TextChoice.tsx`, `BankGroup.tsx` (para R2, R3 y W1), `IncompleteCharacter.tsx`, `HandwriteBlank.tsx`.
  - `ExamResult.tsx`, `useExamDownload.ts`.
  - Cada uno con su test.
- `packages/domain/src/analytics/exam.ts` (+ test).

**Se modifican:** `server/db/seeds/exam-structure.json` (se reescribe entero), `packages/domain/src/media/manifest.ts` (Plan 10, cambio aditivo: `ImageManifest`), `scripts/synthesize-audio.js` (Plan 10, cambio aditivo: `--exam`), `packages/data/src/repositories/exercises.ts` → se extrae `exam.ts`, `apps/mobile/src/screens/ExercisesScreen.tsx`.

**Se borra:** la RPC `build_mock_exam`, `buildMockExam` y los tipos `MockExam*`.

---

### Task 1: Estructura 3.0 transcrita y tiempos del audio medidos

- [ ] **Step 1:** Crear `docs/hsk/hsk2-3.0-estructura.md` con la transcripción que hizo la primera ejecución. Está en las notas de la sesión: `~/Library/Application Support/Claude/side-session-notes/local_bbaa3c05-31cb-4528-82c1-61ba74c76de8/plan12-tarea1-formato-hsk2-3.0.md`. Se copia la estructura y las fuentes, **no la clave de respuestas**: es contenido de la muestra y no sirve aquí.
- [ ] **Step 2:** Descargar solo `音频/HSK（二级）样卷.mp3` del zip oficial, leyendo por rangos como se hizo con los PDF. Se guarda en el scratchpad, fuera del repositorio. Medir con `ffprobe` y escuchando:
  - cuántas veces suena cada ítem de L1, L2 y L3;
  - la pausa entre repeticiones y entre preguntas;
  - la duración de las instrucciones de cada parte;
  - la duración total.

  Anotarlo en el mismo `.md`, citando los segundos del mp3.
- [ ] **Step 3:** Reescribir `exam-structure.json`:
  - Tres secciones: `listening` (≈17 min), `reading` (25), `writing` (10). Más `answer_sheet_minutes: 3` tras 听力 y `personal_info_minutes: 5`.
  - Por parte: `code`, `question_count`, `group_shapes` (p. ej. L2 `[{ options: 6, example_uses: 1, questions: 5 }, { options: 5, example_uses: 0, questions: 5 }]`), `answer_kind` (`image | text | bank | handwrite`) y, en 听力, `plays` y `pause_ms` medidos en el Step 2.
  - `official_scale: null`.
  - Se elimina `our_type`.
- [ ] **Step 4:** Tests en `scripts/corpus-contract.test.js`:
  - Suma de preguntas: 25, 25 y 10.
  - Cada `group_shape` cumple `options − example_uses ≥ questions`.
  - Ninguna parte tiene `answer_kind` ✓/✗.
- [ ] **Step 5:** Commit `docs(exam): estructura del HSK 2 3.0 transcrita y medida`.

### Task 2: Modelo de contenido y validadores por parte

**Interfaces:**
- Produces:
  ```ts
  export type ExamPartCode = 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3' | 'R4' | 'W1' | 'W2';
  export interface Printed { zh: string; pinyin: string }
  export interface ExamLine extends Printed { speaker: 'F' | 'M' }
  export type ExamGroup =
    | { part: 'L1'; items: Array<{ audio: ExamLine[]; images: [string, string, string]; answer: 0 | 1 | 2 }> }
    | { part: 'L2' | 'R1'; images: string[]; example?: { stimulus: ExamLine[] | Printed; answer: number };
        items: Array<{ audio?: ExamLine[]; text?: Printed; answer: number }> }
    | { part: 'L3'; items: Array<{ audio: ExamLine[]; question: ExamLine; options: [Printed, Printed, Printed]; answer: 0 | 1 | 2 }> }
    | { part: 'R2' | 'R3'; bank: Printed[]; example?: { text: Printed; answer: number }; items: Array<{ text: Printed; answer: number }> }
    | { part: 'R4'; items: Array<{ passage: Printed; question: Printed; options: [Printed, Printed, Printed]; answer: 0 | 1 | 2 }> }
    | { part: 'W1'; bank: string[]; example?: { word: Printed; target_index: 0 | 1; answer: number };
        items: Array<{ word: Printed; target_index: 0 | 1; answer: number }> }  // bank = componentes
    | { part: 'W2'; items: Array<{ sentence: Printed; answer: string }> };      // answer = 1 carácter
  export interface ExamForm { code: string; level: 2; groups: Array<ExamGroup & { slug: string }> }
  export interface ExamValidationContext {
    dictionary: Array<{ hanzi: string; hsk_level: number }>;
    handwriting: Set<string>;              // caracteres 手写 HSK 1–2 (Plan 13, Tarea 1; hasta entonces, todos los de HSK 1)
    decomposition: Record<string, { decomposition: string; matches: Array<number[] | null> }>;
    structure: ExamStructure;
    images: Set<string>;
  }
  export type ExamIssueKind = 'wrong_count' | 'answer_reused' | 'answer_out_of_range' | 'unknown_vocabulary'
    | 'missing_pinyin' | 'blank_missing' | 'answers_unbalanced' | 'image_unknown'
    | 'component_not_in_character' | 'component_ambiguous' | 'handwrite_not_allowed' | 'handwrite_not_single';
  export interface ExamIssue { kind: ExamIssueKind; group?: string; question_index?: number; detail?: string }
  export function validateExamGroup(group: ExamGroup, ctx: ExamValidationContext): ExamIssue[];
  export function validateExamForm(form: ExamForm, ctx: ExamValidationContext): ExamIssue[];
  ```

- [ ] **Step 1: Failing tests:**
  - L1 con 2 imágenes → `wrong_count`.
  - Grupo 1 de L2 con 5 imágenes cuando `group_shapes` pide 6 → `wrong_count`.
  - R2 con dos frases que responden con la palabra 3 → `answer_reused`.
  - R2 sin `（ ）` → `blank_missing`.
  - L3 con una palabra HSK 3 → `unknown_vocabulary`.
  - W1 con 学 y componente 日 → `component_not_in_character`.
  - W1 cuyo componente aparece dos veces en el carácter → `component_ambiguous`.
  - W2 con `answer: '学习'` → `handwrite_not_single`.
  - W2 con un carácter fuera de `handwriting` → `handwrite_not_allowed`.
  - Forma con 4 de 5 respuestas `A` en R4 → `answers_unbalanced` (ninguna letra > 45 % en las partes A/B/C).
  - Forma A completa → `[]`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Commit `feat(exam): modelo y validadores del HSK 2 3.0`.

### Task 3: Medios — imágenes, audio de 听力 y caracteres incompletos

**Interfaces:**
- Produces:
  ```ts
  export interface ImageManifest { owner: string; images: Array<{ key: string; file: string; depicts_es: string; source: string; license: string }> }
  export function buildListeningTimeline(groups: ExamGroup[], structure: ExamStructure, clipMs: Record<string, number>):
    Array<{ at_ms: number; kind: 'instruction' | 'example' | 'item'; part: ExamPartCode; question_index: number; clip: string; play: number }>;
  export function incompleteCharacterSvg(
    hanzi: string,
    missingComponent: string,
    strokes: string[],                                                  // paths SVG de hanzi-writer-data
    decomposition: { decomposition: string; matches: Array<number[] | null> }, // Make Me a Hanzi
  ): string;
  ```
- La línea de tiempo usa `plays` y `pause_ms` medidos en la Tarea 1. Si su duración total pasa de 18 minutos, `build-exam` falla.
- `incompleteCharacterSvg` dibuja el carácter **sin los trazos** que `matches` asigna al componente que falta, y deja un recuadro punteado en su lugar. Se genera en la build: no hay imágenes de caracteres hechas a mano.
- Imágenes: `.webp`, 800 px de lado mayor, como mucho 80 KB, con manifiesto (`depicts_es`, `source`, `license`). Cuántas hacen falta por forma: L1 15, L2 11 y R1 6, en total 32.
- Audio: `synthesize-audio --exam hsk2/<forma>`. Cada `ExamLine` va con la voz de su `speaker` y las instrucciones con una tercera voz. El proveedor es el que esté configurado en el Plan 10 (hoy edge-tts, provisional).

- [ ] **Step 1: Failing tests:**
  - L1 con `plays: 2` produce 2 entradas por pregunta.
  - La primera entrada de L2 es su instrucción.
  - Una forma de más de 18 minutos lanza.
  - `incompleteCharacterSvg('什', '十', …)` no contiene ningún trazo de 十 y sí los de 亻.
  - Un manifiesto de imagen sin licencia da `license_missing`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Commit `feat(exam): medios del examen, línea de tiempo y caracteres incompletos`.

### Task 4: Build, tablas y RPC

**Interfaces:**
- `exam_form (level, code, content jsonb, timeline jsonb, media jsonb, primary key (level, code))`, de solo lectura para `authenticated`.
- `exam_attempt (id, user_id, level, form_code, scope check in ('part','section','full'), part_code, started_at, finished_at, answers jsonb, section_scores jsonb, total_percent int, repeated boolean)`, con RLS por usuario.
- `get_exam_form(p_level, p_form default null)` devuelve la forma **sin ninguna clave `answer`**. Si `p_form` es null, elige la primera forma que el usuario no ha completado.
- `submit_exam_attempt(p_attempt jsonb)` corrige en servidor y devuelve la fila. W2 se corrige comparando el carácter reconocido que envía el cliente con `answer`.
- `packages/data`: `getExamForm`, `submitExamAttempt`, `listExamAttempts`.

- [ ] **Step 1: Failing tests:**
  - Todas las formas pasan `validateExamForm`.
  - Ninguna pregunta se repite entre formas.
  - `get_exam_form` no contiene `answer`, comprobado con `jsonb_path_exists`.
  - `submitExamAttempt` envía las respuestas por índice de pregunta.
- [ ] **Step 2–4:** implementar → PASS. Borrar `build_mock_exam` y `MockExam*`. Commit `feat(exam): formas del HSK 2 3.0, corregidas en servidor`.

### Task 5: Resultado

**Interfaces:**
- `scoreExam(correct: { listening: number; reading: number; writing: number }, structure): { sections: Record<'listening'|'reading'|'writing', { correct: number; total: number; percent: number }>; total_percent: number; official: null | { score: number; max: number; passed: boolean } }`.
- `official` es `null` mientras `structure.official_scale` sea `null`.

- [ ] **Step 1: Failing tests:**
  - `(25, 25, 10)` → 100 % en cada sección, `total_percent: 100`, `official: null`.
  - `(20, 15, 5)` → 80, 60, 50 y `total_percent: 67`, que es `round(40/60·100)`.
  - Con un `official_scale` de prueba `{ per_section_max: 100, pass: 120 }` y `(20, 15, 5)`, `official` sale con el cálculo lineal y `passed: false`. Así se comprueba que cuando llegue la escala se enchufa sin tocar código.
- [ ] **Step 2–4:** implementar → PASS. Commit `feat(exam): resultado por sección`.

### Task 6: Escritura a mano (书写 2), con el componente que reutilizará el Plan 13

**Interfaces:**
- `<CharacterWriting hanzi: string; mode: 'exam' | 'guided' | 'quiz'; onResult(r: { mistakes: number; strokes: number; completed: boolean; recognized: string | null }) />` en `react-native-webview` + Hanzi Writer, con los datos de trazos empaquetados.
- Este plan implementa solo `exam`. `guided` y `quiz` están en el tipo, pero los implementa el Plan 13 (Tarea 2).
- En `mode: 'exam'`: sin contorno, sin pistas y **sin rechazar trazos sobre la marcha**. El alumno dibuja libremente, y al pulsar «Hecho» se compara el conjunto de trazos con el carácter esperado. Acierto = todos los trazos casan, en cualquier orden.

- [ ] **Step 1: Failing tests** (WebView simulada por `postMessage`):
  - `mode: 'exam'` no emite ningún evento hasta «Hecho».
  - Un mensaje `{ type: 'done', matched: true }` → `completed: true`.
  - `matched: false` → `recognized: null` y se cuenta como fallo.
- [ ] **Step 2:** `npx expo install react-native-webview` en `apps/mobile`; implementar → PASS.
- [ ] **Step 3:** Verificar en el simulador iOS que se puede escribir 学 con trazos desordenados y se acepta. Commit `feat(writing): escritura a mano para el examen`.

### Task 7: El examen en el móvil

**Comportamiento fijado:**
- **Antes de empezar**, `useExamDownload` descarga todos los medios. «Empezar» solo se habilita al 100 %.
- **听力 (~17 min):** un único reproductor recorre la línea de tiempo, sin pausar, retroceder ni saltar. La pregunta en pantalla la decide `at_ms`. Al volver de segundo plano, la posición se recalcula por reloj.
- **Hoja de respuestas (3 min):** se pueden cambiar las respuestas de 听力.
- **阅读 (25 min):** navegación libre y cuadrícula de respuestas.
- **书写 (10 min):** W1 con `IncompleteCharacter` + banco; W2 con `HandwriteBlank` (`CharacterWriting` en `exam`).
- Pinyin sobre todo texto impreso; sin traducción ni pinyin al tocar.
- **Resultado:** porcentaje por sección y total, aciertos por parte y la parte más débil. Texto fijo: «El HSK 3.0 aún no ha publicado su escala de puntuación; esto es tu porcentaje de aciertos».
- Practicar una parte suelta (`scope: 'part'`) usa grupos de cualquier forma y no cuenta como forma hecha.

- [ ] **Step 1: Failing tests** (con temporizador falso):
  - En L1, avanzar el reloj hasta `at_ms` de la pregunta 3 la activa sin ningún toque.
  - No hay botón «Pausar» en 听力.
  - Con la descarga al 60 %, «Empezar» está deshabilitado.
  - `ImageTriple` muestra 3 imágenes por pregunta.
  - `BankGroup` en R3 muestra las 6 opciones una vez para las 5 frases, y reusar una opción la quita de la frase anterior.
  - Agotar los 10 minutos de 书写 envía las no respondidas como `null`.
  - `ExamResult` sin escala oficial no contiene «aprobado».
  - `rateCard` no se llama nunca durante el examen.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** En el simulador iOS, la forma A entera: 听力 continua, segundo plano, modo avión tras descargar, 书写 2 a mano y resultado. Commit `feat(exam): simulacro HSK 2 3.0 completo`.

### Task 8: Analítica

- `examReadiness(attempts): { last_percent: number | null; trend: number[]; weakest_part: ExamPartCode | null } | null`. Solo cuenta intentos `full` no repetidos. Sin intentos devuelve `null` (regla del Plan 9).
- [ ] **Step 1: Failing tests:**
  - Sin intentos → `null`.
  - Dos intentos completos → `trend` en orden.
  - Un intento repetido no entra.
  - `weakest_part` es la de menor porcentaje en el último intento.
- [ ] **Step 2–4:** implementar → PASS. Commit `feat(analytics): preparación para el examen`.

### Task 9: Contenido — 3 formas

Una forma por commit, entera (60 preguntas, audio e imágenes), y cada una pasa `npm test`.

- [ ] **Step 1:** Escribir la forma A:
  - 25 + 25 + 10 preguntas con los temas del maestro.
  - Vocabulario hasta HSK 2.
  - Distractores plausibles.
  - W1 con componentes frecuentes (亻, 口, 讠, 女, 日, 木…).
  - W2 con caracteres de escritura de HSK 1–2.
- [ ] **Step 2:** Las 32 imágenes de la forma. Las sencillas, en SVG dibujado a mano y convertido a `.webp`. Las que no salgan bien a mano, con Codex por CLI (`codex`). En el manifiesto, `source: 'svg-propio' | 'codex-generado'`.

  Revisión: alguien que no escribió las preguntas resuelve cada grupo solo con las imágenes. Si duda, la imagen se rehace.
- [ ] **Step 3:** `npm run synthesize-audio -- --exam hsk2/A`. Escuchar 听力 entera a velocidad real.
- [ ] **Step 4:** La revisión por un profesor queda pendiente y se anota.
- [ ] **Step 5:** Commit `content(exam): forma A`. Repetir para B y C.

---

## Criterio de salida

1. `npm test` en verde con 3 formas, 180 preguntas y 0 issues.
2. `get_exam_form(2, null)` no contiene ninguna clave `answer`, y `unsupported` ya no existe.
3. En el simulador iOS, la forma A completa (~60 min):
   - 听力 continua;
   - 书写 2 escrito a mano;
   - resultado en porcentajes;
   - funciona en modo avión tras descargarla.
4. Progreso muestra el último porcentaje y la parte más débil, o nada si no hay intentos.

## Lo que este plan deja sin resolver

- **Escala oficial de puntuación del 3.0.** Se enchufa en `exam-structure.json:official_scale` cuando CTI la publique.
- **Más de 3 formas**, y los otros niveles.
