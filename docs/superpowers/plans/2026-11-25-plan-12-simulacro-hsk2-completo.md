# Plan 12 — Simulacro HSK 2 completo: las 8 partes, con audio, imágenes y puntuación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el simulacro reproduzca el examen HSK 2 entero (4 partes de comprensión auditiva, 4 de lectura, 60 preguntas, tiempos oficiales) con el formato de cada parte, y devuelva una puntuación sobre 200 que se pueda comparar con el aprobado.

**Architecture:** El simulacro deja de construirse con ejercicios de práctica (`generated_exercises`) y pasa a tener **contenido propio de examen**: grupos de preguntas que comparten estímulo (un audio, un banco de 6 palabras, 6 imágenes), escritos como ficheros del repositorio y validados en la build, como lecturas y gramática. Se agrupan en **formas fijas** (A, B, C), igual que un examen real, en vez de sortear preguntas sueltas: un grupo de 5 preguntas con 6 imágenes compartidas no se puede barajar pregunta a pregunta. El audio de comprensión auditiva sale del pipeline de medios y de la síntesis neuronal del Plan 10; las imágenes, del mismo pipeline con manifiesto de licencia.

**Tech Stack:** Node 26, vitest, Jest, TypeScript, Supabase (Postgres + Storage), `expo-audio`, `expo-file-system` (lo añade el Plan 10), `Image` de React Native sobre ficheros locales (no hace falta `expo-image`).

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 6 («Formatos fieles a la muestra oficial; simulacros parciales y completos con tiempo») y `server/db/seeds/exam-structure.json`.

**Depende de:** Plan 10, Tareas 2 (pipeline de medios) y 6 (`sentenceToSsml`, `synthesize-audio`). Independiente del Plan 11.

## Global Constraints

- Estructura de `exam-structure.json`, literal: 听力 25 min (10 + 10 + 10 + 5 = 35 preguntas), 阅读 22 min (5 + 5 + 5 + 10 = 25), 8 min de hoja de respuestas, 55 min en total.
- Puntuación: 听力 sobre 100, 阅读 sobre 100, total sobre 200, aprobado con 120. La conversión es **lineal y estimada** (el examen oficial equipara formas); la pantalla de resultado lo dice.
- El modo Exam del Plan 5B: sin ayudas (sin pinyin al tocar, sin traducción, sin pista), con tiempo, y **no reprograma ninguna tarjeta**.
- Ninguna pregunta entra sin pasar el validador de su parte. Ningún medio entra sin manifiesto válido.
- Prohibido escribir mitigaciones: mientras una parte no tenga contenido, el simulacro completo sigue declarándola en `unsupported`.

## Review Focus

1. **App en segundo plano durante 听力**: el audio del examen no se pausa al volver (en el examen real no se pausa) pero el reloj tampoco se desincroniza; al volver, la pregunta activa es la que corresponde al audio.
2. **Sin red a mitad de examen**: el examen se descarga entero (audio + imágenes) antes de empezar; si la descarga no termina, no se deja empezar.
3. **Pregunta sin responder al acabar el tiempo**: cuenta como fallo, nunca como ausente del denominador.
4. **Repetir la forma A**: se permite, pero el resultado lo marca como repetido y la analítica no lo usa como estimación de nivel.
5. **Imagen correcta repetida en un grupo** (dos preguntas cuya respuesta es la misma imagen): el validador lo rechaza; en el examen cada opción de un grupo se usa una vez.

---

## Estado de partida verificado (25 de noviembre de 2026)

- `build_mock_exam` (`2026090405_exercises_exam_hardening.sql:230-330`) marca como `unsupported` toda la sección `listening` y cualquier parte con `our_type` nulo. Solo sirve 阅读 2 (`fill_blank`) y 阅读 4 (`matching`).
- **Y esas dos tampoco siguen el formato del examen:**
  - 阅读 2 en el examen es un **banco común de 6 palabras** (A–F) para 5 frases; el `fill_blank` de la app da 4 opciones distintas por frase.
  - 阅读 4 en el examen empareja **frases chinas con su respuesta china** (dos grupos de 5); el `matching` de la app empareja hanzi con su traducción al español (`l1-matching-01`: `学生 → estudiante`). Mide vocabulario, no lectura.
- 阅读 3 (`读句子，判断正误`) **no usa imágenes**: es leer un texto y juzgar si la frase marcada con ★ es verdadera. Las partes con imágenes son 听力 1, 听力 2 y 阅读 1.
- El banco de práctica tiene 6 ejercicios por tipo y nivel; aunque el formato fuera correcto, no llega para un examen sin repetir.
- No se guarda ningún intento de simulacro: no hay tabla, ni puntuación, ni métrica en `packages/domain/src/analytics/`.
- `exam-structure.json` viene de **H20901**, la muestra oficial del HSK 2 de 2009. El maestro habla de «HSK 2 3.0». Hay que confirmar si Chinese Testing International ha publicado una muestra del HSK 2 con el formato 3.0 y si cambia la estructura (Tarea 1).

## Formato de cada parte (a confirmar en la Tarea 1 contra la muestra)

| Parte | Estímulo | Respuesta | Grupo |
|---|---|---|---|
| 听力 1 | 1 frase en audio + 1 imagen | ✓ / ✗ | 1 pregunta |
| 听力 2 | diálogo corto en audio | elegir 1 de las imágenes del grupo | 5 preguntas, 6 imágenes |
| 听力 3 | diálogo de 2 turnos + pregunta en audio | A/B/C texto | 1 pregunta |
| 听力 4 | diálogo de 4–5 turnos + pregunta en audio | A/B/C texto | 1 pregunta |
| 阅读 1 | frase escrita | elegir 1 de las imágenes del grupo | 5 preguntas, 6 imágenes |
| 阅读 2 | frase con hueco | elegir 1 palabra del banco | 5 preguntas, 6 palabras |
| 阅读 3 | texto corto + frase ★ | ✓ / ✗ | 1 pregunta |
| 阅读 4 | frase | elegir su respuesta | 5 preguntas, 5 respuestas |

En HSK 2 todo texto impreso lleva pinyin encima; cada audio de 听力 suena **dos veces**.

## File Structure

**Se crean:**
- `packages/domain/src/exam/types.ts` — `ExamPartCode`, `ExamGroup`, `ExamForm`, `ExamAnswer`.
- `packages/domain/src/exam/validate.ts` (+ test) — un validador por parte.
- `packages/domain/src/exam/score.ts` (+ test) — puntuación.
- `packages/domain/src/exam/timeline.ts` (+ test) — línea de tiempo del audio de 听力.
- `server/db/seeds/exam/hsk2/<forma>/<parte>-<nn>.json` — contenido.
- `content/images/exam/hsk2/<forma>/…` + `manifest.json`; `content/audio/exam/hsk2/<forma>/…` + `manifest.json`.
- `scripts/build-exam.js` (+ test).
- `supabase/migrations/2026112503_exam_forms.sql` — `exam_form`, `exam_attempt`, RPC `get_exam_form`, `submit_exam_attempt`.
- `apps/mobile/src/exam/` — `ExamRunner.tsx`, `ListeningSection.tsx`, `ReadingSection.tsx`, una vista por parte (`TrueFalseImage.tsx`, `ImageChoiceGroup.tsx`, `TextChoice.tsx`, `WordBankGroup.tsx`, `ResponseMatchGroup.tsx`), `ExamResult.tsx`, `useExamDownload.ts`; cada uno con test.
- `packages/domain/src/analytics/exam.ts` (+ test).

**Se modifican:**
- `server/db/seeds/exam-structure.json` — forma de grupo por parte.
- `packages/domain/src/media/manifest.ts` (Plan 10) — `ImageManifest`.
- `packages/data/src/repositories/exercises.ts` → se extrae `exam.ts`; `buildMockExam` se elimina.
- `apps/mobile/src/screens/ExercisesScreen.tsx` — el botón «Simulacro» abre `ExamRunner`.

**Se borra:** la RPC `build_mock_exam` y el campo `our_type` de `exam-structure.json`.

---

### Task 1: Confirmar el formato vigente y fijar la forma de los grupos

Tarea de verificación, sin código de producto.

- [ ] **Step 1:** Comprobar en `chinesetest.cn` / `kw.chinesetest.cn` si existe una muestra oficial del HSK 2 con formato 3.0 posterior a H20901. Anotar URL, fecha y estado HTTP en `exam-structure.json:source_note`.
- [ ] **Step 2:** Si existe y cambia la estructura, **parar y reescribir este plan** antes de seguir: todo lo que viene después depende de ella. Si no cambia, seguir.
- [ ] **Step 3:** Transcribir de la muestra, mirando el PDF, por parte: `group_size`, `options_per_group`, cuántas opciones consume el ejemplo, `plays` (veces que suena cada audio), pausas entre preguntas en segundos y el texto de las instrucciones. Añadir esos campos a `exam-structure.json`; eliminar `our_type`.
- [ ] **Step 4:** Test en `scripts/corpus-contract.test.js`: la suma de `question_count` es 35 en 听力 y 25 en 阅读, y cada parte con `group_size > 1` tiene `options_per_group ≥ group_size`. Commit `docs(exam): estructura de grupos transcrita de la muestra`.

### Task 2: Modelo de contenido y validadores por parte

**Files:** `packages/domain/src/exam/types.ts`, `validate.ts`, `validate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ExamPartCode = 'L1' | 'L2' | 'L3' | 'L4' | 'R1' | 'R2' | 'R3' | 'R4';
  export interface ExamLine { speaker: 'F' | 'M'; zh: string; pinyin: string }
  export type ExamGroup =
    | { part: 'L1'; items: Array<{ audio: ExamLine[]; image: string; answer: boolean }> }
    | { part: 'L2' | 'R1'; images: string[]; items: Array<{ audio?: ExamLine[]; text?: { zh: string; pinyin: string }; answer: number }> }
    | { part: 'L3' | 'L4'; items: Array<{ audio: ExamLine[]; question: ExamLine; options: Array<{ zh: string; pinyin: string }>; answer: number }> }
    | { part: 'R2'; bank: Array<{ zh: string; pinyin: string }>; items: Array<{ zh: string; pinyin: string; answer: number }> }
    | { part: 'R3'; items: Array<{ passage: { zh: string; pinyin: string }; claim: { zh: string; pinyin: string }; answer: boolean }> }
    | { part: 'R4'; responses: Array<{ zh: string; pinyin: string }>; items: Array<{ zh: string; pinyin: string; answer: number }> };
  export interface ExamForm { code: string; level: 2; groups: Array<ExamGroup & { slug: string }> }
  export type ExamIssueKind = 'wrong_count' | 'answer_reused' | 'answer_out_of_range' | 'unknown_vocabulary'
    | 'missing_pinyin' | 'blank_missing' | 'answers_unbalanced' | 'image_unknown' | 'audio_too_long' | 'l4_too_short';
  export interface ExamValidationContext {
    dictionary: Array<{ hanzi: string; hsk_level: number }>; // HSK 1–2, el de build-readings
    structure: ExamStructure;                                 // exam-structure.json tras la Tarea 1
    images: Set<string>;                                      // claves de los manifiestos de imagen
  }
  export interface ExamIssue { kind: ExamIssueKind; group?: string; question_index?: number; detail?: string }
  export function validateExamGroup(group: ExamGroup, ctx: ExamValidationContext): ExamIssue[];
  export function validateExamForm(form: ExamForm, ctx: ExamValidationContext): ExamIssue[];
  ```

- [ ] **Step 1: Failing tests**, con valores concretos:
  - R2 con dos frases cuya respuesta es la palabra 3 → `answer_reused`.
  - R2 cuya frase no contiene `（ ）` → `blank_missing`.
  - L2 con 5 preguntas y 5 imágenes cuando la estructura pide 6 → `wrong_count`.
  - L3 con una palabra HSK 3 en el diálogo → `unknown_vocabulary` (mismo diccionario y regla que las lecturas, hasta nivel 2).
  - L4 con 2 turnos → `l4_too_short` (mínimo 4).
  - Forma completa con 8 de 10 respuestas de L1 en `true` → `answers_unbalanced` (umbral: entre 40 % y 60 % de ✓ en L1 y R3; en A/B/C, ninguna letra > 45 %).
  - Forma A con 35 preguntas de 听力 y 25 de 阅读 y todo válido → `[]`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Commit `feat(exam): modelo de contenido y validadores por parte`.

### Task 3: Medios del examen — imágenes y audio de 听力

**Files:**
- Modify: `packages/domain/src/media/manifest.ts`, `scripts/build-media.js`, `scripts/synthesize-audio.js`
- Create: `packages/domain/src/exam/timeline.ts` (+ test)

**Interfaces:**
- Produces:
  ```ts
  export interface ImageManifest { owner: string; images: Array<{ key: string; file: string; depicts_es: string; source: string; license: string }> }
  export function buildListeningTimeline(groups: ExamGroup[], structure: ExamStructure, clipMs: Record<string, number>):
    Array<{ at_ms: number; kind: 'instruction' | 'item'; part: ExamPartCode; question_index: number; clip: string; play: 1 | 2 }>;
  ```
  La línea de tiempo es determinista: instrucciones de parte, cada ítem `plays` veces con la pausa transcrita en la Tarea 1. **Su duración total debe caber en los 25 minutos de 听力**; si no, `build-exam` falla.
- Imágenes: `.webp`, 800 px de lado mayor, ≤ 80 KB. Cada imagen declara qué muestra (`depicts_es`), de dónde sale y su licencia; sin licencia no entra.
- Audio: `synthesize-audio` acepta `--exam hsk2/<forma>`; cada `ExamLine` con la voz de su `speaker` (F → `zh-CN-XiaoxiaoNeural`, M → `zh-CN-YunxiNeural`), y las instrucciones con una tercera voz neutra.

- [ ] **Step 1: Failing tests** de `buildListeningTimeline`: L1 con `plays: 2` produce dos entradas por pregunta con la misma `clip`; la primera entrada de L2 va precedida de la instrucción de L2; una forma cuya línea de tiempo pasa de 1 500 000 ms → lanza.
- [ ] **Step 2: Failing tests** de manifiesto de imágenes: `license: ''` → `license_missing`; imagen > 80 KB → `image_too_large`.
- [ ] **Step 3–4:** implementar → PASS. Commit `feat(exam): medios del examen y línea de tiempo de 听力`.

### Task 4: Build, tablas y RPC

**Files:** `scripts/build-exam.js` (+ test), `supabase/migrations/2026112503_exam_forms.sql`, `scripts/build-supabase-seed.js`, `packages/data/src/repositories/exam.ts` (+ test), `packages/data/src/types.ts`

**Interfaces:**
- Produces:
  - Tabla `exam_form (level int, code text, content jsonb, timeline jsonb, media jsonb, primary key (level, code))`, solo lectura para `authenticated`.
  - Tabla `exam_attempt (id uuid, user_id uuid, level int, form_code text, scope text check (scope in ('part','section','full')), part_code text null, started_at, finished_at, answers jsonb, listening_score int null, reading_score int null, total_score int null, repeated boolean)` con RLS por `user_id`.
  - RPC `get_exam_form(p_level int, p_form text default null)` → la forma pedida o, si es null, la que el usuario aún no ha hecho completa (A, luego B, luego C; después, la más antigua).
  - RPC `submit_exam_attempt(p_attempt jsonb)` → **puntúa en servidor** con las respuestas de `exam_form.content` (el cliente nunca recibe `answer`: `get_exam_form` lo elimina del JSON) y devuelve la fila.
  - `packages/data`: `getExamForm(level, form?)`, `submitExamAttempt(attempt)`, `listExamAttempts(level)`.

- [ ] **Step 1: Failing tests** (`build-exam.test.js`): todas las formas del directorio pasan `validateExamForm`; ninguna pregunta aparece en dos formas (hash de `zh`). Test de migración: `get_exam_form` no devuelve ninguna clave `answer` (consulta sobre `jsonb_path_exists`). Test de repositorio: `submitExamAttempt` envía respuestas por índice de pregunta.
- [ ] **Step 2–4:** implementar → PASS. Eliminar `build_mock_exam`, `buildMockExam` y los tipos `MockExam*`. Commit `feat(exam): formas de examen en servidor, puntuadas en servidor`.

### Task 5: Puntuación

**Files:** `packages/domain/src/exam/score.ts` (+ test). La misma función se porta a SQL en `submit_exam_attempt`; un test compara ambas sobre 3 casos fijos.

**Interfaces:**
- Produces: `scoreExam(correctListening: number, correctReading: number): { listening: number; reading: number; total: number; passed: boolean }`, con `listening = round(100 × aciertos / 35)`, `reading = round(100 × aciertos / 25)`, `passed = total ≥ 120`. Para `scope = 'part' | 'section'` se devuelve el porcentaje de la parte, sin estimación sobre 200.

- [ ] **Step 1: Failing tests:** `(35, 25)` → `{100, 100, 200, true}`; `(21, 15)` → `{60, 60, 120, true}`; `(20, 15)` → `{57, 60, 117, false}`; `(0, 0)` → `{0, 0, 0, false}`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Commit `feat(exam): puntuación sobre 200`.

### Task 6: El examen en el móvil

**Files:** `apps/mobile/src/exam/*`, `apps/mobile/src/screens/ExercisesScreen.tsx` (+ tests), ruta `apps/mobile/app/(app)/practice/exam/[form].tsx`

**Interfaces:**
- Consumes: `getExamForm`, `submitExamAttempt` (Tarea 4), `buildListeningTimeline` (precalculada en `exam_form.timeline`), `useSessionTimer`.
- Comportamiento fijado:
  - **Antes de empezar**, `useExamDownload` descarga todos los medios de la forma; el botón «Empezar» se habilita al 100 %.
  - **听力**: un único reproductor recorre la línea de tiempo; el alumno no puede pausar, retroceder ni saltar; la pregunta en pantalla la decide `at_ms`, no un toque. Al volver de segundo plano se recalcula la posición por reloj.
  - Tras 听力, 3 minutos de hoja de respuestas en los que puede cambiar respuestas de 听力.
  - **阅读**: 22 minutos con navegación libre entre preguntas y una cuadrícula de respuestas.
  - Pinyin visible sobre todo texto impreso (como en el examen HSK 2), sin traducción ni pinyin al tocar.
  - Al acabar o agotarse el tiempo, `submitExamAttempt` y `ExamResult`: puntuación por sección, total, «aprobado/no aprobado», nota de «estimación lineal», y aciertos por parte para ver qué parte arrastra.
  - Practicar una parte suelta (`scope: 'part'`) sirve grupos de cualquier forma y no cuenta como forma hecha.

- [ ] **Step 1: Failing tests** (con temporizador falso):
  - En L1, avanzar el reloj hasta `at_ms` de la pregunta 3 muestra `3` como pregunta activa sin ningún toque.
  - No hay botón de pausa en 听力 (`queryByLabelText('Pausar')` es null).
  - `ExamRunner` con descarga al 60 % muestra «Empezar» deshabilitado.
  - `WordBankGroup` muestra las 6 palabras una sola vez para las 5 frases, y elegir una palabra ya usada la quita de la frase anterior.
  - `ResponseMatchGroup` empareja frase china ↔ respuesta china (ningún texto en español en pantalla).
  - Agotar los 22 minutos de 阅读 llama a `submitExamAttempt` con las no respondidas como `null`.
  - `ExamResult` con `{117, false}` muestra `117 / 200` y «No aprobado».
  - Durante el examen, `rateCard` no se llama nunca (regla del modo Exam).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Verificar en el simulador iOS la forma A completa: audio continuo de 听力, cambio a segundo plano y vuelta, modo avión tras descargar, resultado. Commit `feat(exam): simulacro HSK 2 completo en el móvil`.

### Task 7: Analítica

**Files:** `packages/domain/src/analytics/exam.ts` (+ test), pantalla de progreso.

**Interfaces:**
- Produces: `examReadiness(attempts: ExamAttempt[]): { last_total: number | null; trend: number[]; weakest_part: ExamPartCode | null } | null` — usa solo intentos `full` no repetidos; sin intentos, `null` (regla del Plan 9: ninguna métrica sin datos muestra un cero).

- [ ] **Step 1: Failing tests:** sin intentos → `null`; dos intentos completos → `trend` con dos totales en orden; intento repetido de A no entra; `weakest_part` es la de menor porcentaje en el último intento.
- [ ] **Step 2–4:** implementar → PASS. Commit `feat(analytics): preparación para el examen desde los simulacros`.

### Task 8: Producción de contenido — 3 formas

Contenido, no código. **Una forma por rama de trabajo**, y cada forma entra entera (60 preguntas, audio, imágenes) en un commit que pasa `npm test`.

- [ ] **Step 1:** Escribir la forma A: 35 preguntas de 听力 y 25 de 阅读 con el reparto de temas del maestro, vocabulario y gramática solo HSK 1–2, distractores plausibles (mismo campo semántico, no absurdos).
- [ ] **Step 2:** Producir las ~28 imágenes de la forma (L1 10, L2 12, R1 6): cada una muestra **una** acción u objeto sin ambigüedad, y las imágenes de un mismo grupo son claramente distintas entre sí. Revisión: alguien que no escribió las preguntas responde el grupo solo con las imágenes y la frase; si duda, la imagen se rehace.
- [ ] **Step 3:** `npm run synthesize-audio -- --exam hsk2/A`; escuchar 听力 entera a velocidad real.
- [ ] **Step 4:** Revisión por un profesor de chino con la muestra oficial al lado. Commit `content(exam): forma A`.
- [ ] **Step 5:** Repetir para B y C.

---

## Criterio de salida

1. `npm test` en verde: 3 formas, 180 preguntas, 0 issues; ninguna pregunta repetida entre formas.
2. `get_exam_form(2, null)` devuelve una forma sin ninguna clave `answer` y `unsupported` ya no existe.
3. En el simulador: la forma A se hace de principio a fin (55 min) con audio continuo, imágenes y resultado sobre 200, también en modo avión tras descargarla.
4. La pantalla de progreso muestra la última puntuación y la parte más débil tras un simulacro completo, y nada si no hay ninguno.

## Lo que este plan deja sin resolver

- **Equiparación real de puntuaciones.** Sin datos de calibración, la conversión es lineal y se declara como estimación.
- **Más de 3 formas.** El sistema admite las que se añadan; 3 permiten un primer intento, uno de control y uno final sin repetir preguntas.
- **Otros niveles.** La estructura es por nivel; transcribir HSK 1 y 3 es repetir la Tarea 1.
