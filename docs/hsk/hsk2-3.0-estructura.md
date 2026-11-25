# HSK 2 con formato 3.0: estructura de la muestra oficial

Transcripción de la estructura del examen para el simulacro (Plan 12). De la muestra
**solo se toma la estructura**: aquí no hay ninguna pregunta, imagen, audio ni la clave
de respuestas, porque es material con copyright. El fichero que lee el código es
`server/db/seeds/exam-structure.json`, y `scripts/exam-structure-contract.test.js`
comprueba que cuadra con lo de aquí.

## Fuentes

- **Página:** https://www.chinesetest.cn/syllabus, enlace «Sample Questions».
- **Zip oficial:** https://hsk-sample-1409982902.cos.ap-beijing.myqcloud.com/HSK3.0.zip
  (HTTP 200, 395 322 335 bytes, Last-Modified 9-sep-2026), consultado el 25-nov-2026.
  Del zip se leyeron por rangos solo tres ficheros:
  - `HSK/HSK（二级）样卷.pdf`: 19 páginas, creado el 15-jul-2026 con WPS. Lo edita el 中外语言交流合作中心.
  - `HSK/HSK（二级）样卷答案.pdf`: clave de respuestas. Se usó solo para confirmar cuántas opciones gasta el ejemplo de cada grupo.
  - `HSK/音频/HSK（二级）样卷.mp3`: 17:48,6, 128 kb/s.
- **Programa:** «HSK 考试大纲», publicado en 2025-11 y en vigor desde 2026-07
  (https://hsk.cn-bj.ufileos.com/3.0/新版HSK考试大纲1219.pdf). Trae tareas, temas, vocabulario,
  caracteres y gramática, pero **no el formato del examen**.
- **Fecha de inicio:** el HSK 3.0 empieza en todo el mundo el 13-dic-2026 (cuenta oficial @HSKTestOfficial).
- **Puntuación:** ni la muestra ni el programa dan puntuación máxima ni nota de aprobado.
  Por eso `official_scale` es `null`.

## Portada de la muestra

Según la portada, el examen tiene tres secciones y 60 preguntas en total:
- 听力: 25 preguntas, unos 17 minutos.
- 阅读: 25 preguntas, 25 minutos.
- 书写: 10 preguntas, 10 minutos.

Después de 听力 hay 3 minutos para pasar las respuestas a la hoja. El examen dura unos
60 minutos, incluidos 5 minutos para que el candidato rellene sus datos.

17 + 3 + 25 + 10 + 5 = 60 minutos.

## Partes

Todo texto impreso lleva pinyin encima. Las letras de las opciones van de A a F.

| Parte | Preguntas | Estímulo | Respuesta | Grupo |
|---|---|---|---|---|
| L1 听力 1 | 1–5 (5) | frase en audio, no impresa | 1 de 3 imágenes propias de la pregunta (A/B/C) | 1 pregunta; el ejemplo tiene su propia fila de 3 imágenes |
| L2 听力 2 | 6–15 (10) | diálogo corto en audio (2 turnos) | imagen del grupo | grupo 1 (6–10): 6 imágenes A–F, el ejemplo gasta una; grupo 2 (11–15): 5 imágenes A–E, sin ejemplo |
| L3 听力 3 | 16–25 (10) | diálogo de 2 turnos y pregunta en audio | 1 de 3 respuestas impresas con pinyin | 1 pregunta |
| R1 阅读 1 | 26–30 (5) | frase impresa | imagen del grupo | 6 imágenes A–F, el ejemplo gasta una |
| R2 阅读 2 | 31–35 (5) | frase o minidiálogo A/B con un hueco （ ） | palabra del banco | banco común de 6 palabras A–F, el ejemplo gasta una |
| R3 阅读 3 | 36–45 (10) | frase | su respuesta o continuación china | grupo 1 (36–40): 6 opciones A–F, el ejemplo gasta una; grupo 2 (41–45): 5 opciones A–E, sin ejemplo |
| R4 阅读 4 | 46–50 (5) | texto corto (1–2 frases) y pregunta con ★ | 1 de 3 respuestas impresas | 1 pregunta |
| W1 书写 1 | 51–55 (5) | palabra de 2 caracteres con pinyin; a uno de los caracteres le falta un componente (se ve el resto del carácter y un hueco) | componente del banco | banco de 6 componentes A–F, el ejemplo gasta uno |
| W2 书写 2 | 56–60 (5) | frase con pinyin completo y un hueco （ ） | escribir a mano el carácter que falta | 1 pregunta |

Observaciones:
- Ninguna parte se responde con ✓/✗.
- En L2, R1, R2, R3 y W1 cada opción del grupo se usa como mucho una vez.
- En W1 el componente que falta puede ir a la izquierda, arriba, abajo o como cubierta.
  En el ejemplo de la muestra, 亻 + 十 forma un carácter conocido.
- En W2 el hueco puede ser cualquiera de los dos caracteres de una palabra.
- La clave oficial numera 书写 como 54–58 y 59–63. Es una errata del PDF: las preguntas son 51–60.

## Audio de 听力 (medido en el mp3)

Método:
- Detección de silencios con `ffmpeg silencedetect` a −40 dB, con silencios de 1,5 s o más (0,6 s para las instrucciones).
- Transcripción con whisper (`large-v3-turbo`) para saber qué se dice en cada tramo.
- Nadie escuchó el audio de oído. Los segundos son del mp3, y las medianas se calculan sobre todos los ítems de la parte.

| Tramo | Segundos del mp3 | Contenido |
|---|---|---|
| Inicio | 0,0–28,8 | sonido sin habla reconocible (whisper inventa texto); probablemente una sintonía de inicio |
| Saludo | 30,0–45,8 | bienvenida al examen, repetida tres veces |
| Instrucción general | 45,8–58,7 | 听力 tiene tres partes y 25 preguntas; empieza la prueba |
| Instrucción de L1 | 60,0–72,6 (12,6 s) | parte y números de pregunta, la tarea, «cada pregunta se oye dos veces» y «por ejemplo» |
| Ejemplo de L1 | 72,6–83,3 | dos reproducciones, seguidas de 8,4 s de pausa |
| Aviso de inicio (pregunta 1) | 91,7–94,3 | seguido de 3,4 s de pausa |
| Ítems 1–5 | 97,7–190,9 | número del ítem, reproducción, pausa, reproducción y pausa larga |
| Instrucción de L2 | 190,9–203,7 (12,8 s) | igual que la de L1, con la tarea de L2 |
| Ejemplo de L2 | 203,7–216,7 | dos reproducciones, seguidas de 12,3 s de pausa |
| Aviso de inicio (preguntas 6–10) | 229,0–232,3 | seguido de 3,2 s de pausa |
| Ítems 6–15 | 235,5–525,5 | el grupo 2 (11–15) empieza sin instrucción propia, solo con el número del ítem |
| Instrucción de L3 | 525,5–537,9 (12,4 s) | igual que la de L1, con la tarea de L3 |
| Ejemplo de L3 | 537,9–562,1 | diálogo + pregunta, dos veces, seguidos de 15,2 s de pausa |
| Aviso de inicio (pregunta 16) | 577,3–580,0 | seguido de 3,3 s de pausa |
| Ítems 16–25 | 580,0–1045,0 | cada reproducción es el diálogo + la pregunta |
| Cierre | 1045,0–1048,1 | fin de 听力 |
| Silencio final | 1048,1–1068,6 | |

Tiempos por ítem (mediana, con el mínimo y el máximo entre paréntesis):

| Parte | Veces que suena | Pausa entre reproducciones | Pausa entre diálogo y pregunta | Pausa tras el ítem |
|---|---|---|---|---|
| L1 | 2 | 2,2 s (2,1–2,3) | — | 8,3 s (8,2–8,6) |
| L2 | 2 | 2,1 s (2,1–2,3) | — | 12,2 s (12,1–12,9) |
| L3 | 2 | 2,1 s (2,0–2,3) | 2,1 s | 15,1 s (15,0–15,8) |

Cada ítem empieza con su número leído en voz alta.
Duración total: 1 068,6 s = 17:48,6, que cuadra con el «约 17 分钟» de la portada.
