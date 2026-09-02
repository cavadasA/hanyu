# Auditoría del core móvil de Hanyu para HSK 2 3.0

Fecha de revisión: 2 de septiembre de 2026  
Alcance principal: `apps/mobile`, `packages/domain`, `packages/data`, Supabase y el corpus que consume la app móvil. La web y el servidor Express solo se consideran cuando revelan duplicación o divergencias que afectan al producto móvil.

## 1. Veredicto ejecutivo

Hanyu móvil tiene una carcasa de producto bastante mejor que un prototipo improvisado: navegación clara, una sesión diaria entendible, gestión de mazos, estados de carga y error, accesibilidad razonable, repositorios compartidos, Supabase con RLS, tests móviles y una arquitectura offline ambiciosa.

Pero hoy todavía no es un entrenador fiable para preparar HSK 2 3.0. Es una buena base visual y técnica con tres motores pedagógicos aún inmaduros:

- Flashcards: la interacción se siente bien, pero el algoritmo es SM-2 básico, no tiene reaprendizaje dentro de la sesión, mezcla reconocimiento/recuerdo/escucha en un único estado de memoria y contiene inconsistencias funcionales importantes.
- Lecturas: el lector tiene tokenización y consulta de palabras, pero el producto de contenido es prácticamente un placeholder. “Generate reading” no genera una lectura nueva; reutiliza contenido cacheado o crea siempre el mismo texto fijo.
- Ejercicios: hay cinco interfaces distintas, pero no existe una ruta curricular y dos tipos importantes (`reorder` y `matching`) tienen contratos de respuesta incompatibles con el evaluador local.

La mayor oportunidad no es copiar por separado a Du Chinese, Anki, Knowt y SuperChinese. Es unir sus mejores ideas en un loop estrecho para una sola meta:

> Preparar HSK 2 3.0 mediante una sesión diaria que sabe qué vocabulario, gramática, comprensión auditiva y lectura necesita reforzar el usuario, y usa cada lectura y cada error para decidir qué viene después.

Ese loop integrado puede ser el diferencial real de Hanyu. Hoy las pestañas comparten estadísticas superficiales, pero todavía no comparten un modelo pedagógico.

## 2. Mapa real de la implementación móvil

```text
Expo Router / React Native
        |
        v
Pantallas y hooks en apps/mobile
        |
        v
createHanyuData() en packages/data
        |
        +--> tablas Supabase: words, decks, srs_cards, attempts, stats
        +--> RPC: get_due_cards, review_flashcard, count_deck_cards
        +--> Edge Functions: generate-reading, generate-exercise, tokenize-reading

packages/domain/applySm2()
        |
        +--> usado por la infraestructura offline
        +--> duplicado en SQL para el flujo online

OfflineReviewProvider + SQLite local
        |
        +--> está montado en la raíz, pero CardsScreen no consume su servicio
```

Referencias principales:

- Configuración móvil contra Supabase: `apps/mobile/src/lib/data.ts:6`.
- Composición de providers: `apps/mobile/app/_layout.tsx:9`.
- Fachada de datos compartida: `packages/data/src/factory.ts:44`.
- Algoritmo SM-2 TypeScript: `packages/domain/src/sm2.ts:21`.
- Algoritmo SM-2 online duplicado en SQL: `supabase/migrations/202607280002_learning_rpc.sql:93`.
- Servicio offline creado por el provider: `apps/mobile/src/offline/OfflineReviewProvider.tsx:120`.
- Flujo real de valoración directa contra Supabase: `apps/mobile/src/screens/CardsScreen.tsx:154`.

La separación por capas es buena. El problema es que existen implementaciones avanzadas que no gobiernan la experiencia real y varias reglas pedagógicas están repartidas entre UI, repositorios, Edge Functions y SQL.

## 3. Inventario pedagógico actual

| Recurso | Contenido actual | Lectura del dato |
|---|---:|---|
| Vocabulario HSK 1 | 301 filas | Cobertura nominal sólida |
| Vocabulario nuevo HSK 2 | 203 filas | 504 filas acumuladas, 499 formas Hanzi únicas |
| Vocabulario nuevo HSK 3 | 506 filas | 1010 filas acumuladas |
| Gramática total | 6 puntos | Solo 2 son HSK 2 |
| Ejercicios semilla | 30 | 2 por tipo y nivel |
| Tipos de ejercicio | 5 | Fill blank, multiple choice, reorder, dictation, matching |
| Lecturas editoriales en Supabase seed | 0 | El fallback crea un único texto reutilizado |
| Audio | TTS del dispositivo | No es audio nativo ni tiene timestamps por palabra |

El corpus de vocabulario se importa desde un repositorio comunitario, no directamente desde una fuente oficial (`scripts/import-hsk-data.js:1`). Es un punto de partida valioso, pero falta una comparación reproducible contra el syllabus oficial de noviembre de 2025, vigente desde julio de 2026.

El [syllabus oficial HSK 3.0](https://www.chinesetest.cn/syllabus) ya no define el nivel solo mediante una lista de palabras. Incluye tareas, temas, vocabulario, caracteres y gramática. La descripción oficial de HSK 2 exige comunicación básica en contextos de vida, estudio y trabajo. El estándar del Ministerio también trata escuchar, hablar, leer, escribir y traducir como competencias, no como una única cifra de vocabulario ([estándar oficial del Ministerio de Educación](https://jsj.moe.gov.cn/n2/7001/7001/1573.shtml)).

## 4. Hallazgos críticos y altos

### Crítico 1 — El mazo “HSK2 consolidation” puede contener cero palabras HSK 2

`CardsScreen` solicita 150 tarjetas con la estrategia `hsk2_consolidation` (`apps/mobile/src/screens/CardsScreen.tsx:219`). La RPC selecciona niveles 1 y 2, pero ordena primero por nivel y después aplica `limit 150` (`supabase/migrations/2026080202_decks_seed_and_rpc.sql:139`). Como hay 301 palabras HSK 1, las primeras 150 son todas HSK 1.

Impacto:

- El nombre y la promesa del mazo no coinciden con su contenido.
- Un usuario que prepara HSK 2 puede pasar semanas sin ver vocabulario nuevo HSK 2.
- Las 150 tarjetas se crean como vencidas inmediatamente; no existe introducción diaria de nuevas tarjetas.

Dirección de solución:

- Separar explícitamente “HSK 1 base” y “HSK 2 nuevas”.
- Crear el mazo acumulativo completo, pero introducir nuevas tarjetas mediante un límite diario y prerrequisitos.
- Para un usuario que ya conoce parte de HSK 1, usar un diagnóstico inicial y suspender lo demostrado.

### Crítico 2 — Undo no deshace la valoración persistida

La valoración se guarda primero mediante `reviewCard` (`CardsScreen.tsx:164`). Después, Undo solo modifica arrays, contadores e índice locales (`CardsScreen.tsx:133`). No revierte `srs_cards`, `review_log` ni `user_stats`.

Si el usuario vuelve a valorar la tarjeta:

- se aplican dos transiciones SM-2;
- se crean dos eventos de review;
- se incrementan dos veces las estadísticas;
- la interfaz comunica que el primer evento fue deshecho cuando no lo fue.

El test actual solo comprueba que vuelve a mostrarse la tarjeta (`apps/mobile/src/screens/CardsScreen.test.tsx:160`); no comprueba persistencia ni número de llamadas.

Dirección de solución: implementar un evento de reversión transaccional o eliminar Undo hasta que sea real. Para un sistema con event log, la opción robusta es registrar `review_reverted` y recalcular la tarjeta desde el historial válido.

### Crítico 3 — Reorder y Matching pueden marcar respuestas correctas como incorrectas

En Reorder, la UI produce un array de tokens (`apps/mobile/src/exercises/ReorderExercise.tsx:16`), pero el evaluador compara ese array mediante igualdad estricta contra un string concatenado (`packages/data/src/repositories/exercises.ts:138`).

En Matching, la UI produce un objeto `{ palabra: significado }` (`apps/mobile/src/exercises/MatchingExercise.tsx:18`), mientras el evaluador solo acepta el string literal `matched` (`packages/data/src/repositories/exercises.ts:147`). Además, la pantalla permite comprobar Matching con una sola pareja porque cualquier objeto no vacío cuenta como respuesta (`apps/mobile/src/screens/ExercisesScreen.tsx:22`).

No existe actualmente una RPC `check_exercise` ni una Edge Function `check-exercise` en Supabase, por lo que el fallback local es una ruta real, no meramente defensiva.

Dirección de solución:

- Definir un contrato discriminado de respuesta por tipo.
- Normalizar y validar en una única función compartida cliente/servidor.
- Añadir tests end-to-end de respuestas correctas, incorrectas, parciales y equivalentes.

### Crítico 4 — “Generate reading” y “Generate exercise” no generan con IA

`generate-reading` busca contenido cacheado y devuelve una fila aleatoria; si no encuentra ninguna, inserta el mismo fallback (`supabase/functions/generate-reading/index.ts:40`). El fallback usa este texto en todos los niveles y formatos:

`你好！我每天学习汉语。我喜欢读书，也喜欢喝茶。`

Solo cambia el título (`supabase/functions/_shared/ai.ts:74`). Las dos respuestas correctas del fallback están siempre en la opción A.

`generate-exercise` hace lo mismo con ejercicios cacheados o fallbacks (`supabase/functions/generate-exercise/index.ts:40`). La pantalla de ajustes permite elegir DeepSeek o Gemini (`apps/mobile/src/screens/YouScreen.tsx:212`), pero ninguna Edge Function llama a esos proveedores y la configuración siempre informa `api_key_configured: false` (`packages/data/src/repositories/settings.ts:26`).

Impacto:

- La palabra “Generate” crea una expectativa falsa.
- Nivel y formato no controlan la dificultad real del texto fallback.
- El selector “AI tutor engine” es un ajuste placebo.

Dirección de solución: hasta que exista generación real con validación, renombrar a “Open reading” / “Get exercise”, ocultar el selector de IA y tratar el contenido como un catálogo curado.

### Alto 1 — El algoritmo de repaso no tiene reaprendizaje dentro de la sesión

El SM-2 actual da un intervalo de un día tanto a Again como a Hard, Good y Easy en la primera revisión. Solo cambia el ease factor (`packages/domain/src/sm2.ts:32`). Una tarjeta olvidada desaparece hasta el día siguiente en vez de reaparecer tras unos minutos.

Resultados exactos para una tarjeta nueva:

| Botón | Quality | Próximo intervalo | Estado |
|---|---:|---:|---|
| Again | 1 | 1 día | learning |
| Hard | 3 | 1 día | learning |
| Good | 4 | 1 día | learning |
| Easy | 5 | 1 día | learning |

Esto hace que cuatro botones aparenten tomar decisiones diferentes, pero al principio programan el mismo día. Anki moderno usa FSRS y modela dificultad, estabilidad y recuperabilidad; también distingue la retención objetivo y el coste de trabajo ([manual oficial de Anki](https://docs.ankiweb.net/deck-options)).

Dirección de solución:

- Adoptar FSRS para largo plazo.
- Mantener una cola corta de aprendizaje/reaprendizaje para fallos recientes.
- Mostrar el intervalo real sobre cada botón.
- Medir retención observada y permitir ajustar la retención deseada sin exponer complejidad innecesaria.

### Alto 2 — Los tres modos actualizan una sola memoria

Recognition, recall y listening cambian el frente de la tarjeta, pero todos valoran el mismo `srs_card` (`apps/mobile/src/ui/FlashCardView.tsx:282`). Recordar el significado al ver Hanzi, producir Hanzi desde una traducción y reconocer audio son habilidades diferentes.

Consecuencia: una respuesta Easy en reconocimiento puede retrasar también la práctica de escucha o producción aunque esas habilidades sean débiles.

Dirección de solución: una nota de vocabulario debe producir estados de habilidad separados:

- Hanzi → significado;
- significado → Hanzi o respuesta escrita;
- audio → Hanzi/significado;
- frase contextual → palabra o estructura;
- pronunciación, cuando exista evaluación de voz.

El planificador puede mezclar esos estados, pero no debe colapsarlos.

### Alto 3 — Los modos siguen siendo autoevaluación pasiva

Recall muestra la traducción y luego pide al usuario que se autocalifique; no exige escribir ni hablar (`FlashCardView.tsx:287`). Listening reproduce TTS y también se autocalifica. Esto permite sobreestimar aprendizaje.

Knowt destaca precisamente por variar entre escritura, opción múltiple, verdadero/falso y flashcards dentro de Learn Mode ([Knowt Learn Mode](https://knowt.com/learn-mode)). Hanyu no necesita copiar esos tipos genéricos, pero sí recoger evidencia objetiva.

Dirección de solución:

- Para tarjetas nuevas, usar selección o construcción guiada.
- Para tarjetas maduras, usar respuesta escrita o voz.
- Mapear resultado, tiempo y ayudas a Again/Hard/Good/Easy automáticamente.
- Mantener la autoevaluación como corrección manual, no como única señal.

### Alto 4 — La infraestructura offline no está conectada al flujo de tarjetas

`OfflineReviewProvider` está montado en la raíz y crea `OfflineReviewService` y `ReviewSyncEngine` (`apps/mobile/app/_layout.tsx:14`, `OfflineReviewProvider.tsx:120`). Sin embargo, `CardsScreen` llama a `getData().flashcards.reviewCard` directamente (`CardsScreen.tsx:164`). No usa `useOfflineReview`.

Hay una implementación y una batería de tests offline considerable, pero el usuario no obtiene su beneficio. Es deuda peligrosa porque transmite sensación de feature terminada.

Dirección de solución: hacer del servicio offline el único puerto de lectura y valoración de tarjetas. El acceso directo al repositorio no debería estar disponible para la pantalla.

### Alto 5 — “Continuar sesión” no restaura una sesión

`reviewSessionStore` es una variable en memoria (`apps/mobile/src/lib/reviewSessionStore.ts:11`). Se pierde al cerrar el proceso. Incluso dentro del mismo proceso, entrar de nuevo a Cards ejecuta `load`, vuelve a la fase inicial y borra el snapshot (`CardsScreen.tsx:73`). El banner conserva una apariencia de continuidad, no la cola ni el índice real.

Dirección de solución: persistir ID de sesión, IDs de tarjetas, índice, modo y timestamps. Rehidratar antes de cargar una cola nueva y ofrecer “Continuar” o “Descartar”.

### Alto 6 — Los límites configurables no gobiernan la cola real

- La pantalla siempre solicita 50 tarjetas (`CardsScreen.tsx:79`).
- Ajustes permiten `max_reviews_per_session` hasta 300 (`YouScreen.tsx:185`).
- `cards_per_day` cambia la meta visual, pero no limita nuevas tarjetas ni reviews.
- “All due” significa en realidad “todas las que llegaron en el primer lote de máximo 50”.
- El orden por frecuencia se aplica después de que la RPC ya seleccionó las 50 más antiguas (`packages/data/src/repositories/flashcards.ts:140`), por lo que no es un orden global por frecuencia.

Dirección de solución: separar `new_cards_per_day`, `review_limit`, `session_size` y estrategia de orden. El planificador debe construir la cola en servidor con todas las reglas, no reordenar un subconjunto en cliente.

### Alto 7 — El usuario objetivo actual no coincide contigo

`PRODUCT.md:9` declara que el usuario ya completó HSK 2. El modelo actual trata HSK 1 como repaso y HSK 2 como consolidación (`PRODUCT.md:15`). Tú quieres aprender y prepararte para HSK 2 3.0.

Esta diferencia explica varias decisiones: mazo de consolidación, falta de lecciones progresivas, ejercicios libres por tipo y poca enseñanza explícita.

Dirección de solución: redefinir el objetivo como “HSK 2 en progreso”, con diagnóstico inicial y unidades. Consolidación debe ser un estado del usuario, no una suposición global.

### Alto 8 — La alineación de niveles es inconsistente

El tipo compartido solo acepta HSK 1–3 (`packages/data/src/types.ts:5`), mientras Settings permite 1–6 (`YouScreen.tsx:23`). Today fuerza como mínimo nivel 2 y fija las lecturas en nivel 2 (`packages/data/src/repositories/today.ts:57`). Las pantallas de ejercicios y lecturas solo muestran 1–3.

Elegir 4–6 puede producir una insignia creíble con contenido inexistente o degradado.

Dirección de solución: limitar la UI al alcance real. Para este producto, “HSK 2 3.0” como foco explícito sería una fortaleza, no una carencia.

## 5. Auditoría de flashcards

### Lo que ya funciona bien

- Fases claras: preparación, revisión y resumen.
- Modos de reconocimiento, recuerdo y escucha.
- Controles Again/Hard/Good/Easy y gesto de swipe.
- Temporizador y resumen de sesión.
- Mazos activos, catálogo, creación, renombrado y eliminación.
- Registro de calidad y tiempo por review.
- Arquitectura offline con idempotencia, versiones y resolución de conflictos bien pensada, aunque no integrada.

### Lo que impide que sean excepcionales

1. No hay introducción progresiva de tarjetas nuevas.
2. No hay pasos de reaprendizaje intradía.
3. Los botones no muestran sus intervalos.
4. No hay leeches, suspensiones ni detección de tarjetas problemáticas.
5. No se distingue dominio por habilidad.
6. No hay frase de origen ni contexto en la tarjeta.
7. No hay respuesta escrita o hablada obligatoria.
8. La traducción móvil usa siempre `meaning_en`, aunque el corpus incluye español (`FlashCardView.tsx:314`).
9. No se muestran variantes aceptadas, clasificador, sentido concreto ni ejemplos.
10. El estado `mastered` depende de reglas fijas de intervalo y repeticiones, no de una retención calibrada (`packages/domain/src/sm2.ts:55`).

### Problemas de calidad del corpus

El corpus representa palabras mediante `hanzi + nivel`, pero muchas formas tienen pronunciaciones y sentidos distintos. La traducción española se aplicó principalmente por Hanzi, lo que mezcla sentidos:

- `地 dì` aparece como sustantivo “earth; ground; field”, pero su español dice “de (partícula adverbial)” (`server/db/seeds/hsk3-words.json:35`).
- `还 huán` conserva una definición inglesa de “still” y una traducción española que mezcla “todavía” con “devolver” (`hsk3-words.json:27`).
- `长 cháng` y `长 zhǎng` comparten traducciones que mezclan “largo”, “crecer” y “jefe” (`hsk2-words.json:267`, `hsk3-words.json:275`).

Para aprender chino, la unidad correcta no es solo el string Hanzi: es un lexema/sentido con pronunciación, categoría, significado, colocaciones y ejemplos.

### Diseño objetivo recomendado

Una “nota” de vocabulario debe incluir:

- forma simplificada y tradicional;
- pinyin normalizado y audio;
- uno o varios sentidos separados;
- clasificador cuando aplique;
- categoría gramatical;
- colocaciones frecuentes;
- dos frases HSK 2 naturales;
- fuente oficial o editorial;
- contextos donde el usuario la encontró.

De esa nota se derivan tarjetas por habilidad. FSRS programa cada habilidad y el planificador decide cuál aporta más valor ese día.

## 6. Auditoría de lecturas frente a Du Chinese

### Qué existe hoy

- Filtro por HSK 1–3 y formato.
- Lista y detalle.
- TTS para el texto completo.
- Mostrar/ocultar pinyin.
- Tokenización greedy por coincidencia más larga (`reading-tokenizer.ts:20`).
- Popup de palabra con pinyin, significado y alta en Cards.
- Preguntas de comprensión y score.

Es una base funcional de reader. No es todavía un sistema de graded reading.

### Distancia real frente a Du Chinese

Du Chinese no destaca solo porque permita tocar una palabra. Su ventaja es la combinación de miles de lecturas, contenido editado, audio nativo, traducción por frase, gramática contextual, control de pinyin, bookmarks, descarga, series y flashcards con la frase de origen. Esas capacidades están descritas por el propio producto en su [guía de uso](https://duchinese.net/blog/2021/04/14/welcome-to-du-chinese/) y su [página de producto](https://duchinese.net/).

La distancia principal es contenido y continuidad pedagógica, no estética.

### Gaps concretos

1. No hay corpus curado de lecturas.
2. Nivel y formato no garantizan vocabulario, gramática, longitud ni dificultad.
3. El fallback es igual para short text, story y dialogue.
4. El audio es TTS del sistema (`apps/mobile/src/audio/useSpeech.ts:24`), sin narrador nativo ni sincronización.
5. No hay traducción por oración.
6. No hay notas gramaticales contextualizadas.
7. No hay velocidad, seek por palabra ni resaltado karaoke.
8. No hay bookmark, progreso, historial “leído”, serie o tema.
9. No hay porcentaje de vocabulario conocido antes de abrir.
10. No se recomienda la siguiente lectura según el modelo del usuario.
11. El popup usa inglés y no la traducción española (`WordSheet.tsx:54`).
12. La tokenización no resuelve ambigüedad de sentidos/pronunciaciones; toma la primera coincidencia de igual longitud.
13. Todos los tokens no-puntuación se pintan igual, incluidos desconocidos (`ReadingText.tsx:30`).
14. Al activar pinyin se muestra un bloque global y también pinyin debajo de cada token (`ReadingDetailScreen.tsx:116`, `ReadingText.tsx:40`).
15. Tras responder solo aparece `Score x/y`; no se muestra evidencia, explicación ni por qué un distractor es incorrecto (`ReadingQuestions.tsx:47`).

### Cómo hacer que las lecturas sean espectaculares sin copiar todo Du Chinese

La apuesta debe ser “graded reading adaptativo para HSK 2 3.0”:

1. Crear primero un corpus editorial pequeño y excelente: 40–60 lecturas HSK 2.
2. Cubrir los temas y tareas oficiales: vida diaria, estudio, trabajo, eventos, lugares, compras, salud, ocio y comunicación interpersonal.
3. Organizarlo en miniseries para que exista curiosidad narrativa.
4. Calcular dificultad para cada usuario:
   - cobertura de palabras conocidas;
   - palabras objetivo pendientes;
   - gramática conocida/nueva;
   - longitud y complejidad de frase;
   - velocidad de lectura y consultas por palabra.
5. Recomendar textos con 92–97 % de tokens conocidos y 3–8 objetivos nuevos, ajustable por modo.
6. Guardar la frase exacta al añadir una palabra a flashcards.
7. Después de leer, crear ejercicios sobre errores reales y reintroducir esas palabras en lecturas futuras.
8. Añadir audio humano para el corpus principal; TTS puede servir para contenido generado o prototipos.

### Pipeline seguro para contenido generado

La IA puede ampliar el catálogo, pero no debe publicar directamente. Cada lectura generada debería pasar por validadores deterministas:

- formato JSON válido;
- vocabulario permitido y cobertura objetivo;
- gramática dentro del nivel o marcada como objetivo;
- longitud por etapa;
- segmentación de frases;
- pinyin alineado;
- traducción por oración;
- respuestas distribuidas entre posiciones;
- distractores plausibles;
- cada pregunta ligada a una evidencia textual;
- filtro de contenido y revisión editorial para material canónico.

Si falla una regla, se regenera o queda en una cola de revisión. La etiqueta “AI” nunca debe sustituir control de calidad.

## 7. Auditoría de ejercicios frente a SuperChinese

### Lo que ya funciona bien

- Cinco renderers separados y tipados.
- Buenas bases de accesibilidad.
- Estados de answering/checking/checked.
- Prevención de doble submit en el hook.
- Registro de intentos y estadísticas.

### Lo que falta

- Una sesión no tiene longitud, objetivo, progreso ni resumen.
- El usuario elige nivel y tipo manualmente; el sistema no prescribe qué practicar.
- Solo hay dos semillas por combinación de nivel y tipo.
- La selección aleatoria puede repetir el mismo ejercicio inmediatamente.
- No hay cola de errores ni repetición espaciada de conceptos fallados.
- Fill blank permite escribir y a la vez ver todas las opciones, reduciendo recuperación activa.
- Dictation exige coincidencia exacta de Hanzi o del pinyin con tonos; no normaliza tonos numéricos, ausencia de marcas, espacios o puntuación (`exercises.ts:152`).
- Las explicaciones son escasas y no diagnostican el error.
- No hay speaking, pronunciación, escritura de caracteres ni tareas comunicativas.
- No hay simulacro HSK 3.0 ni tipos fieles a la muestra oficial.

SuperChinese combina un camino curricular diseñado por docentes, temas reales, vocabulario, gramática, historia, quiz y práctica oral; el propio producto enfatiza que las lecciones son creadas por docentes y no por IA ([SuperChinese](https://www.superchinese.com/)). La lección y la progresión son su ventaja, no la cantidad de botones.

### Diseño objetivo recomendado

Construir unidades HSK 2, no un selector de ejercicios. Cada unidad debe seguir una progresión:

1. Input comprensible: diálogo o lectura breve.
2. Noticing: vocabulario y patrón gramatical objetivo.
3. Discriminación: elegir significado o estructura correcta.
4. Reconstrucción: ordenar o completar.
5. Producción: escribir o hablar.
6. Transferencia: usar el patrón en una situación nueva.
7. Repaso espaciado: volver al concepto según desempeño.

Ejemplos de familias HSK 2 que el syllabus oficial exige y el catálogo actual casi no cubre:

- reduplicación verbal y adjetival;
- `过`, `着`, `得`, `地`;
- comparaciones con `比`;
- complementos resultativos y direccionales;
- `是…的`;
- `虽然…但是…`;
- `因为…所以…`;
- `一…就…`;
- preguntas de elección con `还是`;
- duración, cantidad y expresiones aproximadas.

El corpus actual solo ofrece dos puntos gramaticales HSK 2 (`server/db/seeds/grammar-points.json:39`). Esto impide afirmar cobertura del examen aunque el vocabulario nominal sea cercano.

## 8. El loop de aprendizaje que debería ser el core

El núcleo no debería ser “Today llama a tres features”. Debe ser un planificador basado en evidencia.

### Modelo de conocimiento mínimo

Entidades:

- `competency`: tarea oficial HSK y habilidad;
- `lexeme_sense`: palabra, pronunciación y sentido;
- `grammar_point`: patrón y prerrequisitos;
- `content_item`: lectura, audio, diálogo o lección;
- `exercise_template`: tipo y habilidad evaluada;
- `learner_skill_state`: dificultad, estabilidad, recuperabilidad y evidencia;
- `learning_event`: respuesta, consulta, pista, tiempo, lectura completada o review revertido.

No es necesario comenzar con un knowledge graph complejo. Sí es necesario que cada contenido declare qué enseña y cada interacción declare qué demuestra.

### Planificador diario propuesto

Orden de decisión:

1. Reviews vencidas con mayor riesgo de olvido.
2. Reaprendizaje de errores recientes.
3. Nuevos elementos de la unidad activa, respetando prerrequisitos.
4. Una lectura con alta comprensibilidad que refuerce elementos objetivo.
5. Ejercicios sobre errores y gramática de esa lectura.
6. Práctica de formato de examen cerca de la fecha objetivo.

Una función de ranking de contenido puede combinar:

```text
valor = refuerzo_de_objetivos
      + ajuste_de_dificultad
      + cobertura_de_tema_HSK
      + interés_del_usuario
      - repetición_reciente
      - exceso_de_vocabulario_desconocido
```

La sesión diaria debe explicar brevemente por qué propone algo: “Esta lectura practica 比 y contiene 6 palabras que estás aprendiendo”. Eso convierte personalización invisible en confianza.

### Tres modos de estudio

- Learn: enseña contenido nuevo con apoyo y feedback.
- Review: usa FSRS y recuperación activa.
- Exam: simula formato, tiempo y puntuación sin ayudas.

Hoy esos tres objetivos están mezclados. Separarlos mejora tanto UX como datos.

## 9. Benchmark y posición defendible

| Referencia | Su fortaleza | Qué adoptar | Qué no intentar todavía |
|---|---|---|---|
| Du Chinese | Contenido editorial, audio y herramientas contextuales | Contexto, traducción por frase, gramática, palabra → SRS, series | Miles de lecturas desde el inicio |
| Anki | Scheduling y control del usuario | FSRS, intervalos visibles, historial, undo real, leeches | Complejidad de configuración para el usuario final |
| Knowt | Variedad de recuperación y Learn Mode | Respuesta escrita, tipos adaptativos, práctica hasta dominio | Generación genérica para cualquier materia |
| SuperChinese | Camino curricular y práctica multihabilidad | Unidades, feedback, speaking/listening, progresión | Cubrir HSK 1–5 antes de dominar HSK 2 |

Posición recomendada:

> Hanyu es el entrenador personal, calmado y transparente para aprobar HSK 2 3.0 y construir una base de mandarín real mediante lecturas adaptativas.

Es suficientemente estrecha para ejecutarla bien y suficientemente distinta para ser útil incluso junto a Du Chinese o Anki.

## 10. Roadmap priorizado

### P0 — Recuperar confianza funcional

1. Corregir scoring de Reorder y Matching.
2. Hacer Undo transaccional o retirarlo.
3. Corregir el mazo inicial para incluir realmente HSK 2.
4. Conectar Cards al servicio offline o retirar el provider hasta completar la integración.
5. Limitar niveles visibles a 1–3 y eliminar estados contradictorios.
6. Corregir el typecheck de `CardStatusBadge`.
7. Cambiar los nombres “Generate” y ocultar el selector de IA mientras no exista generación real.
8. Añadir tests integrados de los contratos pedagógicos, no solo del render.

Criterio de salida: ninguna acción visible puede comunicar una mutación o evaluación distinta a la persistida.

### P1 — Alinear el producto con HSK 2 3.0

1. Cambiar el perfil objetivo de “HSK2 completado” a “preparando HSK2”.
2. Importar y versionar el syllabus oficial 2025/2026.
3. Crear matrices de cobertura para vocabulario, caracteres, gramática, temas y tareas.
4. Implementar diagnóstico inicial.
5. Diseñar unidades HSK 2 y prerrequisitos.
6. Usar español como idioma de apoyo configurable; hoy los datos existen pero la app muestra inglés.

Criterio de salida: la app puede decir exactamente qué porcentaje del syllabus está enseñado, practicado y demostrado.

### P2 — Convertir flashcards en un motor de memoria serio

1. Introducir FSRS y retención objetivo.
2. Añadir cola intradía de aprendizaje/reaprendizaje.
3. Separar estados por habilidad.
4. Añadir tarjetas escritas, audio y cloze contextual.
5. Mostrar intervalos y permitir corregir la evaluación.
6. Guardar frase de origen y contexto.
7. Implementar leeches, suspensión y mantenimiento de tarjetas.

Criterio de salida: la retención real converge alrededor del objetivo con menos reviews innecesarias.

### P3 — Construir el vertical slice de lectura excepcional

1. Crear 10 lecturas HSK 2 impecables antes de crear 60.
2. Añadir traducción por oración, notas, gramática y palabra en contexto.
3. Incorporar audio humano con sincronización.
4. Añadir bookmarks, progreso y modo offline.
5. Calcular cobertura conocida y recomendar la siguiente lectura.
6. Conectar consultas y errores con Cards y Exercises.
7. Validar preguntas con evidencia y feedback.

Criterio de salida: una lectura cambia de forma medible el plan de estudio posterior.

### P4 — Crear práctica adaptativa y modo examen

1. Convertir ejercicios sueltos en unidades.
2. Añadir speaking y producción escrita.
3. Implementar normalización lingüística y feedback específico.
4. Crear un cuaderno de errores.
5. Importar formatos de la muestra oficial HSK 3.0.
6. Añadir simulacros parciales y completos con tiempo.

Criterio de salida: el usuario sabe no solo cuántas actividades hizo, sino qué competencias domina y cuáles ponen en riesgo el examen.

## 11. Vertical slice recomendado para empezar

En lugar de rehacer toda la app, construiría una unidad completa llamada, por ejemplo, “Comparar lugares y cosas”.

Contenido:

- 12–18 palabras HSK 2;
- gramática `A 比 B + adjetivo`;
- una microlección;
- un diálogo con audio;
- una lectura de 150–220 caracteres;
- traducción por oración y popup contextual;
- cinco ejercicios progresivos;
- tarjetas por reconocimiento, audio y producción;
- repaso FSRS;
- mini evaluación sin ayudas.

Esta unidad obligaría a resolver el modelo de datos, el planificador, el contexto de tarjetas, la calidad de lectura, el feedback y la analítica. Después se replica el sistema, no solo las pantallas.

## 12. Métricas que sí representan aprendizaje

Evitar usar “actividades completadas” como métrica principal. Medir:

- retención observada a 7 y 30 días;
- vocabulario HSK 2 demostrado por habilidad;
- gramática demostrada en input y producción;
- porcentaje conocido de cada lectura;
- velocidad de lectura sin pinyin;
- consultas por 100 tokens;
- comprensión literal e inferencial;
- precisión de dictado y producción;
- errores recurrentes;
- cobertura del syllabus;
- rendimiento en simulacros.

La etiqueta `mastered` debe ser una estimación con evidencia y fecha, no un estado permanente.

## 13. Verificación técnica realizada

### Resultado móvil

- 37 suites Jest aprobadas.
- 173 tests móviles aprobados.
- Aparece un warning de `act(async)` no esperado en la suite.
- El typecheck móvil falla en `apps/mobile/src/ui/CardStatusBadge.tsx:12` porque `colors.info` no existe en el tipo del tema.
- Typecheck de `@hanyu/domain`: aprobado.
- Typecheck de `@hanyu/data`: aprobado.

### Resultado del test root

- 24 archivos pasaron y 17 fallaron.
- 113 tests pasaron, 59 fallaron y 9 quedaron omitidos.
- La mayoría de fallos legacy se debe a que `better-sqlite3` fue compilado para otro ABI de Node, no a una regresión móvil demostrada.
- El comando root no llegó a ejecutar Jest móvil porque usa `vitest run && npm run test -w @hanyu/mobile`.

### Lectura de la cobertura

Los tests móviles prueban bien render, interacción y estados aislados. No prueban suficientemente contratos de producto completos:

- Undo no verifica persistencia.
- Reorder y Matching no verifican scoring a través del repositorio.
- Starter deck no verifica distribución HSK 1/2.
- “Generate” no verifica novedad ni ajuste de nivel.
- Offline se prueba como subsistema, pero no su uso desde Cards.

## 14. Conclusión

Hanyu no necesita más features sueltas. Necesita que las features existentes compartan una verdad pedagógica.

La base más prometedora es:

- corpus HSK 1–3 cercano en tamaño al objetivo;
- una app móvil agradable;
- repositorios y eventos de aprendizaje ya iniciados;
- tokenización de lecturas;
- mazos y SRS;
- infraestructura offline avanzada.

Los puntos dudosos no están principalmente en React Native. Están en la promesa educativa y en los contratos entre contenido, evaluación, scheduling y progreso. Resolver esos contratos primero evita construir una versión más bonita de una app que todavía no sabe qué debe enseñarte mañana.

La versión espectacular sería aquella donde una palabra consultada en una historia reaparece en una tarjeta contextual, un error de gramática genera práctica específica, la próxima lectura refuerza lo débil y Today puede explicar por qué esa sesión es la mejor inversión para aprobar HSK 2 3.0.
