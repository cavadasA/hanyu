# Prueba integral de la app móvil — noviembre de 2026

Fecha: 26-11-2026. Recorrido completo de la app móvil (Expo 57) en el simulador iOS, contra un Supabase **local** en Docker. El proyecto remoto está pausado y no se ha tocado.

## Resumen

- **Funciona de punta a punta:**
  - registro, inicio y cierre de sesión;
  - plan de Hoy;
  - Learn y Review con FSRS, deshacer y repaso sin conexión;
  - Words;
  - gramática (165 puntos);
  - lector con audio frase a frase, acepción y pregunta inferencial;
  - lecturas sin red;
  - ejercicios por unidad;
  - simulacro HSK 2 completo (forma A: 92 %, con 书写 2 a mano reconocido tras los arreglos) y la nueva entrega anticipada por sección;
  - escritura guiada y quiz;
  - tareas comunicativas sin IA;
  - progreso.
- **Bugs corregidos en esta prueba:** 12, cada uno con su test y su commit (tabla abajo). Los más graves:
  - en 书写 2, escribir a mano podía cerrar el simulacro (y perder todas las respuestas), desplazaba la página hasta hacer el carácter irreconocible, o seleccionaba el lienzo como texto y dejaba la app colgada;
  - la caché offline de lecturas no se escribía nunca;
  - la ficha de cada punto de gramática daba error;
  - las imágenes del simulacro no se subían a Storage;
  - la sesión de repaso guardada pasaba de una cuenta a otra.
- **Pendientes:** los 17 que dejó la prueba se corrigieron después, cada uno con su test y su commit (ver «Pendientes (corregidos después)»). El más grave, que con el SDK de iOS 27 la app se cerraba al arrancar, se resuelve con Expo 57.0.34 y un config plugin, sin parches a mano en `ios/`.
- **No se pudo probar:**
  - la pronunciación con micrófono: el reconocedor de voz no está disponible en el simulador;
  - la recuperación de contraseña por correo.

## Entorno

| Pieza | Estado |
|---|---|
| Supabase CLI | `npx supabase@3.4.0`. `supabase/config.jsonc` y `supabase/.gitignore` **no se commitean** a propósito: son configuración local (puertos 563xx, Studio desactivado) y no deben afectar a la CI |
| Puertos | API 56321, DB 56322. Los 54xxx y 55xxx los ocupan otros proyectos |
| Base de datos | `supabase db reset`: las 45 migraciones y `seed.sql` se aplican en limpio, sin errores |
| Datos | 1009 palabras, 48 lecturas (todas con audio por frase), 165 puntos de gramática (49/59/57), 3 formas de simulacro, 24 tareas comunicativas, 158 unidades |
| Storage | bucket `media` público, con 543 audios y 53 imágenes. Las 596 rutas que referencian lecturas y formas existen |
| Edge Functions | `supabase functions serve`. `grade-communicative` y `pronunciation-assess` responden 503 `not_configured` (no hay claves de IA) |
| App | `apps/mobile/.env.local` (gitignorado) apunta al Supabase local. Metro confirma `env: load .env.local .env` |
| Simulador | iPhone 18 Pro, iOS 27, Xcode 27.2 |
| Expo | 57.0.9 durante la prueba; 57.0.34 desde `bf4cd79` |
| Usuarios | Credenciales en `supabase/seed-test-user.md` (gitignorado). Uno se creó por API admin y otro registrándose desde la app |

### Problemas del entorno de compilación (no son de la app)

- `ios/` estaba desactualizado y le faltaba el pod de `expo-speech-recognition`. Se regeneró con `npx expo prebuild -p ios`; `ios/` está gitignorado. El prebuild cambió los scripts de `apps/mobile/package.json`, y se revirtió ese cambio.
- CocoaPods 1.16 con Ruby 4 falla sin locale UTF-8 (`Unicode Normalization not appropriate for ASCII-8BIT`). Hace falta `LANG=en_US.UTF-8`.
- Los módulos Expo precompilados no casaban entre sí. `ExpoFileSystem` pedía un símbolo de `ExpoModulesCore` que no existe, y la app se cerraba en dyld. Se resolvió compilando desde fuente con `EXPO_USE_PRECOMPILED_MODULES=0 pod install`.
- `xcrun simctl pbcopy` corrompe el texto chino si no hay locale UTF-8. Para pegar chino en el simulador se usó `pbsync`.

## Bugs corregidos (commit aparte, con test)

| Commit | Área | Qué pasaba |
|---|---|---|
| `99e5b17` | Medios | `sync-media` sólo recorría `content/audio/`. Las 53 imágenes del simulacro nunca se subían y daban 404 en un Supabase nuevo (también en producción). Además, la CI no se disparaba con cambios en `content/images/` |
| `2ddf4d7` | Hoy | Un usuario recién registrado, sin mazos, veía «Ya has introducido las palabras nuevas de hoy». Ahora el plan distingue tres casos: sin mazo (indica Library → Decks), sin palabras nuevas y cupo agotado |
| `aac37df` | Sesión | La sesión de repaso a medias se guardaba en el dispositivo sin dueño. Al entrar con otra cuenta, Hoy ofrecía «Continue review» con las tarjetas de la anterior. Ahora se borra al cerrar sesión o al cambiar de usuario |
| `813b2b3` | Gramática | La ficha de **todos** los puntos mostraba «invalid input syntax for type json» y nunca enlazaba sus lecturas. El filtro `contains` sobre la columna jsonb `target_grammar` se enviaba como literal de array de Postgres |
| `ee7ba21` | Lector | La ficha que abre tocar una palabra se pintaba en línea **al final** de la lectura, y quien tocaba una palabra de arriba no veía nada. Ahora es una hoja modal sobre el texto |
| `8926ff2` | Offline | **La caché de lecturas no se escribía nunca.** `readingCacheScope` llamaba a `auth.getSession` suelta y GoTrueClient usa `this`, así que lanzaba. Sin red, la pantalla decía «No connection / No readings yet». Tras el arreglo se cachean la lista, las 48 lecturas y 435 clips, y una lectura no visitada se abre sin red |
| `00eb444` | Expresión | El 503 `not_configured` se interpretaba como fallo de red, porque la Response de RN no es instancia del `Response` global, y la tarea decía «el corrector no respondió». Ahora dice «la corrección de tareas comunicativas no está activada» |
| `968a279` | Simulacro | **Un trazo hacia la derecha en 书写 2 cerraba el examen** y se perdían todas las respuestas, al final de los 51 minutos. El Stack del simulacro quitaba el gesto de volver a sus propias pantallas, pero la pantalla `exam` del Stack de Practice lo conservaba, y desde iOS 26 se dispara deslizando sobre el contenido. Al reproducirlo, la app se quedó además colgada, con un arrastre del WebView a medias, y hubo que reiniciarla |
| `7353b06` | Simulacro | **En 书写 2 la página se desplazaba mientras se escribía.** El ScrollView se quedaba los trazos verticales, el carácter salía aplastado y el reconocedor no devolvía nada. Ahora el desplazamiento se desactiva mientras hay un dedo sobre el lienzo. Expresión ya lo hacía para toda la pantalla |
| `c470d9a` | Escritura | **Con un trazo lento, iOS seleccionaba el lienzo como texto:** fondo azul y «Copy \| Translate». Esa selección se quedó colgada a mitad de un trazo y la app dejó de responder hasta reiniciarla. Se desactivan la selección y el menú contextual en los dos lienzos |
| `baa3ea0` + `f97ab24` | Expresión | Desde iOS 26 se vuelve atrás deslizando desde cualquier punto del contenido, así que un trazo hacia la derecha en el lienzo (乀 de 人, 一) cerraba la sesión. `baa3ea0` quitó todo el gesto, pero la pantalla no tiene cabecera y no quedaba forma de salir. `f97ab24` deja sólo el gesto desde el borde (`fullScreenGestureEnabled: false`) |

Además, una mejora pedida durante la prueba:

- **`117c604` (Simulacro):** antes todo avanzaba por reloj, y quien terminaba antes esperaba hasta 38 minutos sin hacer nada. Ahora hay un botón al final de la hoja de respuestas («Pasar a 阅读»), de 阅读 («Terminar 阅读») y de 书写 («Entregar»). Pide confirmación porque no se puede volver atrás. 听力 no lo tiene porque va al ritmo del audio, y el tiempo que sobra no pasa a la fase siguiente.

Capturas en `docs/prueba-integral-2026-11/`.

## Qué funciona

### Registro e inicio de sesión
- **Registro:** una cuenta nueva entra directa en Hoy y se crean `profiles` y `user_settings`.
- **Cerrar sesión:** vuelve a «Welcome back».
- **Inicio de sesión:** funciona con el usuario creado por API.
- iOS ofrece guardar la contraseña; es el comportamiento del sistema.

### Hoy y plan diario
- **Con mazos**, el plan muestra:
  - «10 new words» de la unidad 方位名词;
  - repasos y reaprendizaje;
  - lectura y examen con su motivo cuando no están disponibles.
- **Racha y bloques:** el bloque «1 of 3 blocks completed today» se actualiza tras repasar.
- **Fecha de examen:** se guarda desde You (`exam_date` en la BD).

### Learn y Review (FSRS)
- **Learn:**
  - presenta las nuevas;
  - los intervalos FSRS se ven en los botones (1m/6m/10m/8d en una nueva, 10m/8d/9d/13d en una de repaso);
  - las tarjetas en aprendizaje vuelven a la cola.
- **Deshacer:** devuelve la tarjeta a `new` en la BD. El `review_log` se conserva como histórico.
- **Deslizar a la derecha** equivale a Good.
- **Sin conexión** (gateway parado): se califican tarjetas y la sesión sigue. Al volver la red, los repasos aparecen en `review_log` en menos de 5 s.
- **Review:** sirve las tarjetas vencidas.

### Cards y Words
- **Catálogo de mazos:** se añaden HSK 1 (300) y HSK 2 (203).
- **Words:**
  - 1009 resultados;
  - filtro por nivel (HSK 2 → 203);
  - definiciones en español y botón Add.

### Lecturas
- **Lista:**
  - 48 lecturas;
  - filtros por tema;
  - % conocido y etiqueta de dificultad.
- **Lector:**
  - segmentación por palabra;
  - «Grammar focus»;
  - Traducir y «Leer desde aquí» por frase;
  - Show pinyin;
  - marcador;
  - marcar como leída.
- **Audio por frase:** el reproductor pide al Storage local el clip de cada frase y avanza de una a otra (4 de 9 clips pedidos en unos segundos). Muestra Detener y Continuar.
- **Acepción al tocar una palabra:** sale la ficha con pinyin, la acepción del token, HSK, categoría, tradicional, la frase y «Añadir a Cards». Ver `ee7ba21`.
- **Pregunta inferencial:**
  - al fallarla se muestra la explicación («Ahora son cuatro en casa y la abuela viene a vivir con ellos: serán cinco.»);
  - la nota da 3/4;
  - `reading_attempts` guarda `inferential_score`/`inferential_total`.
- **Offline:** funciona tras `8926ff2`.

### Gramática
- **Catálogo:** 165 puntos por nivel, todos con ejemplos y errores típicos. 56 puntos tienen lecturas enlazadas.
- **Ficha de un punto:**
  - estructura y explicación;
  - ejemplos con pinyin y traducción;
  - errores típicos (incorrecto tachado → correcto → por qué);
  - «Ver también»;
  - «En lecturas», con la frase de la lectura (tras `813b2b3`).

### Ejercicios y unidades
- **Unidad activa:** «Repaso HSK 1», con 8 ejercicios.
- **Opción múltiple:** muestra la corrección y una explicación en español.
- **Registro:** el intento se guarda en `exercise_attempts`.

### Simulacro HSK 2 3.0
- **Antes de empezar:**
  - descarga previa (100 %);
  - instrucciones con los tiempos de cada parte.
- **听力:**
  - cuenta atrás, con indicador «Ahora: instrucciones / ejemplo»;
  - 1–5 con imágenes;
  - 6–15 con banco de letras;
  - 16–25 con opciones en hanzi y pinyin.
  - Las imágenes llegan del Storage tras `99e5b17`.
- **阅读:**
  - 26–30 con imágenes;
  - 31–45 con banco de palabras y ejemplo;
  - 46–50 con texto y tres opciones.
  - La cuadrícula de respondidas de arriba sirvió para ver que faltaban la 41 y la 42.
- **书写:** W1 (51–55, componente que falta) con banco; W2 (56–60) a mano sobre lienzo 米字格 con «Borrar» y «Hecho».
- **Forma A completa**, con el usuario de prueba:
  - 听力 25/25, 阅读 25/25, 书写 5/10 (W1 5/5, W2 0/5): **92 %**;
  - se guarda en `exam_attempt` (`scope = full`, `repeated = false`, 92);
  - con «Terminar antes» (`117c604`) la forma entera llevó 21 minutos en vez de 51;
  - el resultado da el porcentaje por sección y por parte, «La parte que más te arrastra: 书写 2» y el aviso de que el HSK 3.0 aún no ha publicado su escala; nunca dice «aprobado»;
  - al repetir la forma, la pantalla inicial avisa de que el resultado no contará como estimación de nivel.
- **Hicieron falta tres intentos:**
  1. Se perdió al recargar el código. Fast Refresh volvió a ejecutar el efecto de carga y el examen regresó a «Empezar». Es un artefacto de desarrollo, pero confirma el pendiente 2: todo vive en memoria.
  2. Un trazo de 好 en W2 cerró el examen. Corregido en `968a279`.
  3. Completo, pero los trazos verticales en W2 desplazaban la página y el reconocedor no devolvía nada (W2 0/5). Corregido en `7353b06`; ver `13-escritura-examen-desplaza-pagina.png`.
- **W2 tras `7353b06`:** en un cuarto intento, escrito a mano, «Hecho» muestra «Escrito: 好» y «Escrito: 天». La página no se mueve y el servidor los da por buenos: W2 2/5, intento marcado `repeated = true`. Ver `15-escritura-examen-reconocida.png`.
- **Selección del lienzo:** con un trazo lento, iOS seleccionaba el lienzo como texto («Copy | Translate»). Es lo que dejó la app colgada en el segundo intento. Corregido en `c470d9a` y verificado en Expresión con un trazo de un segundo.

### Expresión
- **Escritura en quiz:**
  - lienzo 米字格 con pista del trazo siguiente;
  - reconocimiento trazo a trazo;
  - resultado («你: 1 error, 1 pista»);
  - opción «Practicar con el contorno» (guiada).
- **Qué entra en la cola:** sólo los caracteres de palabras con reconocimiento asentado (estabilidad ≥ 7). Para probarlo se marcaron 9 palabras así en la BD local.
- **Tareas comunicativas sin clave de IA:**
  - se valida la respuesta (sólo caracteres chinos, longitud);
  - se muestra «Sin corregir: la corrección … no está activada. Esta respuesta no cuenta.»;
  - se enseña una respuesta modelo con pinyin y traducción.
  - Ver `00eb444`.

### Progreso y analítica
- **Pantalla «Progreso real»:**
  - retención a 7 y 30 días;
  - vocabulario demostrado (0 de 503, 300 en estudio);
  - unidades (0 de 101);
  - precisión de producción (100 %, 1 de 1);
  - simulacros;
  - errores recurrentes;
  - velocidad de lectura sin pinyin (43 car./min);
  - consultas por 100 caracteres (3.7);
  - comprensión literal e inferencial.
- **Estados vacíos:** son honestos («Aún no hay…»).

## Pendientes (corregidos después)

Los 17 pendientes de la prueba, cada uno con un test que fallaba antes del arreglo. Las migraciones nuevas (`2026112612`, `2026112613`) se aplicaron en local; llegarán a producción con el siguiente push a `master`.

### Grave

1. **iOS 27: la app se cerraba al arrancar.** → `bf4cd79`
   - El SDK de iOS 27 exige el ciclo de vida UIScene; el error era `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, SIGTRAP.
   - Expo pasa de 57.0.9 a 57.0.34, que ya trae `ExpoAppSceneDelegate`. La plantilla de `prebuild` de la SDK 57 (incluso la 57.0.36) sigue sin escenas, así que `apps/mobile/plugins/withSceneLifecycle.js` hace lo que la de la SDK 58: `SceneDelegate`, `AppDelegate` como `ExpoReactNativeFactoryProvider` y `UIApplicationSceneManifest` en `Info.plist`.
   - Verificado con `expo prebuild -p ios --clean`, `xcodebuild` y arrancando en el simulador con iOS 27, sin el parche manual.
   - `react-native-reanimated` (peer opcional de expo-router) se queda en 4.5.3: npm resolvía 4.8.0, que exige worklets 0.14 y rompe `pod install`.
2. **El simulacro en curso se perdía si la app se cerraba.** → `c779b39`
   - Respuestas, fase e instante absoluto de inicio de la fase se guardan en AsyncStorage, por usuario y forma. Al volver se ofrece «Reanudar» (el reloj de pared sigue mandando) o «Empezar de nuevo», con confirmación.
   - Se borra al entregar con éxito y al cerrar sesión; un intento de hace más de un día se descarta.

### Media

3. **«Start learning» en Hoy abría Reviews en modo Review.** → `c07442d` + 4 líneas sin commitear en `CardsScreen.tsx`
   - Hoy pide el modo (`studyModeHref`) y `useRequestedStudyMode` lo aplica.
   - Las líneas que usan los hooks en `CardsScreen.tsx`, y sus dos tests en `CardsScreen.test.tsx`, están sin commitear encima de los cambios del usuario en esos ficheros.
4. **Reviews mostraba contadores viejos tras una sesión.** → `c07442d` + las mismas líneas de `CardsScreen.tsx`
   - `useReloadOnReturn` recarga la cola y los contadores al cerrar una sesión y al volver a la pestaña.
5. **Sin red, la lista de lecturas tardaba 20–25 s en caer a la caché.** → `dc14021`
   - La causa: con el token caducado, `getSession` reintenta el refresco con backoff (≈25 s), y tanto el ámbito de la caché como la petición esperaban a eso.
   - Ahora el ámbito usa el último usuario conocido si `getSession` no contesta en 2 s, y con copia guardada se sirve la caché si la red no contesta en 3 s. Sin copia se sigue esperando a la red.
6. **El punto de gramática 4.1 (固定格式) de HSK 2 y HSK 3 no tenía título.** → `eff019c`
   - El parser del sílabo da a una sección hoja sin título el de su epígrafe padre. Se regeneran los seeds, y la migración `2026112612` corrige las bases existentes.
7. **Salir de Expresión.** → `9221b66` (botón «Salir») y `1059062` + `c3a741c` (la pestaña vuelve al índice; ver 15)

### Menor

8. **Hoy → Exercises decía que no había ejercicios.** → `1c9fdc5`. El paso queda listo, con la meta del día, y abre la sesión de la unidad.
9. **Dos nociones de «unidad».** → `c649f97` (y `5e69fe1`, el contrato de migraciones). La unidad era la misma, pero sin ejercicios propios la sesión se titulaba «Repaso HSK 1». Ahora conserva el nombre de la unidad y dice «Todavía no tiene ejercicios propios: repaso general de HSK 1» (migración `2026112613`). La prueba pgTAP, que ya fallaba antes de llegar a sus aserciones, vuelve a pasar.
10. **Ejercicios enseñaba el identificador interno.** → `7cbd99d`
11. **Lector: la velocidad activa no se marcaba.** → `5d8d3dd`. `Button` sólo pasaba `selected` a la accesibilidad; ahora un secundario seleccionado va en bermellón.
12. **Tarea comunicativa: el aviso de validación no se iba.** → `3255190`
13. **Progreso.** → `ef9e4e5`. La cabecera de sección deja bajar la etiqueta a otra línea, y con alguna respuesta dice «Faltan N respuestas para calcularla».
14. **Simulacro: al pasar de fase, la página no volvía arriba.** → `30ca21b`
15. **Practice se restauraba con Expresión como primera pantalla.** → `1059062` y `c3a741c`. `1059062` sólo arreglaba la entrada por enlace; la verificación manual mostró que por la pestaña seguía abriendo Expresión, y `c3a741c` pone `initialRouteName="index"` en el propio `<Stack>`.
16. **书写 2: «Hecho» no avisaba si no reconocía el dibujo.** → `86293ab`
17. **«Entregar» decía «No podrás volver a esta sección».** → `4303dc2`. Ahora dice «No podrás cambiar tus respuestas.»

## Verificación manual de los arreglos

26-11-2026, en el simulador iPhone 18 Pro con iOS 27, contra el Supabase local, con la app compilada sin el parche manual de `ios/`. Capturas `v*.png` en `docs/prueba-integral-2026-11/`.

| # | Resultado | Qué se hizo |
|---|---|---|
| 1 | Verificado | La app arranca y carga Hoy con iOS 27 (`v01`). |
| 2 | Verificado | Simulacro empezado, respuestas 1C/2B/3A y app cerrada con `simctl terminate`. Al volver salen «Reanudar» y «Empezar de nuevo» (`v02-simulacro-reanudar`); al reanudar están las respuestas y el reloj siguió corriendo (13:23 → 11:55 en 90 s; `v02-simulacro-reanudado`). Después de entregar, la forma ya no ofrece reanudar. El borrado al cerrar sesión no se probó a mano (está cubierto por test). |
| 3 | Verificado | «Start learning» abre Reviews en Learn (`v03`). |
| 4 | Verificado | Tras estudiar 3 tarjetas y cerrar con la X: «10 due / new 291 / review 9» pasa a «7 due / new 288 / review 12» (`v04`). |
| 5 | Verificado | Con `supabase_kong_hanyu` parado, la lista de lecturas en caché aparece en unos 3 s (`v05`). Un filtro sin copia guardada sigue esperando a la red, como estaba previsto. |
| 6 | Verificado | Gramática HSK 2 muestra «固定格式» (`v06`), y el «Grammar focus» de 奶奶要来了 dice «固定格式 · 4.1». |
| 7 | Verificado tras `c3a741c` | «Salir» está en la cabecera (`v07`). Antes de `c3a741c`, «Salir» llevaba a otra pestaña, porque Expresión era la única pantalla de la pila. Ahora vuelve al índice de Practice. |
| 8 | Verificado | El paso Exercises de Hoy está listo, con barra de progreso y «Start exercises» (`v08`). |
| 9 | Verificado | «Unidad activa: 方位名词 · Todavía no tiene ejercicios propios: repaso general de HSK 1» (`v09`). |
| 10 | Verificado | Sólo «1/8», sin identificador (`v10`). |
| 11 | Verificado | La velocidad activa (1x, luego 1.25x) va en bermellón (`v11`). |
| 12 | Verificado | «wo bu neng qu» da el aviso de caracteres chinos; al borrar una letra desaparece (`v12-tarea-aviso`, `v12-tarea-aviso-se-va`). Para llegar a la tarea se bajó un momento, en la BD local, la estabilidad de las palabras que abren la escritura (y se restauró), y se denegó el permiso de reconocimiento de voz. |
| 13 | Verificado | La etiqueta baja de línea entera (`v13-progreso-etiqueta`) y la comprensión dice «Faltan 2/4 respuestas para calcularla» (`v13-progreso-faltan`). |
| 14 | Verificado | Desde el final de la hoja de respuestas, 阅读 empieza arriba (`v14-lectura-arriba`); lo mismo 书写 desde el final de 阅读 (`v14-escritura-arriba`). |
| 15 | Falla → corregido en `c3a741c` | Tras `1059062`, la pestaña Practice seguía abriendo Expresión como única pantalla, y tocarla otra vez no hacía nada. Causa: al declarar `<Stack.Screen name="expression">`, expo-router la pone la primera de la pila, y `unstable_settings.initialRouteName` sólo lo usan los enlaces. Con `c3a741c`, Practice abre su índice y tocar la pestaña desde Expresión vuelve a él (`v15`). |
| 16 | Verificado | Garabato y «Hecho»: «No se ha reconocido ningún carácter. Borra y escríbelo otra vez.»; «Hecho» sin dibujar: «Escribe el carácter antes de pulsar «Hecho».» (`v16`). |
| 17 | Verificado | «¿Entregar el simulacro? No podrás cambiar tus respuestas.» (`v17`). |

**Bugs nuevos encontrados y corregidos:**

- `c3a741c`: la pestaña Practice abría Expresión (el punto 15 de arriba).
- `a8ca210`: Progreso decía «Último simulacro: 92 %» y, más abajo, «Aún no has realizado simulacros de examen». La fila «Rendimiento en simulacros» contaba los ejercicios del simulacro antiguo, retirado en el Plan 12. Ahora da la media de los simulacros completos (`v18`).

**Observaciones, sin corregir:**

- En 书写 1, los caracteres con el hueco tardan unos 4 s en aparecer al entrar en la fase; mientras tanto sólo se ve el pinyin.
- El subtítulo gris de los botones primarios («8d» en Easy, «Di la palabra en voz alta» en Hablar) apenas se lee sobre el bermellón.
- En este simulador el reconocimiento de voz ya está disponible, pero quedó **denegado** para Hanyu tras la prueba del punto 12. Para probar la pronunciación hay que reactivarlo en Ajustes → Privacidad.
- Datos de prueba que quedan en la BD local: 3 tarjetas aprendidas y un intento de la forma B (3 %).

## No se pudo probar

- **Pronunciación con micrófono.**
  - En el simulador el reconocedor de voz no aparece como disponible, así que la sesión de Expresión no incluye ejercicios de pronunciación; respeta la regla del Plan 6 de no ofrecer lo que no se puede corregir.
  - `xcrun simctl privacy … grant microphone` falló con «Operation not permitted».
  - Hay que probarlo en un dispositivo físico.
- **Recuperar contraseña:** hace falta el correo de Mailpit (puerto 56324) y un enlace a la app. No se recorrió.
- **El gesto de volver desde el borde:** las herramientas del simulador no lo reproducen; tampoco en pantallas sin cambios. Se comprobó en el código de react-native-screens 4.26 que `fullScreenGestureEnabled: false` sólo desactiva `interactiveContentPopGestureRecognizer`.
- **Edge Functions con IA real:** no hay claves y no se deben usar las del usuario.

## Cómo reproducir

```bash
npx -y supabase@3.4.0 start          # con supabase/config.jsonc local (puertos 563xx)
npx -y supabase@3.4.0 db reset
SUPABASE_URL=http://127.0.0.1:56321 SUPABASE_SERVICE_ROLE_KEY=<service_role local> node scripts/sync-media.js
npx -y supabase@3.4.0 functions serve
```

1. Crear `apps/mobile/.env.local` con la URL local y la anon key local.
2. Ejecutar `npx expo prebuild -p ios` (el plugin `withSceneLifecycle` ya añade las escenas de iOS 27). El prebuild cambia los scripts `ios`/`android` de `apps/mobile/package.json`: no lo commitees.
3. Instalar los pods con `LANG=en_US.UTF-8 EXPO_USE_PRECOMPILED_MODULES=0 pod install`.
4. Compilar con `xcodebuild` y arrancar Metro con `npx expo start`.
