# Plan maestro: cerrar la auditoría del core móvil (HSK 2 3.0)

Documento de referencia: `docs/AUDITORIA_CORE_MOVIL_HSK2_3_0.md`
Contexto de ejecución: **producto sin usuarios, desarrollo continuo de todas las olas en una sola pasada.**
Objetivo: cerrar **todos** los hallazgos de la auditoría, sin excepción.

## Alcance: solo la app móvil

Decidido el 2 de septiembre de 2026. Vale para los doce documentos.

| Área | Estado | Se verifica |
|---|---|---|
| `apps/mobile` | Activa | Sí (Jest) |
| `packages/data`, `packages/domain` | Activas | Sí (typecheck + vitest) |
| `supabase/` (migraciones, funciones, seed) | Activa | Sí |
| `server/db` (corpus + su seeder) | Se conserva: es la fuente del corpus | Sí |
| `apps/web` | **Congelada** | No |
| `server/app.js`, `server/routes`, `server/services` | **Congelados** | No |

Congelada significa que sigue en el repositorio, no se borra y no se toca. `apps/web` no está deprecada —esa decisión no se ha tomado— pero mantener verdes sus diez suites obligaría a arreglarla cada vez que cambia `packages/data`, y ése es el esfuerzo que no queremos gastar. Si un cambio la rompe, se deja rota.

`server/db` es la excepción dentro de `server/`: `server/db/seeds/*.json` es el corpus que alimenta `supabase/seed.sql` y con él la app móvil, así que sus dos suites siguen ejecutándose.

Efecto en la verificación: `npx vitest run` pasa de 41 ficheros y 189 tests a 16 y 71.

**Si algún día se retoma la web**, el arreglo que la hacía cargar bajo Node ≥22 está en el commit `55cf2cf` (`test/setup-web.js`): Node expone un `localStorage` global inerte que impide al entorno jsdom de Vitest 2.1 instalar el suyo, y `apps/web/src/stores/appStore.js` lo lee al importarse. El fichero se eliminó al congelar la web; recuperarlo de ese commit basta.

## Respuesta corta

**10 planes, en secuencia, con dos ramas paralelas.**

El contexto de "sin usuarios y todo seguido" cambia el corte respecto a una ejecución incremental. Elimina toda una categoría de trabajo: las **mitigaciones**. Un producto vivo necesita dejar de mentir hoy aunque la solución real llegue en tres meses; un producto que nadie usa y que se va a reescribir esta semana no. Todo lo que existía solo para tapar un hueco temporal se borra.

Segunda consecuencia, menos obvia: **el orden se invierte**. En ejecución incremental los arreglos de integridad van primero porque hay usuarios sufriéndolos. Aquí van *después* del modelo de datos, porque arreglar el ciclo de review contra un esquema que va a cambiar significa escribirlo dos veces.

---

## Qué se elimina por completo

Trabajo que el plan anterior incluía y que ahora no se hace nunca:

| Se borra | Por qué | Quién lo cubre de verdad |
|---|---|---|
| Renombrar "Generate reading" → "Open reading" | Mitigación pura | Plan 7 implementa generación real validada |
| Ocultar el selector "AI tutor engine" | Mitigación pura | Plan 7 decide: proveedor real conectado, o se elimina el ajuste |
| Arreglar `create_starter_deck` para equilibrar HSK 1/2 | El concepto de "mazo inicial fijo" desaparece | Plan 5: diagnóstico inicial + cola construida por el planificador |
| Límites de cola en cliente (`new_cards_per_day`, `review_limit`) | Se reordena un subconjunto en cliente; el planificador lo hace en servidor | Plan 5 |
| Log de eventos mínimo para soportar Undo | Sería un esquema provisional migrado después | Plan 1: `learning_event` desde el principio |
| Tocar la semántica de SM-2 | FSRS lo sustituye entero | Plan 4 |
| Vertical slice como plan independiente | Su valor era "probar antes de invertir"; la inversión ya está decidida | Criterio de salida del Plan 1 |

Eso son ~6 unidades de trabajo que en el plan incremental existían solo para sobrevivir al intervalo entre olas.

## Qué NO se puede posponer pese a no haber usuarios

Tres cosas que parecen cosméticas y no lo son:

- **Base de verificación (Plan 0).** El comando de tests root no llega a ejecutar Jest móvil, `better-sqlite3` está compilado para otro ABI y el typecheck móvil falla. Sin eso, los 9 planes siguientes se escriben a ciegas. Es el único plan que sí va estrictamente primero.
- **Contrato de evaluación (Plan 2).** No es un bug de UI, es una decisión de diseño que atraviesa cliente y servidor. Cada ejercicio nuevo escrito contra el contrato roto es código que se reescribe.
- **Alcance de niveles 1–3.** No es limpieza de UI: determina cuánto corpus importas en el Plan 1 y cuánto contenido editorial produces en el Plan 7.

---

## Secuencia

```text
Plan 0  Base de verificación
          |
          +--------------------------+
          v                          v
Plan 1  Modelo de conocimiento    Plan 2  Contrato de evaluación
        + syllabus                        (rama paralela, sin
          |                                ficheros compartidos)
          v
Plan 3  Ciclo de review sobre eventos
          |
          +--------------------------+
          v                          v
Plan 4  FSRS multi-habilidad     Plan 7  Corpus de lecturas
          |                              + pipeline validado
          v                          v
Plan 5  Planificador, diagnóstico,  Plan 8  Lector avanzado
        unidades, modos                     |
          |                                 |
          +---------------+-----------------+
                          v
                Plan 6  Ejercicios en unidades + simulacro
                          |
                          v
                Plan 9  Analítica de aprendizaje
```

Dos ramas se pueden llevar en paralelo tras el Plan 3: la de **memoria y scheduling** (4 → 5) y la de **contenido y lectura** (7 → 8). Convergen en el Plan 6.

---

## Plan 0 — Base de verificación
**Tamaño:** S · **Depende de:** nada · **Va estrictamente primero**

- Recompilar `better-sqlite3` para el ABI de Node en uso (causa de la mayoría de los 17 archivos y 59 tests fallando en root, no una regresión real).
- Que el comando root ejecute realmente la suite móvil; hoy `vitest run && npm run test -w @hanyu/mobile` corta antes de llegar a Jest.
- Eliminar el warning `act(async)` no esperado.
- `colors.info` no existe en el tipo del tema (`CardStatusBadge.tsx:12`) → typecheck móvil en verde.

**Salida:** un solo comando ejecuta todo el monorepo, en verde, y su resultado es creíble.
**Cierra:** §13 completo; §10 P0.6.

**Estado: COMPLETADO (2 de septiembre de 2026).** `npm test` ejecuta 5 pasos (3 typechecks + vitest + jest) y los 5 pasan: 41/41 ficheros y 189/189 tests en vitest, 37/37 suites y 173/173 tests en jest, cero warnings de consola. Verificado también el camino rojo: con un fallo inyectado en el primer paso, los otros cuatro siguen ejecutándose y el exit code es 1.

Dos matices frente a lo que decía la auditoría:

- El fallo de `better-sqlite3` era real (binario ABI 127, runtime 147) y `npm rebuild` lo resolvió, pero **no explicaba todos los fallos**. Quedaban 3 ficheros de test web que ni siquiera cargaban: bajo Node ≥22 existe un `localStorage` global inerte que impide al entorno jsdom de Vitest 2.1 instalar el suyo, así que `window.localStorage` quedaba `undefined` y `apps/web/src/stores/appStore.js` reventaba al importarse. Resuelto con `test/setup-web.js`.
- El error de typecheck de `CardStatusBadge` **tapaba un bug de accesibilidad**, no era cosmético. Los dos colores que usaba (`#3b82f6` para `new`, `#10b981` para `mastered`) tienen contraste 3.52 y 2.43 sobre la superficie clara, por debajo del mínimo AA de 4.5 que el propio `tokens.test.ts` exige al resto de la paleta. Se han añadido tokens `info` y `success` a ambos temas, con aserciones de contraste que impiden la regresión.

Añadido además `.nvmrc` con la versión de Node en uso: la deriva de ABI ocurrió por construir el árbol bajo un major y ejecutarlo bajo otro, y había dos binarios de Node en el PATH sin ninguna versión fijada.

**Hueco conocido que este plan no cerró:** `apps/mobile/src/lib/useSessionTimer.test.ts` solo ejercita `reset()`. La función principal del hook, `start()`, y el avance del temporizador por su `setInterval` no tienen ninguna cobertura. Salió al arreglar el warning de `act()` y no entra en el alcance del Plan 0, que era hacer creíble el comando de verificación, no ampliar la suite. Lo recoge el Plan 4, que reescribe la sesión de estudio.

## Plan 1 — Modelo de conocimiento y syllabus oficial
**Tamaño:** XL · **Depende de:** Plan 0 · **Es la raíz de todo lo demás**

> **Se divide en tres documentos ejecutables.** Al escribirlo como plan de implementación se vio que cubre tres subsistemas independientes, cada uno con su propio criterio de salida verificable. Un único documento habría sido imposible de revisar y de revertir por partes.
>
> - **1A — Sentidos léxicos** (`docs/superpowers/plans/2026-09-02-plan-1a-sentidos-lexicos.md`). El corpus deja de ser hanzi+nivel: selección de sentido por lectura, clasificador y forma tradicional, glosas españolas por sentido, idioma de apoyo en la app. No depende de ninguna fuente externa: todo el material ya está en el repositorio.
> - **1B — Sílabo oficial versionado, caracteres, gramática y cobertura** (`docs/superpowers/plans/2026-09-02-plan-1b-silabo-oficial.md`). Escrito. La fuente quedó resuelta: el organismo publica solo un PDF (accesible, 3,7 MB) y un sistema de consulta web, así que la única forma legible por máquina es la transcripción de `krmanik/HSK-3.0`, revisión 2025-11, fijada con sumas SHA-256 en `data/sources.json` y contrastada contra `ivankra/hsk30`. Resuelve las 14 filas que 1A deja en cuarentena, importa los caracteres (246/125/284, hoy inexistentes) y lleva la gramática HSK 2 de 2 puntos a más de 40.
> - **1C — Modelo de progreso** (`docs/superpowers/plans/2026-09-02-plan-1c-modelo-de-progreso.md`). Escrito. `learning_event` append-only, `learner_skill_state` por habilidad, `content_item` + `content_teaches`, `exercise_template` y prerrequisitos de gramática. No crea tabla `competency`: sería una tabla vacía, porque el sílabo describe temas y tareas en prosa dentro del PDF; la taxonomía oficial que sí existe la aporta 1B en `grammar_points.group` y `.category`. Es prerrequisito duro del Plan 3.
>
> Con esta división, los documentos ejecutables pasan de 10 a 12.

- Importar y **versionar** el syllabus oficial HSK 3.0 (nov 2025, vigente jul 2026): vocabulario, caracteres, gramática, temas y tareas. Comparación reproducible contra el corpus comunitario actual.
- Entidades: `competency`, `lexeme_sense`, `grammar_point` (+ prerrequisitos), `content_item`, `exercise_template`, `learner_skill_state`, `learning_event`.
- **Migrar de `hanzi + nivel` a lexema/sentido.** Casos confirmados: `地 dì` con glosa española de partícula adverbial, `还 huán` mezclando "todavía"/"devolver", `长 cháng` y `长 zhǎng` compartiendo traducción.
- Nota de vocabulario completa: simplificado/tradicional, pinyin normalizado, audio, sentidos separados, clasificador, categoría gramatical, colocaciones, dos frases HSK 2, fuente, contextos de encuentro.
- Ampliar gramática HSK 2: hoy hay 6 puntos totales, solo 2 de HSK 2. Cubrir reduplicación verbal y adjetival, `过/着/得/地`, `比`, complementos resultativos y direccionales, `是…的`, `虽然…但是…`, `因为…所以…`, `一…就…`, `还是`, duración/cantidad/aproximación.
- Matrices de cobertura: vocabulario, caracteres, gramática, temas, tareas.
- Fijar el alcance a HSK 1–3 en el tipo compartido, Settings (hoy 1–6), Today (hoy fuerza nivel 2) y pantallas.
- Español como idioma de apoyo de primera clase, con glosas por sentido (no la traducción por Hanzi actual).
- `PRODUCT.md`: perfil objetivo pasa de "HSK 2 completado" a "preparando HSK 2"; consolidación es un estado del usuario, no una suposición global.

**Salida:** el esquema soporta, seeded y consultable de punta a punta, la unidad completa "Comparar lugares y cosas" (`A 比 B + adjetivo`, 12–18 palabras, lectura, ejercicios, tarjetas por habilidad). Si esa unidad no encaja sin forzar el modelo, el modelo está mal y se corrige aquí, no tres planes después.
**Cierra:** Alto 7, Alto 8; §3; §5 corpus y diseño de nota; §6.11; §7 familias gramaticales; §8 modelo mínimo; §10 P1.1–P1.3, P1.5, P1.6; §11 (como validación del esquema).

## Plan 2 — Contrato único de evaluación
**Tamaño:** M · **Depende de:** Plan 0 y la Tarea 1 del Plan 1A · **Paralelo al resto del Plan 1**

> **Escrito:** `docs/superpowers/plans/2026-09-02-plan-2-contrato-de-evaluacion.md`, 6 tareas.
>
> Al aterrizarlo aparecieron tres defectos más de los cuatro que recogía la auditoría: la columna derecha de `matching` se pinta en el mismo orden que la izquierda, así que el ejercicio se resuelve emparejando fila con fila sin leer nada; cada comprobación hace cuatro viajes de red fallidos, porque `checkExercise` prueba la RPC `check_exercise` con tres firmas y luego la Edge Function `check-exercise`, y **ninguna de las dos existe**; y el ejercicio viaja al cliente con `correct` como campo suelto, filtrado por un `...payload`.
>
> Ese último defecto zanja la pregunta de dónde vive la verdad: hoy no hay ninguna autoridad de servidor que proteger. La evaluación pasa a ser local y explícita, en `packages/domain` sin dependencias, lista para ejecutarse en una Edge Function el día que haga falta.

- Contrato discriminado por tipo (`fill_blank | multiple_choice | reorder | dictation | matching`) con forma de respuesta tipada.
- Normalización y evaluación en **un solo módulo** compartido cliente/servidor. `reorder` compara arrays (hoy compara array contra string concatenado); `matching` compara el mapa completo palabra→significado (hoy compara contra el literal `'matched'`).
- `matching` no comprobable hasta asignar todas las parejas; hoy cualquier objeto no vacío cuenta como respuesta.
- `dictation`: normalizar tonos numéricos, pinyin sin marcas, espacios, mayúsculas y puntuación.
- Decidir dónde vive la verdad: cliente, RPC `check_exercise`, o ambos sobre el mismo módulo. Hoy no existe ni RPC ni Edge Function, así que el fallback local es la ruta real.
- Tests de contrato a través del repositorio: correcta, incorrecta, parcial, equivalente.

**Salida:** ninguna respuesta correcta se marca incorrecta en ningún tipo, verificado por suite.
**Cierra:** Crítico 3; §7 dictation; §13 cobertura de scoring.

## Plan 3 — Ciclo de review sobre eventos
**Tamaño:** L · **Depende de:** Plan 1C

> **Escrito:** `docs/superpowers/plans/2026-09-02-plan-3-ciclo-de-review.md`, 6 tareas.
>
> La decisión central es que Undo tiene dos mitades. Si el evento sigue en la cola local sin sincronizar, deshacer es sacarlo de la cola y reproyectar la tarjeta: la maquinaria ya existe en `ReviewStore.replayPendingOnto`, no hace falta red y el servidor nunca lo vio. Si ya se sincronizó, hay que revertirlo en servidor.
>
> La reversión en servidor **restaura una instantánea del estado previo, no reproduce el historial**. Reproducir ataría el plan a SM-2 y obligaría a reescribirlo cuando el Plan 4 introduzca FSRS; una instantánea es independiente del algoritmo. La comprobación de versión es lo que la hace segura: si la tarjeta avanzó después, la RPC rechaza en vez de destruir ese avance.

- **Servicio offline como puerto único.** `CardsScreen` deja de llamar a `getData().flashcards.reviewCard`; todo pasa por `useOfflineReview`. El acceso directo al repositorio deja de estar disponible para la pantalla. Se hace ahora, antes de FSRS, para que el motor nuevo escriba por un solo camino.
- **Undo transaccional** sobre `learning_event`: registrar `review_reverted` y recalcular el estado desde el historial válido. Revierte `srs_cards`, `review_log` y `user_stats`. Sin fallback de "quitar Undo": aquí se hace de verdad.
- **Sesión persistente:** `session_id`, IDs de tarjetas, índice, modo y timestamps; rehidratar antes de cargar cola nueva; "Continuar" / "Descartar". Eliminar `reviewSessionStore` en memoria.
- Tests: número exacto de llamadas de escritura, persistencia tras Undo, uso del servicio offline desde Cards, supervivencia de la sesión al reinicio.

**Salida:** toda mutación de review pasa por un puerto, queda en el log de eventos y es reversible.
**Cierra:** Crítico 2; Alto 4, Alto 5; §13 cobertura de Undo y offline.

## Plan 4 — Motor de memoria: FSRS multi-habilidad
**Tamaño:** XL · **Depende de:** Planes 1, 3

- FSRS (dificultad, estabilidad, recuperabilidad) con retención objetivo configurable, sustituyendo SM-2. **Una sola implementación** gobernando los flujos online y offline; eliminar la duplicación TS/SQL actual.
- Cola intradía de aprendizaje/reaprendizaje: Again reaparece en minutos, no al día siguiente. Hoy Again, Hard, Good y Easy programan todos 1 día en la primera revisión.
- Estados separados por habilidad: Hanzi→significado, significado→Hanzi, audio→palabra, frase→palabra, pronunciación. Un Easy en reconocimiento deja de retrasar la escucha.
- Introducción progresiva de tarjetas nuevas.
- Intervalos visibles sobre cada botón; corrección manual de la evaluación.
- Leeches, suspensión y mantenimiento de tarjetas.
- Recuperación activa real: tarjetas escritas, de audio y cloze contextual; adiós a la autoevaluación como única señal. Mapear resultado, tiempo y ayudas a la valoración automáticamente.
- Frase de origen y contexto guardados en la tarjeta.
- `mastered` deja de ser regla fija de intervalo/repeticiones y pasa a ser estimación con evidencia y fecha.
- Mostrar variantes aceptadas, clasificador, sentido concreto y ejemplos.

**Salida:** la retención observada converge alrededor del objetivo, medida sobre datos reales.
**Cierra:** Alto 1, Alto 2, Alto 3; §5 carencias 1–10; §10 P2 completo.

## Plan 5 — Planificador, diagnóstico, unidades y modos
**Tamaño:** L · **Depende de:** Planes 1, 4

> **Antes de escribirlo, sobre el Crítico 1:** en el árbol de trabajo hay una migración sin commitear, `supabase/migrations/2026080203_fix_decks_rpc.sql`, cuyo nombre invita a pensar que ya corrige el mazo inicial. **No lo hace.** Corrige un `column reference deck_id is ambiguous` en `add_deck_from_template`, que es un problema distinto. `create_starter_deck` sigue con `order by w.hsk_level, coalesce(w.frequency, ...) limit 150` sobre 301 palabras de HSK 1, así que el mazo "HSK2 consolidation" sigue conteniendo cero palabras de HSK 2.

- **Diagnóstico inicial**, que sustituye al mazo inicial fijo: suspender lo ya demostrado en vez de crear 150 tarjetas vencidas de golpe.
- Unidades HSK 2 con prerrequisitos y ruta curricular.
- **El planificador construye la cola en servidor con todas las reglas** (`new_cards_per_day`, `review_limit`, `session_size`, estrategia de orden). Sustituye tanto el `limit 50` fijo como el reordenado por frecuencia en cliente.
- Orden de decisión: reviews en riesgo → reaprendizaje de errores recientes → nuevos elementos de la unidad activa → lectura de alta comprensibilidad → ejercicios sobre los errores de esa lectura → formato de examen cerca de la fecha objetivo.
- Ranking de contenido: refuerzo de objetivos + ajuste de dificultad + cobertura de tema + interés − repetición reciente − exceso de vocabulario desconocido.
- Explicación visible de cada propuesta: "esta lectura practica 比 y contiene 6 palabras que estás aprendiendo".
- Separar Learn (enseña con apoyo), Review (FSRS + recuperación activa) y Exam (formato y tiempo, sin ayudas).

**Salida:** Today deja de ser tres features en paralelo y pasa a ser una decisión explicable. El mazo que ve el usuario contiene lo que su nombre promete porque lo elige el planificador, no un `order by hsk_level limit 150`.
**Cierra:** Crítico 1; Alto 6; §8 completo; §10 P1.4.

## Plan 6 — Ejercicios en unidades, producción y simulacro HSK 3.0
**Tamaño:** XL · **Depende de:** Planes 1, 2, 5 (y 8 para los ejercicios derivados de lectura)

- Convertir el selector manual de nivel+tipo en unidades con longitud, objetivo, progreso y resumen.
- Progresión por unidad: input comprensible → noticing → discriminación → reconstrucción → producción → transferencia → repaso espaciado.
- Ampliar el banco (hoy 2 semillas por combinación nivel×tipo) y evitar repetir el mismo ejercicio inmediatamente.
- Cola de errores y cuaderno de errores con repetición espaciada de conceptos fallados.
- Fill blank: dejar de mostrar todas las opciones mientras se escribe.
- Explicaciones que diagnostican el error, no que solo lo señalan.
- Speaking, pronunciación, escritura de caracteres y tareas comunicativas.
- Formatos fieles a la muestra oficial HSK 3.0; simulacros parciales y completos con tiempo.

**Salida:** el usuario sabe qué competencias domina y cuáles ponen en riesgo el examen.
**Cierra:** §7 completo; §10 P4 completo.

## Plan 7 — Lecturas: corpus editorial y pipeline validado
**Tamaño:** XL · **Depende de:** Plan 1 · **Rama paralela a 4/5**

- 10 lecturas HSK 2 impecables antes de las 60. Objetivo 40–60, en miniseries con continuidad narrativa.
- Temas y tareas oficiales: vida diaria, estudio, trabajo, eventos, lugares, compras, salud, ocio, comunicación interpersonal.
- Eliminar el fallback único (`你好！我每天学习汉语…`), idéntico para short text, story y dialogue, con las dos respuestas correctas siempre en la opción A.
- **Decisión sobre generación con IA:** o se conecta un proveedor real detrás de validadores, o se elimina el ajuste. No queda como placebo. Si se conecta, los validadores deterministas son obligatorios: JSON válido, vocabulario permitido, cobertura objetivo, gramática dentro de nivel o marcada, longitud por etapa, segmentación de frases, pinyin alineado, traducción por oración, respuestas distribuidas entre posiciones, distractores plausibles, evidencia textual por pregunta, filtro de contenido y revisión editorial para lo canónico. Si falla una regla, se regenera o va a cola de revisión.
- Audio humano para el corpus principal; TTS solo para prototipos.

**Salida:** nivel y formato garantizan vocabulario, gramática, longitud y dificultad reales. Ninguna etiqueta "AI" sustituye control de calidad.
**Cierra:** Crítico 4; §6 gaps 1–4; §6 mejoras 1–3 y 8; §6 pipeline; §10 P3.1, P3.3.

## Plan 8 — Lector avanzado y bucle lectura → memoria
**Tamaño:** L · **Depende de:** Planes 1, 7

- Traducción por oración y notas gramaticales contextualizadas.
- Velocidad, seek por palabra y resaltado tipo karaoke sincronizado con el audio.
- Bookmarks, progreso, historial "leído", series y temas.
- Porcentaje de vocabulario conocido antes de abrir; recomendación de la siguiente lectura (92–97 % de tokens conocidos, 3–8 objetivos nuevos, ajustable por modo).
- Tokenización con desambiguación de sentido y pronunciación; hoy toma la primera coincidencia de igual longitud.
- Distinguir visualmente tokens conocidos, desconocidos y objetivo; hoy se pintan todos igual.
- Arreglar el pinyin duplicado: bloque global más pinyin bajo cada token al activarlo.
- Preguntas con evidencia y explicación de por qué falla cada distractor; hoy solo `Score x/y`.
- Guardar la frase exacta al añadir una palabra a Cards; consultas y errores alimentan Cards y Exercises.
- Lecturas offline.

**Salida:** una lectura cambia de forma medible el plan de estudio posterior.
**Cierra:** §6 gaps 5–15; §6 mejoras 4–7; §10 P3.2, P3.4–P3.7.

## Plan 9 — Analítica de aprendizaje
**Tamaño:** M · **Depende de:** Planes 4, 5, 6, 8

Sustituir "actividades completadas" por métricas que representan aprendizaje: retención observada a 7 y 30 días; vocabulario HSK 2 demostrado por habilidad; gramática demostrada en input y en producción; porcentaje conocido de cada lectura; velocidad de lectura sin pinyin; consultas por 100 tokens; comprensión literal e inferencial; precisión de dictado y producción; errores recurrentes; cobertura del syllabus; rendimiento en simulacros.

**Salida:** el dashboard responde "¿estoy listo para HSK 2 3.0?" con evidencia, no con conteo de actividad.
**Cierra:** §12 completo; cierra el criterio de salida de §10 P1.

---

## Mapa de cobertura: ningún hallazgo sin plan

| Hallazgo de la auditoría | Plan |
|---|---|
| Crítico 1 — mazo HSK 2 sin HSK 2 | 5 (diagnóstico + planificador sustituyen el mazo fijo) |
| Crítico 2 — Undo no revierte | 3 |
| Crítico 3 — Reorder/Matching | 2 |
| Crítico 4 — "Generate" no genera | 7 |
| Alto 1 — sin reaprendizaje intradía | 4 |
| Alto 2 — memoria única para 3 modos | 4 |
| Alto 3 — autoevaluación pasiva | 4 |
| Alto 4 — offline desconectado | 3 |
| Alto 5 — "Continuar sesión" falso | 3 |
| Alto 6 — límites que no gobiernan | 5 |
| Alto 7 — perfil de usuario equivocado | 1 |
| Alto 8 — niveles inconsistentes | 1 |
| §5 flashcards, 10 carencias | 4 |
| §5 calidad del corpus y sentidos | 1 |
| §6 gaps de lecturas 1–4 | 7 |
| §6 gaps de lecturas 5–15 | 8 |
| §6 pipeline de contenido generado | 7 |
| §7 carencias de ejercicios | 6 |
| §7 familias gramaticales HSK 2 | 1 |
| §8 modelo de conocimiento | 1 |
| §8 planificador y 3 modos | 5 |
| §10 P0 | 0, 2, 3 (el resto se elimina por innecesario) |
| §10 P1 | 1, 5 |
| §10 P2 | 4 |
| §10 P3 | 7, 8 |
| §10 P4 | 6 |
| §11 vertical slice | Criterio de salida del Plan 1 |
| §12 métricas | 9 |
| §13 verificación técnica | 0 |

## Reglas de ejecución

- Ningún plan se cierra sin ejecutar su criterio de salida y ver la salida real. Afirmar no es verificar.
- Cada plan de los 1–9 añade tests de contrato pedagógico, no solo de render. Es la brecha de cobertura que la propia auditoría señala: los tests actuales prueban bien el render aislado y casi nada de los contratos de producto.
- Prohibido escribir mitigaciones. Si algo está mal y su solución real está en un plan posterior, se deja roto y anotado, no se tapa.
