# Plan 10 — Lecturas: corpus completo en miniseries y audio grabado por personas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar lo que el Plan 7 dejó a medias: pasar de 10 lecturas sueltas que se leen con la voz del móvil a un corpus HSK 2 de 48 lecturas organizadas en miniseries con continuidad, todas con audio por frase generado en la build con voces neuronales de Microsoft y revisado de oído.

**Architecture:** Se mantiene la decisión del Plan 7: el contenido es fichero del repositorio, se valida en la build y `npm test` falla si algo no cumple. Este plan añade tres cosas sobre esa base: (1) el **validador de catálogo** pasa a exigir series completas, reparto de temas y personajes declarados; (2) un **pipeline de medios** genérico —ficheros de audio con manifiesto, direccionados por hash, subidos a Supabase Storage por CI— que el Plan 12 reutiliza para el simulacro; (3) el lector reproduce **clips por frase** en vez de un fichero único, de modo que el resaltado frase a frase, la velocidad y el offline del Plan 8 siguen funcionando con audio humano.

**Tech Stack:** Node 26 (`.nvmrc`), vitest (`packages/*`, `scripts/`), Jest (`apps/mobile`), TypeScript, Supabase (Postgres + Storage), `expo-audio`, GitHub Actions (`supabase-deploy.yml`).

**Spec:** `docs/PLAN_MAESTRO_HSK2_3_0.md` §Plan 7 y `docs/superpowers/plans/2026-09-02-plan-7-corpus-de-lecturas.md`.

## Global Constraints

- Objetivo del maestro, literal: «10 lecturas HSK 2 impecables antes de las 60. Objetivo 40–60, en miniseries con continuidad narrativa.» Este plan fija **48**.
- Temas del maestro, literales: vida diaria, estudio, trabajo, eventos, lugares, compras, salud, ocio, comunicación interpersonal. Los nueve deben aparecer.
- **Cambio de decisión del maestro (25 de noviembre de 2026).** El maestro decía «Audio humano para el corpus principal; TTS solo para prototipos». Se sustituye por: **audio neuronal generado en la build** (Azure AI Speech, voces `zh-CN-*Neural`), con la pronunciación de cada polífono forzada desde el pinyin de la propia lectura, y revisión de oído antes del commit. El TTS del dispositivo (`expo-speech`) deja de usarse para lecturas. Al cerrar el plan, **0 lecturas** con `audio_kind = 'tts'`. Se actualiza el maestro en la Tarea 6.
- El esquema admite también `audio_kind = 'human'`: si algún día se graba una serie, entra por el mismo pipeline sin tocar código.
- Ninguna lectura entra sin pasar `validateReading`. Un validador con excepciones no es un validador.
- `apps/web` y `server/{app.js,routes,services}` siguen congelados.
- Prohibido escribir mitigaciones.
- `npm test` en verde al final de cada tarea.

## Desviación de audio (decidida por el usuario, 25 de noviembre de 2026)

No hay suscripción de Azure. Mientras no la haya, el audio se genera con **edge-tts** y es **provisional**:

- Los clips se generan con el paquete Python `edge-tts` (`uvx edge-tts`). Voces mandarín disponibles en edge: `zh-CN-XiaoxiaoNeural`, `zh-CN-XiaoyiNeural` (mujer), `zh-CN-YunxiNeural`, `zh-CN-YunjianNeural`, `zh-CN-YunyangNeural` (hombre). Cada personaje declara `voice` y cada serie `narrator_voice` en `reading-series.json`. Con solo dos voces de mujer, 奶奶 comparte la de 妈妈 en la serie `casa`; con Azure se le asigna una voz propia.
- `synthesize-audio.js` acepta `--provider edge|azure` (obligatorio). `azure` se implementa tal y como describe la Tarea 6, pero sin clave: solo lo cubren tests con cliente falso.
- Manifiesto de los clips de edge: `kind: 'neural'`, `produced_by: 'edge-tts:<voz>[+<voz>…]'`, `license: 'provisional: edge-tts, no apto para publicar'`, `provisional: true`. `provisionalOwners()` (`scripts/lib/media.js`, con test) lista las lecturas provisionales y `npm run build-media` las imprime; antes de publicar la app hay que regenerarlas con `--provider azure` (cambiar de proveedor regenera todos los clips).
- edge-tts no acepta `<phoneme>`. `sentenceToSsml` se implementa y se testea igual (lo usa Azure). Con edge, `synthesize-audio` escribe en `content/audio/POLIFONOS.md` cada frase con polífonos, para revisarla de oído.
- La conversión a `.m4a` usa ffmpeg (instalado). Si faltara, se usaría `.mp3` declarándolo en el manifiesto.
- La alineación hanzi ↔ pinyin de `sentenceToSsml` no usa tablas de sílabas: recorre los tokens del tokenizador de dominio y prueba como prefijo del pinyin normalizado la lectura de cada entrada del diccionario; los hanzi sueltos y los nombres sin entrada usan las lecturas de `pinyin-pro` (devDependency). Un hanzi es polífono si las entradas del diccionario lo leen de más de una forma (sin contar el tono).
- La revisión humana (nativo o profesor) de las lecturas y del audio queda **pendiente**: la sesión que ejecuta el plan no puede hacerla y lo anota en cada commit de contenido.

## Review Focus

1. **Frase sin clip o clip sin frase** tras editar el texto de una lectura ya grabada: la build debe fallar y nombrar la lectura y el índice; nunca reproducir el audio de otra frase.
2. **Sin red con una lectura descargada**: los clips deben sonar desde caché; si un clip no se descargó, el lector lo dice para esa frase en vez de saltar en silencio a TTS.
3. **Velocidad 0.75x/1.25x con audio humano**: el tono no cambia (pitch correction) y el resaltado sigue a la frase que suena.
4. **Episodio suelto de una serie** (p. ej. solo el 3 de 5): la build falla; una serie con huecos rompe la continuidad que el maestro pide.
5. **Clip mudo o truncado** (duración absurda frente a la longitud de la frase): el validador lo rechaza por ratio duración/caracteres.
6. **Polífono mal leído** (行 háng/xíng, 了 le/liǎo, 得 de/děi, 觉 jué/jiào, 长 cháng/zhǎng): la voz debe decir lo que dice el campo `pinyin` de la frase. Por eso el SSML fuerza `<phoneme>` en todo token con más de una lectura en el diccionario, y un test lo comprueba con 银行 y 觉得.
7. **Texto editado tras generar el audio**: el manifiesto guarda el hash del `zh` + `pinyin` de cada frase; si cambia, la build falla con `clip_stale` en vez de servir el audio viejo.

---

## Estado de partida verificado (25 de noviembre de 2026)

- `server/db/seeds/readings/` tiene **10 lecturas, todas HSK 2**. Formatos: 4 `short_text`, 4 `dialogue`, 2 `story`.
- Series: `tienda` (3 lecturas) y `escuela` (2); las otras 5 tienen `series: null`. Ninguna serie declara personajes ni episodios previstos.
- Temas cubiertos: vida diaria, compras, estudio, salud, lugares, ocio. **Faltan trabajo, eventos y comunicación interpersonal.**
- `reading_catalog` ya tiene `audio_kind ('tts'|'human')` y `audio_url` (`2026090209_reading_catalog.sql:17-18`), pero **un solo `audio_url` por lectura**.
- `ReadingDetailScreen.tsx:205-222`: con `tts` reproduce frase a frase con velocidad; con `human` cae en `<AudioButton audioUrl>` y reproduce **un fichero entero sin resaltado ni velocidad**. Es decir, grabar el audio hoy empeoraría el lector.
- No hay bucket de Storage ni ningún paso de CI que suba medios.

## Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Nº de lecturas | 48 = 10 existentes + 38 nuevas | Centro del rango 40–60; múltiplo cómodo de series de 4–6 |
| Estructura | 9 miniseries (una por tema), 4–6 episodios cada una | Cada tema queda cubierto y cada serie tiene continuidad |
| Unidad de audio | **Un clip por frase** | Mantiene la sincronización exacta por construcción del Plan 8 y permite regrabar una frase sin tocar el resto |
| Dónde viven los binarios | `content/audio/` en el repo; Storage como CDN | El repo sigue siendo la fuente de verdad; ~25 KB por clip × ~400 clips ≈ 10 MB, asumible sin LFS |
| Nombre en Storage | `media/<sha256>.<ext>` | Inmutable y cacheable para siempre; regrabar = nuevo hash, sin invalidaciones |
| Quién pone la voz | **Azure AI Speech** (servicio oficial), `zh-CN-XiaoxiaoNeural` (F1) y `zh-CN-YunxiNeural` (M1); más voces de la misma familia si una serie tiene más de dos personajes que hablan | Mismas voces que Edge «Leer en voz alta», pero con licencia para usarlas en una app publicada y con SSML `<phoneme>`, que el endpoint no oficial de Edge (`edge-tts`) ya no acepta. Todo el corpus son ~10 000 caracteres: cabe en la capa gratuita |
| Cuándo se genera | En local, con `AZURE_SPEECH_KEY` en `.env.hanyu.local`; los `.m4a` se commitean | La CI no necesita la clave y la build es reproducible sin red |

## File Structure

**Se crean:**
- `packages/domain/src/reading/series.ts` (+ `.test.ts`) — validación de catálogo: series completas, personajes, reparto de temas.
- `packages/domain/src/media/manifest.ts` (+ `.test.ts`) — tipo y validación de manifiestos de audio, común a lecturas y examen.
- `server/db/seeds/reading-series.json` — declaración de las 9 series.
- `server/db/seeds/readings/*.json` — 38 lecturas nuevas.
- `content/audio/readings/<slug>/<nn>.m4a` — clips; `content/audio/readings/<slug>/manifest.json`.
- `scripts/build-media.js` (+ `.test.js`) — valida manifiestos, calcula hashes, emite `media-index.json`.
- `scripts/sync-media.js` — sube a Storage lo que falte (idempotente por hash).
- `supabase/migrations/2026112501_media_storage.sql` — bucket `media` de lectura pública + columna `sentence_audio`.
- `apps/mobile/src/readings/useSentencePlayer.ts` (+ `.test.ts`) — reproductor frase a frase con dos fuentes (TTS o clip).

**Se modifican:**
- `packages/domain/src/reading/validate.ts` — nuevos `IssueKind`.
- `scripts/build-readings.js`, `scripts/build-supabase-seed.js` — integran series y audio.
- `packages/data/src/repositories/readings.ts`, `packages/data/src/types.ts` — `sentence_audio`.
- `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `apps/mobile/src/offline/readingCache.ts`.
- `.github/workflows/supabase-deploy.yml` — paso `sync-media` antes del seed.
- Las 10 lecturas existentes — se asignan a series y se reescriben donde haga falta para encajar.

---

### Task 1: Las series se declaran y se validan

**Files:**
- Create: `packages/domain/src/reading/series.ts`, `packages/domain/src/reading/series.test.ts`, `server/db/seeds/reading-series.json`
- Modify: `scripts/build-readings.js`, `scripts/build-readings.test.js`

**Interfaces:**
- Produces:
  ```ts
  export interface SeriesDeclaration {
    code: string;            // 'tienda', 'escuela', ...
    title: string;           // título en chino
    topic: ReadingTopic;     // uno de los 9 temas
    characters: Array<{ name: string; role_es: string }>;
    planned_episodes: number; // 4..6
  }
  export type ReadingTopic = 'vida diaria' | 'estudio' | 'trabajo' | 'eventos' | 'lugares'
    | 'compras' | 'salud' | 'ocio' | 'comunicación interpersonal';
  export type CatalogIssueKind = 'series_gap' | 'series_unknown' | 'series_overfull'
    | 'topic_mismatch' | 'topic_missing' | 'orphan_reading' | 'character_absent';
  export function validateCatalogShape(
    readings: Array<Pick<ReadingSource, 'slug' | 'topic' | 'sentences'> & { series: string | null; series_index: number | null }>,
    series: SeriesDeclaration[],
  ): Array<{ kind: CatalogIssueKind; detail: string }>;
  ```

- [ ] **Step 1: Write the failing tests** en `series.test.ts`:
  - `series_gap`: serie con `planned_episodes: 4` y lecturas con índices `[1, 2, 4]` → un issue `series_gap` con detail que contiene `3`.
  - `orphan_reading`: lectura HSK 2 con `series: null` → issue. Todas las lecturas pertenecen a una serie.
  - `topic_mismatch`: lectura de la serie `tienda` (topic `compras`) con `topic: 'salud'` → issue.
  - `topic_missing`: declaración sin ninguna serie de `trabajo` → issue con detail `trabajo`.
  - `character_absent`: episodio cuyo texto no contiene el `name` de **ningún** personaje declarado de su serie → issue. (Es la comprobación mínima y determinista de continuidad.)
  - Catálogo válido de dos series completas → `[]`.
- [ ] **Step 2:** `npx vitest run packages/domain/src/reading/series.test.ts` → FAIL (`validateCatalogShape` no existe).
- [ ] **Step 3a:** Los personajes necesitan nombre, y hoy `validateReading` rechaza cualquier hanzi fuera del diccionario (`validate.ts:97-100`), sin excepción para nombres. Añadir `proper_nouns: string[]` a `ValidationContext`; `build-readings.js` le pasa **solo los nombres de los personajes de la serie de esa lectura**. Test: `小林` pasa en un episodio de la serie que lo declara y da `unknown_vocabulary` en otra serie. Los nombres no cuentan para cobertura ni para `target_words`.
- [ ] **Step 3:** Implementar `validateCatalogShape` y escribir `reading-series.json` con las 9 series (una por tema, `planned_episodes` sumando 48). Reasignar las 10 lecturas existentes: `market-*` y `shop-01` → `tienda`; `school-*` → `escuela`; `home-*` → serie de vida diaria; `health-01`, `travel-01`, `leisure-01` → sus series. Renombrar personajes en las existentes donde haga falta para que cumplan `character_absent`.
- [ ] **Step 4:** `build-readings.js` llama a `validateCatalogShape` tras `validateReading`. **El gate de completitud (`series_gap`, `topic_missing`) solo se activa con `--complete`**; antes, las series se van llenando. El resto (`series_unknown`, `topic_mismatch`, `orphan_reading`, `character_absent`) entra ya en el test de catálogo de `build-readings.test.js:46`, que es lo que ejecuta `npm test`. Test adicional: con `--complete` y una serie a medias, exit code 1.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat(readings): series declaradas y validadas en la build`.

### Task 2: Pipeline de medios (compartido con el Plan 12)

**Files:**
- Create: `packages/domain/src/media/manifest.ts` (+ test), `scripts/build-media.js` (+ test), `scripts/sync-media.js`, `supabase/migrations/2026112501_media_storage.sql`
- Modify: `.github/workflows/supabase-deploy.yml`, `package.json` (`"build-media"`, `"sync-media"`)

**Interfaces:**
- Produces:
  ```ts
  export interface AudioClip { key: string; file: string; duration_ms: number; voice: string; source_hash: string }
  export interface AudioManifest { kind: 'neural' | 'human'; owner: string; clips: AudioClip[]; produced_by: string; license: string }
  export type MediaIssueKind = 'file_missing' | 'duration_implausible' | 'kind_unknown' | 'license_missing' | 'duplicate_key';
  export function validateAudioManifest(m: AudioManifest, opts: { expectedKeys: string[]; textByKey: Record<string, string>; sourceHashByKey: Record<string, string> }): Array<{ kind: MediaIssueKind | 'clip_missing' | 'clip_orphan' | 'clip_stale'; key?: string }>;
  ```
  `build-media.js` emite `server/db/seeds/media-index.json`: `{ [owner]: { [key]: { path: 'media/<sha256>.m4a', duration_ms } } }`. Es lo único que consumen el seed (Tarea 3) y el Plan 12.
- Regla de duración (determinista): `duration_ms` entre `180 × nº de caracteres hanzi` y `900 × nº de caracteres + 1500`. Rechaza clips mudos, truncados o de otra frase.

- [ ] **Step 1: Tests** de `validateAudioManifest`: clave esperada sin clip → `clip_missing`; clip sin clave esperada → `clip_orphan`; `source_hash` distinto del sha256 de `zh + '\n' + pinyin` actual → `clip_stale`; `kind: 'tts'` → `kind_unknown`; `license: ''` → `license_missing`; frase de 10 caracteres con 400 ms → `duration_implausible`; manifiesto correcto → `[]`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. La duración se lee del fichero con `music-metadata` (devDependency) en `build-media.js`, no se confía en la del manifiesto: el manifiesto la guarda para el cliente, la build la comprueba.
- [ ] **Step 4:** migración: bucket `media` con `public = true` y política de solo lectura para `anon`; escritura solo `service_role`. Test en `scripts/migrations-contract.test.js`: el bucket existe y `anon` no puede insertar.
- [ ] **Step 5:** `sync-media.js` lista `media/` en Storage y sube los hashes que falten; nunca borra. Paso nuevo en `supabase-deploy.yml` **antes** del seed, con `SUPABASE_SERVICE_ROLE_KEY` del secreto existente. Test de `sync-media` con cliente falso: segunda ejecución sube 0 ficheros.
- [ ] **Step 6:** `npm test` → PASS. Commit `feat(media): pipeline de audio validado, direccionado por hash`.

### Task 3: El catálogo guarda audio por frase

**Files:**
- Create: (en la migración de la Tarea 2) columna `reading_catalog.sentence_audio jsonb not null default '[]'`
- Modify: `packages/domain/src/reading/validate.ts`, `scripts/build-readings.js`, `scripts/build-supabase-seed.js`, `packages/data/src/types.ts`, `packages/data/src/repositories/readings.ts`

**Interfaces:**
- Consumes: `media-index.json` (Tarea 2).
- Produces: `Reading.sentence_audio: Array<{ url: string; duration_ms: number } | null>` (misma longitud que `sentences`; `null` solo si `audio_kind = 'tts'`). `audio_url` se elimina de `Reading` y de la tabla.
- `audio_kind` se **deriva**, no se escribe a mano: el `kind` del manifiesto (`'neural'` o `'human'`) si existe `content/audio/readings/<slug>/manifest.json` y valida; `'tts'` si no. La migración amplía el `check` de `reading_catalog.audio_kind` a `('tts', 'neural', 'human')` y `ReadingAudioKind` en `types.ts`.

- [ ] **Step 1: Tests** (`build-readings.test.js`): lectura con manifiesto `kind: 'neural'` válido → `audio_kind: 'neural'` y `sentence_audio.length === sentences.length`; lectura con 8 frases y 7 clips → la build falla con `clip_missing` y el índice `7`; lectura sin manifiesto → `'tts'` y todos `null`. Test de repositorio: `readings.ts` mapea `sentence_audio` y resuelve `url` con la URL pública del bucket.
- [ ] **Step 2–4:** FAIL → implementar → PASS. `build-supabase-seed.js` deja de escribir `audio_url`.
- [ ] **Step 5:** `npm run gen:types` no se puede ejecutar en local (va por CI); actualizar `database.types.ts` a mano con la columna nueva y anotarlo en el commit. Commit `feat(readings): audio por frase en el catálogo`.

### Task 4: El lector reproduce clips humanos frase a frase

**Files:**
- Create: `apps/mobile/src/readings/useSentencePlayer.ts`, `apps/mobile/src/readings/useSentencePlayer.test.ts`
- Modify: `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `ReadingDetailScreen.test.tsx`, `apps/mobile/src/offline/readingCache.ts`

**Interfaces:**
- Consumes: `Reading.sentence_audio` (Tarea 3), `useSpeech` (existente).
- Produces:
  ```ts
  export function useSentencePlayer(input: {
    sentences: string[];
    clips: Array<{ url: string } | null>;
    rate: 0.75 | 1 | 1.25;
  }): { activeIndex: number | null; playFrom(i: number): void; stop(): void; missingClip: number | null };
  ```
  Si hay clip, usa `createAudioPlayer` de `expo-audio` con `setPlaybackRate(rate, 'high')` (corrige el tono); si no, `useSpeech`. **Una lectura nunca mezcla fuentes**: si la lectura tiene clips y falta uno local estando offline, se para en esa frase y expone `missingClip`.

- [ ] **Step 1: Tests** de `useSentencePlayer` (mock de `expo-audio`): `playFrom(0)` con clips → crea player con la URL de la frase 0, al evento `didJustFinish` avanza a la 1 y `activeIndex === 1`; `rate: 1.25` → `setPlaybackRate(1.25, 'high')`; clip `null` en lectura con clips → `missingClip === i` y no llama a `speak`.
- [ ] **Step 2: Tests** de pantalla: lectura `neural` muestra `Reproducir` y los tres botones de velocidad (hoy una lectura con audio no los muestra) y la nota `Voz neuronal`; lectura `human` no muestra nota; lectura `tts` sigue mostrando `Voz sintética`.
- [ ] **Step 3:** FAIL → implementar → PASS. Eliminar la rama `<AudioButton audioUrl>` de `ReadingDetailScreen.tsx:222`.
- [ ] **Step 4:** `expo-file-system` no está instalado: `cd apps/mobile && npx expo install expo-file-system` (versión alineada con Expo 57). `readingCache` descarga los clips con él al guardar una lectura offline y reescribe `url` a la ruta local. Test: lectura cacheada devuelve URLs `file://`.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat(reader): audio humano frase a frase con velocidad y offline`.

### Task 5: Producción editorial — 38 lecturas nuevas

Tarea de contenido, no de código. Se ejecuta **por serie**, un commit por serie, y cada commit debe pasar `npm test`.

**Files:** `server/db/seeds/readings/<serie>-<nn>-<slug>.json`

- [ ] **Step 1:** Para cada serie, escribir los episodios que faltan hasta `planned_episodes`, respetando: personajes declarados, un hilo que avance entre episodios (lo que pasa en el 2 se menciona o se resuelve en el 3), longitud HSK 2 (80–220 caracteres, `validate.ts:LENGTH`), 3 preguntas con evidencia y respuestas repartidas, `target_words` y `target_grammar` de HSK 2.
- [ ] **Step 2:** Reparto de formatos en el total de 48: al menos 14 `dialogue`, 14 `short_text`, 14 `story`. Test en `series.test.ts`: `format_unbalanced` si algún formato < 25 %.
- [ ] **Step 3:** Cobertura: `npm run coverage` debe informar que los 48 textos juntos usan ≥ 85 % de las palabras HSK 2 del corpus y ≥ 70 % de los puntos gramaticales HSK 2 como `target_grammar` o presentes. Si no llega, se ajustan episodios, no el umbral.
- [ ] **Step 4:** Revisión humana de un hablante nativo por serie antes del commit (naturalidad, no solo validez). Se anota en el mensaje de commit quién revisó.
- [ ] **Step 5:** Commit por serie: `content(readings): serie <code> completa (<n> episodios)`.

### Task 6: Síntesis del audio y cierre

**Files:**
- Create: `scripts/synthesize-audio.js` (+ `.test.js`), `scripts/lib/ssml.js` (+ `.test.js`)
- Modify: `server/db/seeds/reading-series.json` (cada personaje declara `voice`), `package.json` (`"synthesize-audio"`)

**Interfaces:**
- Produces:
  ```js
  // scripts/lib/ssml.js
  export function sentenceToSsml(sentence: { zh: string; pinyin: string }, voice: string,
    dictionary: Array<{ hanzi: string; pinyin: string }>): string;
  ```
  Para cada token (tokenizador de dominio) cuya forma tiene **más de una lectura** en el diccionario, alinea la sílaba del campo `pinyin` de la frase y emite `<phoneme alphabet="sapi" ph="…">`. Si no puede alinear un polífono, lanza: mejor que la build falle a que la voz adivine.
- `synthesize-audio.js <slug|--all> [--force]` llama a la API REST de Azure Speech (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` desde `.env.hanyu.local`), formato `audio-24khz-48kbitrate-mono-mp3` convertido a `.m4a`, y escribe clips + `manifest.json` (`kind: 'neural'`, `produced_by: 'azure:<voice>'`, `license: 'Azure AI Speech, uso comercial según contrato'`, `source_hash`). Sin `--force` solo regenera clips ausentes o `clip_stale`.
- La voz de cada frase: en `dialogue`, la del personaje que habla (prefijo `名字：` en `zh`); en `short_text` y `story`, la voz narradora de la serie.

- [ ] **Step 1: Failing tests** de `sentenceToSsml`: `我在银行工作。` con pinyin `Wǒ zài yínháng gōngzuò.` → contiene `ph="hang 2"`; `我觉得很好。` → `ph="jue 2"`; frase sin polífonos → sin `<phoneme>`; pinyin con una sílaba menos de la necesaria → lanza.
- [ ] **Step 2: Failing tests** de `synthesize-audio` con cliente HTTP falso: segunda ejecución sin cambios hace 0 llamadas; cambiar el `pinyin` de una frase regenera solo ese clip.
- [ ] **Step 3:** implementar → PASS. Commit `feat(audio): síntesis neuronal reproducible con polífonos forzados`.
- [ ] **Step 4:** `npm run synthesize-audio -- --all` (≈ 400 clips). Escuchar cada serie completa; cualquier frase que suene mal se corrige ajustando el `pinyin` o reescribiendo la frase, nunca editando el audio a mano.
- [ ] **Step 3:** Añadir a `build-readings.test.js` el test «el catálogo está completo»: sin issues con `--complete` y ninguna lectura con `audio_kind = 'tts'`. Desde aquí `npm test` lo exige.
- [ ] **Step 4:** Verificar en dispositivo (simulador iOS) una lectura de diálogo: dos voces, resaltado sincronizado, 0.75x sin cambio de tono, modo avión con la lectura descargada.
- [ ] **Step 5:** Commit `content(audio): 48 lecturas con audio neuronal`. Actualizar el maestro: estado del Plan 7 y la regla de audio («neuronal generado en la build, revisado de oído»).

---

## Criterio de salida

1. `npm test` en verde con `--complete`: 48 lecturas HSK 2, 9 series sin huecos, 9 temas, 0 `tts`.
2. `npm run coverage`: ≥ 85 % del vocabulario HSK 2 y ≥ 70 % de la gramática HSK 2 cubiertos por el corpus.
3. En el simulador: una lectura con audio neuronal suena frase a frase, cambia de velocidad sin cambiar de tono y funciona sin red tras descargarla.
4. Storage contiene exactamente los hashes de `media-index.json` (verificado por `sync-media --dry-run` → 0 pendientes).

## Lo que este plan deja sin resolver

- **Lecturas HSK 1 y 3.** El maestro solo pide HSK 2; el validador ya las soporta.
- **Karaoke por palabra.** Seguiría necesitando marcas de tiempo por palabra; la decisión del Plan 8 (resaltar la frase) se mantiene.
