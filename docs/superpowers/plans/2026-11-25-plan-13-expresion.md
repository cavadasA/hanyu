# Plan 13 — Expresión: pronunciación, escritura de caracteres y tareas comunicativas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar lo que el Plan 6 dejó declarado como ausente: que el alumno pueda **pronunciar**, **escribir caracteres a mano** y **resolver tareas comunicativas**, y que cada una sea una habilidad con su propio estado de memoria.

**Architecture:** Tres subsistemas independientes que comparten una sola pieza: dos habilidades nuevas en `learning_skill` (`pronunciation`, `writing`), para que FSRS las programe como las otras cinco. La escritura funciona entera en el dispositivo, sin red. La pronunciación tiene dos niveles: (1) **inteligibilidad**, con el reconocedor de voz del sistema y comparando en pinyin con tonos, que funciona ya; (2) **puntuación fina de tonos**, con Azure Pronunciation Assessment detrás de una Edge Function, que se enciende cuando exista la suscripción. Las tareas comunicativas se corrigen en dos capas: **reglas deterministas validadas en la build** (vocabulario de nivel, marcadores gramaticales del Plan 11, longitud) y **un evaluador LLM** solo para lo que las reglas no pueden juzgar (si la respuesta cumple la intención comunicativa).

**Tech Stack:** Expo 57, `react-native-webview` + Hanzi Writer, `hanzi-writer-data`, `expo-speech-recognition`, `pinyin-pro`, Supabase Edge Functions (Deno), Claude Haiku 5.5 (`claude-haiku-5-5`) para el evaluador.

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 6: «Speaking, pronunciación, escritura de caracteres y tareas comunicativas». Plan 6, «Lo que este plan deja explícitamente sin resolver».

**Depende de:** Plan 11 (marcadores gramaticales) para la Tarea 5, y Plan 12 (Tarea 6: `CharacterWriting`) para la Tarea 2. La Tarea 1 (lista 手写) la consume el validador del Plan 12, que mientras tanto usa los caracteres de HSK 1. Conviene empezarlo cuando terminen los Planes 10 y 12, porque toca `ExerciseRenderer` y la sesión.

## Global Constraints

- Regla del Plan 6, que se mantiene: **un ejercicio que no se puede aprobar es peor que no tenerlo.** Ningún ejercicio se ofrece si su evaluador no está disponible en ese dispositivo. Por ejemplo, Android sin servicio de reconocimiento → no hay ejercicios de pronunciación, y la app lo dice.
- La escritura y la inteligibilidad funcionan **sin red**. El evaluador de tonos y el de tareas comunicativas necesitan red, y lo declaran.
- La puntuación de la inteligibilidad **no se presenta como evaluación de tonos**: el modelo de lenguaje del reconocedor corrige tonos mal dichos en palabras frecuentes. La pantalla dice «se te entendió» / «no se te entendió», no «tono correcto».
- Ninguna clave de proveedor en el cliente: Azure y Anthropic solo desde Edge Functions.
- Prohibido escribir mitigaciones. `npm test` en verde al final de cada tarea.

## Review Focus

1. **Permiso de micrófono denegado**: la pronunciación desaparece de la cola con una explicación y un enlace a Ajustes. No es un fallo del alumno ni se cuenta como error en FSRS.
2. **Homófonos** (是/事, 他/她/它): el reconocedor devuelve otro hanzi con la misma sílaba y el mismo tono. Debe contar como acierto, porque se compara en pinyin con tonos, no en hanzi.
3. **Trazo fuera de orden en un carácter de un solo trazo** (一, 乙): Hanzi Writer no tiene orden que validar; acierto si la forma coincide.
4. **El evaluador LLM no responde o devuelve JSON inválido**: la tarea queda «sin corregir» y no se registra ningún evento de aprendizaje. Nunca se inventa una nota.
5. **Respuesta comunicativa en pinyin o en español**: las reglas deterministas la rechazan antes de llamar al LLM, con el motivo concreto.

---

## Estado de partida verificado (25 de noviembre de 2026)

- `learning_skill` = `recognition, recall, listening, reading, production` (`2026090203_progress_model.sql:9-15`). `production` está comentado como «escribir o hablar; todavía sin generador».
- `hsk-characters.json`: 655 caracteres (HSK 1: 246, HSK 2: 125, HSK 3: 284). **No distingue los caracteres de lectura (认读) de los de escritura (手写)**, y el sílabo 3.0 sí lo hace.
- No hay ningún reconocedor de voz instalado. `react-native-webview` y `CharacterWriting` llegan con el Plan 12.
- El HSK 2 3.0 **sí evalúa escritura**: la sección 书写 tiene 10 preguntas (componentes y escribir un carácter a mano). Lo cubre el Plan 12.
- `expo-audio` sí está instalado: sirve para grabar (Tarea 3).
- No hay ninguna Edge Function de IA: el Plan 7 eliminó el proveedor en runtime.

## Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Escritura | Hanzi Writer (MIT) en `react-native-webview`, con datos de `hanzi-writer-data` (licencia Arphic) empaquetados solo para los caracteres de escritura HSK 1–3 | Es la librería de referencia para escribir con validación de orden de trazos; reimplementarla en `react-native-svg` es un subsistema entero |
| Qué caracteres se escriben | La lista oficial 手写 del sílabo 3.0, transcrita a mano | Pedir escribir los 655 contradice el sílabo |
| Pronunciación, nivel 1 | `expo-speech-recognition`, `zh-CN`, en el dispositivo si está disponible; transcripción → pinyin con `pinyin-pro` → comparación por sílaba con tono | Funciona sin cuenta y sin red en iOS; deja claro qué mide |
| Pronunciación, nivel 2 | Azure Pronunciation Assessment (`zh-CN`) desde una Edge Function | Puntúa sílaba a sílaba. Se implementa y se testea con un cliente falso, y se activa con la variable `AZURE_SPEECH_KEY` en Supabase |
| Tareas comunicativas | Reglas en la build + Claude Haiku 5.5 desde una Edge Function, con rúbrica fija y salida JSON | Las reglas no pueden juzgar la intención; el LLM sí, y solo se le pide eso |

**Decisión que este plan reabre:** el Plan 7 eliminó todo proveedor de IA en runtime. Este plan vuelve a introducir uno, pero acotado: solo **evalúa** respuestas del alumno, nunca genera contenido. Si se rechaza, la Tarea 5 se queda en reglas deterministas y las tareas pasan a ser de producción guiada (el alumno completa una plantilla), no libres.

## File Structure

**Se crean:**
- `supabase/migrations/2026112601_expression_skills.sql` — `pronunciation`, `writing` en `learning_skill`; columna `hsk_characters.handwriting boolean`.
- `apps/mobile/src/expression/CharacterWriting.tsx` (+ test), `apps/mobile/assets/hanzi-writer/` (HTML + datos).
- `apps/mobile/src/expression/useSpeechCheck.ts` (+ test), `packages/domain/src/expression/compare-pinyin.ts` (+ test).
- `apps/mobile/src/expression/PronunciationExercise.tsx` (+ test).
- `supabase/functions/pronunciation-assess/index.ts` (+ test).
- `server/db/seeds/communicative/*.json`, `packages/domain/src/expression/validate-task.ts` (+ test), `packages/domain/src/expression/check-answer.ts` (+ test).
- `supabase/functions/grade-communicative/index.ts` (+ test).
- `apps/mobile/src/expression/CommunicativeTask.tsx` (+ test).

**Se modifican:** `packages/domain/src/exercises/contract.ts` (`ExerciseKind` + `writing`, `pronunciation`, `communicative`), `packages/domain/src/analytics/mastery.ts:27` (`SKILLS`), `apps/mobile/src/exercises/ExerciseRenderer.tsx`, el planificador de la cola (5B), `server/db/seeds/hsk-characters.json`.

---

### Task 1: Dos habilidades nuevas, y los caracteres de escritura

**Interfaces:**
- Produces: `LearningSkill` incluye `'pronunciation' | 'writing'`; `HskCharacter.handwriting: boolean`.
- `writing` solo existe para `target_kind = 'character'` con `handwriting = true`. `pronunciation` existe para `word` y frases de lectura.

- [ ] **Step 1:** Transcribir de la lista 手写 del sílabo oficial (el PDF que ya bajó el Plan 1B, a mano, como hizo con la gramática) el campo `handwriting` de cada carácter HSK 1–3. Test en `corpus-contract.test.js`: el recuento por nivel coincide con el que da el sílabo, anotado como constante con la página de origen.
- [ ] **Step 2: Failing tests:** `mastery.ts` reporta 7 habilidades; el planificador no crea estado `writing` para un carácter con `handwriting = false`.
- [ ] **Step 3:** Migración (`alter type … add value`) e implementación → PASS. Commit `feat(skills): pronunciación y escritura como habilidades`.

### Task 2: Escritura de caracteres

**Interfaces:**
- Consumes: `apps/mobile/src/expression/CharacterWriting.tsx`, que **ya crea el Plan 12** (Tarea 6) con `mode: 'exam'`, `react-native-webview` y los datos de trazos. Esta tarea no lo reimplementa: le añade dos modos.
- Produces: los modos `guided` y `quiz` de `CharacterWriting`. `guided` muestra el contorno y anima el orden de trazos. `quiz` no muestra nada hasta el tercer error en un trazo y valida el orden, a diferencia de `exam`.
- Nota FSRS: `quiz` con 0 errores → Good; 1–2 → Hard; ≥ 3 o con pistas → Again. `guided` nunca registra evento (es enseñanza, no evaluación).
- Los datos de trazos van empaquetados (unos 2 KB por carácter) y no se piden a ningún CDN.

- [ ] **Step 1: Failing tests** (WebView simulada por `postMessage`): un mensaje `{ type: 'complete', mistakes: 0 }` llama a `onResult` con `completed: true`; `mode: 'guided'` no emite ningún evento de aprendizaje; un carácter sin datos de trazos no se renderiza y lo registra como error de contenido.
- [ ] **Step 2: Test de build:** todos los caracteres con `handwriting = true` tienen fichero en `assets/hanzi-writer/data/`.
- [ ] **Step 3:** Implementar los dos modos → PASS. `react-native-webview` ya lo instaló el Plan 12.
- [ ] **Step 4:** Verificar en el simulador iOS: escribir 学 en modo quiz, con un trazo fuera de orden. Commit `feat(writing): escritura de caracteres con orden de trazos`.

### Task 3: Pronunciación, nivel 1 — inteligibilidad

**Interfaces:**
- Produces:
  ```ts
  export function comparePinyin(expected: string, heard: string): {
    syllables: Array<{ expected: string; heard: string | null; ok: boolean }>;
    intelligible: boolean; // ≥ 80 % de sílabas con tono correcto, y todas las sílabas tónicas de la palabra objetivo
  };
  export function useSpeechCheck(): { available: boolean; listen(target: { hanzi: string; pinyin: string }): Promise<ReturnType<typeof comparePinyin>> };
  ```
  `heard` = transcripción del reconocedor convertida a pinyin con tonos (`pinyin-pro`, modo `num`). El tono neutro (`5`) se acepta en sílabas que el diccionario marca como neutras.

- [ ] **Step 1: Failing tests** de `comparePinyin`: `('shi4', 'shi4')` desde 事 → ok (homófono); `('ma3', 'ma1')` → no ok; `('xue2 sheng5', 'xue2 sheng1')` → ok (neutro tolerado); frase de 5 sílabas con 4 bien → `intelligible: true`; con 3 → `false`.
- [ ] **Step 2: Failing tests** de `useSpeechCheck` con el módulo simulado: `available: false` sin permiso o sin reconocedor `zh-CN`; con transcripción `我是学生` y objetivo `wǒ shì xuésheng` → `intelligible: true`.
- [ ] **Step 3:** `PronunciationExercise`: escucha el modelo (clip del Plan 10 si existe; TTS si no), graba y muestra sílaba a sílaba qué se entendió. Texto fijo: «Se te entendió» / «No se te entendió». No usar la palabra «tono».
- [ ] **Step 4:** Instalar `expo-speech-recognition` y añadir los textos de permisos al `app.json`; implementar → PASS. Commit `feat(pronunciation): ejercicio de inteligibilidad sin red`.

### Task 4: Pronunciación, nivel 2 — Azure Pronunciation Assessment

**Interfaces:**
- Produces: Edge Function `pronunciation-assess` que recibe `{ audio_base64: string; reference_text: string }`, llama a Azure con `ReferenceText`, `GradingSystem: HundredMark`, `Granularity: Phoneme`, y devuelve `{ accuracy: number; fluency: number; completeness: number; syllables: Array<{ syllable: string; accuracy: number }> }`. Sin `AZURE_SPEECH_KEY` responde `503 { reason: 'not_configured' }`, y el cliente no ofrece el nivel 2.

- [ ] **Step 1: Failing tests** (Deno, `fetch` simulado): sin clave → 503; respuesta de Azure de ejemplo → sílabas mapeadas; audio de más de 15 s → 413.
- [ ] **Step 2:** implementar → PASS. En el cliente, si la función responde 200, `PronunciationExercise` añade la puntuación por sílaba y **solo entonces** habla de tonos. Commit `feat(pronunciation): evaluación fina con Azure (apagada sin clave)`.

### Task 5: Tareas comunicativas

**Formato** (`server/db/seeds/communicative/<nivel>-<nn>.json`):
```json
{
  "slug": "2-03-rechazar-invitacion",
  "hsk_level": 2,
  "situation_es": "Tu compañera te invita al cine el sábado. No puedes: explica por qué y propón otro día.",
  "mode": "write",
  "intent": ["rechazar la invitación", "dar un motivo", "proponer otro día"],
  "required_markers": [{ "hsk_level": 2, "code": "6.4.3" }],
  "min_chars": 15, "max_chars": 60,
  "model_answer": { "zh": "…", "pinyin": "…", "es": "…" }
}
```

**Interfaces:**
- Produces:
  - `validateCommunicativeTask(task, ctx)`: comprueba que `model_answer` pasa sus propias reglas. Un enunciado cuya respuesta modelo no aprueba no entra.
  - `checkAnswerRules(answer: string, task, ctx): { ok: boolean; reasons: Array<'not_chinese' | 'too_short' | 'too_long' | 'unknown_vocabulary' | 'marker_missing'> }`: reutiliza los `markers` del Plan 11 y el diccionario del nivel.
  - Edge Function `grade-communicative`: solo se llama si `checkAnswerRules.ok`. Envía la situación, las intenciones y la respuesta con una rúbrica fija, y exige `{ intents: boolean[]; feedback_es: string }`. Acierto = todas las intenciones cumplidas.
- `mode: 'speak'`: la respuesta pasa antes por el reconocedor de la Tarea 3 y se corrige como texto.

- [ ] **Step 1: Failing tests** de `checkAnswerRules`: `"wo bu neng qu"` → `not_chinese`; respuesta sin ningún marcador de `6.4.3` → `marker_missing`; respuesta con `已经` en una tarea HSK 1 → `unknown_vocabulary`; la `model_answer` de cada fichero → `ok`.
- [ ] **Step 2: Failing tests** de la función, con el modelo simulado: JSON inválido → `{ status: 'ungraded' }` y ningún evento; `intents: [true, true, false]` → fallo, con `feedback_es`; sin `ANTHROPIC_API_KEY` → 503 `not_configured`.
- [ ] **Step 3:** implementar → PASS.
- [ ] **Step 4:** Escribir **24 tareas HSK 2** (dos por tema del maestro, más 6 de las funciones comunicativas del sílabo: saludar, pedir, invitar, rechazar, disculparse, describir). Cada una debe pasar `validateCommunicativeTask`.
- [ ] **Step 5:** Commit `feat(communicative): tareas comunicativas con reglas y evaluador`.

### Task 6: Entrar en la cola

- [ ] **Step 1: Failing tests** del planificador:
  - Con `pronunciation` no disponible en el dispositivo, la cola no incluye ningún ejercicio de pronunciación.
  - `writing` vencido para 学 → aparece `CharacterWriting` en `quiz`.
  - Una tarea comunicativa como mucho por sesión de Learn.
  - El modo Exam no incluye ejercicios de práctica de ninguno de los tres. La escritura que sí evalúa el HSK 2 3.0 (sección 书写) la sirve el simulacro del Plan 12, no la cola.
- [ ] **Step 2:** implementar → PASS. Commit `feat(queue): expresión en la cola diaria`.

---

## Criterio de salida

1. `npm test` en verde; `mastery.ts` muestra 7 habilidades.
2. En el simulador iOS:
   - Escribir 学 en modo quiz registra un evento `writing`.
   - Decir 你好 da «Se te entendió» sin red.
   - Una tarea comunicativa escrita se corrige, o queda «sin corregir» si no hay clave.
3. Sin `AZURE_SPEECH_KEY` ni `ANTHROPIC_API_KEY`, nada se rompe. Las funciones responden `not_configured` y la app no ofrece lo que no puede corregir.

## Lo que este plan deja sin resolver

- **Expresión oral libre** (hablar un minuto sobre un tema). La comprensión de una respuesta larga y espontánea pasa por el reconocedor, y su sesgo se acumula; queda para cuando el nivel 2 de pronunciación lleve un tiempo funcionando.
- **Producción con traducción inversa** (español → chino) como habilidad propia. Hoy la cubre `recall` a nivel de palabra.
