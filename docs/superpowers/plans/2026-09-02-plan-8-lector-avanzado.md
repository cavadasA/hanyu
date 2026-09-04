# Plan 8 — El lector: leer por frases, y que leer cambie el plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el lector deje de ser un bloque de texto con pinyin duplicado y pase a leerse frase a frase, con traducción, notas y colores que dicen qué sabes y qué no.

**Architecture:** El Plan 7 dejó diez lecturas cuya unidad es **la frase**: cada una trae su chino, su pinyin y su español. La pantalla todavía no lo sabe y sigue pintando el texto entero de una vez, con un bloque global de pinyin encima y otro pinyin bajo cada token. Este plan cambia la unidad de render de «lectura» a «frase», y sobre esa base cuelga lo demás: traducción al tocar, notas de gramática, colores por estado de la palabra, cobertura antes de abrir, y audio que sigue la frase que suena.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase, `expo-speech`.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 7** (catálogo con `sentences`) y del **4B** (`word_context`, `sentenceOf`), ambos ejecutados. La Tarea 5 depende además del **5B**, que **no** está ejecutado: sin `rankContent` no hay recomendación.
- **Prohibido escribir mitigaciones.**
- **No se finge precisión que no se tiene.** Ni en la desambiguación de sentidos ni en la sincronización del audio: donde el dato no da, se muestra la incertidumbre en vez de elegir por el usuario.

## Estado de partida verificado (2 de septiembre de 2026)

Medido con 1A, 1B, 1C, 2, 3, 4A, 4B, 5A y 7 ejecutados:

- **El catálogo ya está por frases.** Las diez lecturas tienen `sentences` —nueve por lectura en la primera— con `zh`, `pinyin` y `es`, y tres preguntas con `evidence_sentence`.
- **La pantalla no lo usa.** `ReadingDetailScreen` sigue consumiendo `reading.pinyin_text` y `reading.tokens`: el modelo anterior al Plan 7.
- **§6.14 sigue abierto, y es literal.** La línea 119 pinta `reading.pinyin_text` como bloque completo, y `ReadingText.tsx:44` pinta además el pinyin debajo de cada token. Activar «Show pinyin» lo muestra **dos veces**.
- **§6.13 sigue abierto.** `ReadingText.tsx:42` pinta todos los tokens que no son puntuación con `colors.vermilion`. Una palabra que dominas y una que no has visto nunca salen idénticas.
- El Plan 4B ya dejó `sentenceOf` y `word_context`, así que la frase de origen se captura al añadir una palabra. Lo que falta es que la frase se **lea** como unidad.

## Dos cosas que no se pueden hacer bien, y qué se hace en su lugar

Conviene decidirlas antes de las tareas, porque las dos invitan a fingir.

**La desambiguación de sentidos (§6.12).** El tokenizador toma la primera coincidencia de igual longitud, así que al tocar `还` puede mostrar `hái` («todavía») cuando el texto dice `huán` («devolver»). Elegir bien pide análisis sintáctico, y adivinar por frecuencia acertaría casi siempre y fallaría en silencio justo en las palabras que más importan, que son las ambiguas. **Lo que se hace: mostrar todas las acepciones**, con la del nivel de la lectura primero. Es más honesto y además enseña que la forma tiene dos lecturas, que es exactamente lo que hay que aprender.

**El resaltado tipo karaoke.** `expo-speech` no entrega marcas de tiempo por palabra de forma fiable en ambas plataformas, y el audio humano —que sí las permitiría— no existe todavía: el Plan 7 dejó `audio_kind` en `'tts'`. **Lo que se hace: resaltar la frase que suena**, no la palabra. Se reproduce frase a frase, así que la sincronización es exacta por construcción en vez de estimada. Cuando haya grabación humana con timings, la misma interfaz baja a palabra sin rehacerse.

## File Structure

**Se crean:**
- `apps/mobile/src/readings/ReadingSentence.tsx`, `ReadingSentence.test.tsx`
- `apps/mobile/src/readings/GrammarNote.tsx`
- `packages/domain/src/reading/coverage.ts`, `coverage.test.ts`
- `supabase/migrations/2026090211_reading_progress.sql`

**Se modifican:**
- `apps/mobile/src/readings/ReadingText.tsx`, `WordSheet.tsx`
- `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `ReadingsScreen.tsx`
- `packages/data/src/repositories/readings.ts`, `types.ts`, `factory.ts`

---

## Task 1: La unidad de lectura es la frase

**Files:**
- Create: `apps/mobile/src/readings/ReadingSentence.tsx`, `ReadingSentence.test.tsx`
- Modify: `apps/mobile/src/readings/ReadingText.tsx`, `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `packages/data/src/types.ts`

**Interfaces:**
- Consumes: `reading.sentences` (Plan 7).
- Produces: `ReadingDetail.sentences: Array<{ zh, pinyin, es, tokens }>`. La consumen todas las tareas siguientes.

Aquí se arregla el pinyin duplicado, y no quitando uno de los dos sitios: **el bloque global desaparece porque deja de tener sentido**. Con el texto partido en frases, el pinyin vive junto a su frase.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/readings/ReadingSentence.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReadingSentence } from './ReadingSentence';

const sentence = {
  zh: '咖啡比茶贵。',
  pinyin: 'Kāfēi bǐ chá guì.',
  es: 'El café es más caro que el té.',
  tokens: [
    { id: 't0', text: '咖啡', type: 'word' as const, word: { id: 1, hanzi: '咖啡', pinyin: 'kāfēi' } },
    { id: 't1', text: '比', type: 'word' as const, word: { id: 2, hanzi: '比', pinyin: 'bǐ' } },
    { id: 't2', text: '。', type: 'punctuation' as const, word: null },
  ],
};

describe('ReadingSentence', () => {
  it('muestra el pinyin una sola vez, junto a su frase', async () => {
    // Antes había un bloque global de pinyin y otro bajo cada token: activar
    // "Show pinyin" lo mostraba dos veces.
    await render(<ReadingSentence sentence={sentence} showPinyin onSelectToken={jest.fn()} />);

    expect(screen.getAllByText('Kāfēi bǐ chá guì.')).toHaveLength(1);
  });

  it('no muestra pinyin cuando está desactivado', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByText('Kāfēi bǐ chá guì.')).toBeNull();
  });

  it('avisa de qué token se ha tocado', async () => {
    const onSelectToken = jest.fn();
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={onSelectToken} />);

    await fireEvent.press(screen.getByLabelText('比'));

    expect(onSelectToken).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('la puntuación no es pulsable', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByLabelText('。')).toBeNull();
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```tsx
// apps/mobile/src/readings/ReadingSentence.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { tokens as t } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export interface Sentence {
  zh: string;
  pinyin: string;
  es: string;
  tokens: ReadingToken[];
}

interface Props {
  sentence: Sentence;
  showPinyin: boolean;
  onSelectToken(token: ReadingToken): void;
}

export function ReadingSentence({ sentence, showPinyin, onSelectToken }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.sentence}>
      <View style={styles.line}>
        {sentence.tokens.map((token) =>
          token.type === 'punctuation' ? (
            // La puntuación no es pulsable: no hay ficha que abrir y capturarla
            // convertiría cada coma en un objetivo táctil que estorba.
            <Text key={token.id} style={[styles.token, { color: colors.text }]}>
              {token.text}
            </Text>
          ) : (
            <Pressable
              key={token.id}
              accessibilityRole="button"
              accessibilityLabel={token.text}
              onPress={() => onSelectToken(token)}
            >
              <Text style={[styles.token, { color: colors.vermilion }]}>{token.text}</Text>
            </Pressable>
          ),
        )}
      </View>

      {/* Una sola vez y junto a su frase. El bloque global de pinyin que había
          en ReadingDetailScreen desaparece: con el texto partido en frases ya
          no tiene dónde ir sin duplicarse. */}
      {showPinyin ? (
        <Text style={[styles.pinyin, { color: colors.textMuted }]}>{sentence.pinyin}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sentence: { marginBottom: t.spacing.md },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  token: { fontSize: t.fontSize.xl, lineHeight: 38 },
  pinyin: { fontSize: t.fontSize.xs, marginTop: 2 },
});
```

`ReadingText` pasa a mapear `sentences` a `ReadingSentence` en vez de recorrer una lista plana de tokens, y conserva el `WordSheet` que ya abría.

En `ReadingDetailScreen`, **borra el bloque de las líneas 119–121** —el `reading.pinyin_text` completo— y pasa `showPinyin` a `ReadingText`. `pinyin_text` desaparece de `ReadingDetail`: con las frases tokenizadas ya no hay nada que guarde.

La tokenización por frase la hace el repositorio al cargar, reutilizando `tokenizeReading` que el Plan 7 movió a `packages/domain`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src/readings apps/mobile/src/screens/ReadingDetailScreen.tsx packages/data/src
git commit -m "feat(readings): el lector renderiza por frases y el pinyin deja de duplicarse"
```

---

## Task 2: Traducción al tocar, y la nota de gramática

**Files:**
- Create: `apps/mobile/src/readings/GrammarNote.tsx`
- Modify: `apps/mobile/src/readings/ReadingSentence.tsx`, `packages/data/src/repositories/readings.ts`

**Interfaces:**
- Consumes: `sentence.es` (Plan 7), `reading.target_grammar` y `grammar_points` (Plan 1B).

La traducción se muestra **al tocar la frase**, no siempre. Enseñarla de continuo convierte la lectura en lectura del español con el chino al lado; esconderla del todo deja al usuario atascado. Tocar es la mitad correcta: el esfuerzo se hace primero y la comprobación llega después.

Las notas no se escriben: el Plan 7 hace que cada lectura declare `target_grammar` con códigos del sílabo, y el 1B importó los 165 puntos con su título y clasificación.

- [ ] **Step 1: Write the failing test**

```tsx
  it('muestra la traducción solo al tocar la frase', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByText('El café es más caro que el té.')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Traducir la frase'));

    expect(screen.getByText('El café es más caro que el té.')).toBeTruthy();
  });

  it('vuelve a esconderla al tocar otra vez', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    await fireEvent.press(screen.getByLabelText('Traducir la frase'));
    await fireEvent.press(screen.getByLabelText('Traducir la frase'));

    expect(screen.queryByText('El café es más caro que el té.')).toBeNull();
  });
```

```tsx
// GrammarNote
  it('nombra el punto de gramática que la lectura practica', async () => {
    await render(<GrammarNote points={[{ code: '6.3.4', title: '比较句', category: '句子' }]} />);

    expect(screen.getByText('比较句')).toBeTruthy();
  });

  it('no ocupa sitio cuando la lectura no declara gramática', async () => {
    const { toJSON } = render(<GrammarNote points={[]} />);

    expect(toJSON()).toBeNull();
  });
```

- [ ] **Step 2: Write minimal implementation**

`ReadingSentence` gana un estado local `translated` y un botón accesible sobre la frase. `getReading` trae los puntos de `grammar_points` cuyo `code` esté en `target_grammar`, y `ReadingDetailScreen` los pasa a `GrammarNote`, que se pinta bajo el título.

`GrammarNote` devuelve `null` con la lista vacía en lugar de una tarjeta vacía: una lectura sin gramática declarada no debe dejar un hueco.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src/readings packages/data/src
git commit -m "feat(readings): traducción por frase al tocar y nota de gramática de la lectura"
```

---

## Task 3: Cada palabra dice lo que es

**Files:**
- Modify: `apps/mobile/src/readings/ReadingSentence.tsx`, `WordSheet.tsx`, `packages/data/src/repositories/readings.ts`

**Interfaces:**
- Consumes: `learner_skill_state` (Plan 1C), `word_context` (Plan 4B).
- Produces: `ReadingToken.status: 'known' | 'learning' | 'target' | 'unknown'`.

§6.13: hoy todas las palabras salen del mismo color. Cuatro estados, y cada uno responde a una pregunta distinta del lector:

| Estado | Qué significa | Por qué importa |
|---|---|---|
| `known` | Estabilidad alta en reconocimiento | Es el texto que puedes leer de corrido |
| `learning` | Tiene tarjeta, aún no asentada | Verla en contexto es justo lo que la asienta |
| `target` | La lectura la declara objetivo | Es a lo que vienes |
| `unknown` | Sin tarjeta | Candidata a añadir |

- [ ] **Step 1: Write the failing test**

```tsx
  it('distingue visualmente los cuatro estados', async () => {
    const tokens = [
      { id: 't0', text: '我', type: 'word', status: 'known', word: { id: 1 } },
      { id: 't1', text: '咖啡', type: 'word', status: 'learning', word: { id: 2 } },
      { id: 't2', text: '比', type: 'word', status: 'target', word: { id: 3 } },
      { id: 't3', text: '图书馆', type: 'word', status: 'unknown', word: null },
    ];

    await render(
      <ReadingSentence sentence={{ ...sentence, tokens }} showPinyin={false} onSelectToken={jest.fn()} />,
    );

    const colors = tokens.map((t) => screen.getByLabelText(t.text).props.style.color);
    expect(new Set(colors).size).toBe(4);
  });

  it('marca como desconocida la palabra sin tarjeta', async () => {
    // El estado no es un adorno: es lo que dice al usuario qué le falta.
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.getByLabelText('图书馆').props.accessibilityHint).toMatch(/no está/i);
  });
```

Y en `WordSheet`, la decisión sobre los sentidos:

```tsx
  it('muestra todas las acepciones cuando la forma tiene varias', async () => {
    // Elegir una por frecuencia acertaría casi siempre y fallaría en silencio
    // justo en las palabras ambiguas, que son las que hay que aprender.
    const senses = [
      { id: 1, hanzi: '还', pinyin: 'hái', sense_index: null, meaning_es: 'todavía; aún', hsk_level: 1 },
      { id: 2, hanzi: '还', pinyin: 'huán', sense_index: null, meaning_es: 'devolver', hsk_level: 3 },
    ];

    await render(<WordSheet text="还" senses={senses} readingLevel={2} sentence={null} readingId="r1" onClose={jest.fn()} />);

    expect(screen.getByText('hái')).toBeTruthy();
    expect(screen.getByText('huán')).toBeTruthy();
  });

  it('pone primero la acepción del nivel de la lectura', async () => {
    const senses = [
      { id: 2, hanzi: '还', pinyin: 'huán', meaning_es: 'devolver', hsk_level: 3 },
      { id: 1, hanzi: '还', pinyin: 'hái', meaning_es: 'todavía; aún', hsk_level: 1 },
    ];

    await render(<WordSheet text="还" senses={senses} readingLevel={2} sentence={null} readingId="r1" onClose={jest.fn()} />);

    expect(screen.getAllByLabelText(/acepción/)[0].props.children).toContain('hái');
  });
```

- [ ] **Step 2: Write minimal implementation**

`getReading` resuelve el estado de cada token consultando `learner_skill_state` para las palabras de la lectura, y marca como `target` las que estén en `reading.target_words`. Los colores salen del tema: `known` en `colors.textMuted` —deliberadamente apagado, porque lo que ya sabes no debe reclamar atención—, `learning` en `colors.gold`, `target` en `colors.vermilion`, `unknown` en `colors.text` con subrayado punteado.

`WordSheet` pasa de recibir un `word` a recibir `senses`, ordenadas por cercanía al nivel de la lectura. Cada acepción muestra su pinyin y su glosa, y cada una tiene su propio botón de añadir: son tarjetas distintas.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src/readings packages/data/src
git commit -m "feat(readings): estado por palabra en el texto y todas las acepciones en la ficha"
```

---

## Task 4: Cuánto vas a entender antes de abrir

**Files:**
- Create: `packages/domain/src/reading/coverage.ts`, `coverage.test.ts`
- Modify: `apps/mobile/src/screens/ReadingsScreen.tsx`, `packages/data/src/repositories/readings.ts`

**Interfaces:**
- Produces: `coverageOf(tokens, known): { ratio, known_count, unknown_count }`.

`CoverageToken` es `{ word_id: number | null; type }` y no el `ReadingToken` de la app, que lleva el objeto `word` entero. La conversión la hace quien llama —`tokens.map((t) => ({ word_id: t.word?.id ?? null, type: t.type }))`— para que la función sea pura y se pueda probar sin construir palabras completas.

Saber que una lectura tiene un 95 % de palabras conocidas antes de abrirla es la diferencia entre elegir y probar suerte.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/reading/coverage.test.ts
import { coverageOf } from './coverage';

describe('coverageOf', () => {
  const tokens = [
    { word_id: 1, type: 'word' as const },
    { word_id: 2, type: 'word' as const },
    { word_id: 3, type: 'word' as const },
    { word_id: null, type: 'punctuation' as const },
  ];

  it('no cuenta la puntuación como vocabulario', () => {
    // Contarla inflaría la cobertura de cualquier texto con muchas comas.
    expect(coverageOf(tokens, new Set([1, 2, 3])).ratio).toBe(1);
  });

  it('calcula la proporción de palabras conocidas', () => {
    expect(coverageOf(tokens, new Set([1, 2])).ratio).toBeCloseTo(2 / 3);
  });

  it('cuenta cada forma repetida una sola vez', () => {
    // Una lectura que repite 我 veinte veces no es más conocida por eso.
    const repeated = [
      { word_id: 1, type: 'word' as const },
      { word_id: 1, type: 'word' as const },
      { word_id: 9, type: 'word' as const },
    ];

    expect(coverageOf(repeated, new Set([1])).ratio).toBeCloseTo(0.5);
  });

  it('devuelve cobertura cero sin reventar en un texto sin palabras', () => {
    expect(coverageOf([{ word_id: null, type: 'punctuation' }], new Set()).ratio).toBe(0);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/reading/coverage.ts
//
// Qué porcentaje de la lectura reconoces antes de abrirla. Se cuenta por forma
// distinta y no por aparición: un texto que repite 我 veinte veces no es más
// comprensible por eso, y contarlo por aparición inflaría la cifra justo en los
// textos más simples.
export interface CoverageToken {
  word_id: number | null;
  type: 'word' | 'unknown' | 'punctuation';
}

export interface Coverage {
  ratio: number;
  known_count: number;
  unknown_count: number;
}

export function coverageOf(tokens: readonly CoverageToken[], known: ReadonlySet<number>): Coverage {
  const forms = new Set<number>();
  let unknownForms = 0;

  for (const token of tokens) {
    if (token.type === 'punctuation') continue;

    if (token.word_id === null) {
      unknownForms += 1;
      continue;
    }

    forms.add(token.word_id);
  }

  const total = forms.size + unknownForms;
  if (total === 0) {
    return { ratio: 0, known_count: 0, unknown_count: 0 };
  }

  let knownCount = 0;
  for (const id of forms) {
    if (known.has(id)) knownCount += 1;
  }

  return {
    ratio: knownCount / total,
    known_count: knownCount,
    unknown_count: total - knownCount,
  };
}
```

En `ReadingsScreen`, cada tarjeta de la lista muestra la cobertura como porcentaje y las palabras nuevas que trae. El rango cómodo del Plan 5B —92 a 97 %— se marca visualmente; por debajo, la lectura se etiqueta como difícil en vez de esconderse. Esconderla decidiría por el usuario.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain/src/reading apps/mobile/src/screens/ReadingsScreen.tsx packages/data/src
git commit -m "feat(readings): cobertura conocida de cada lectura antes de abrirla"
```

---

## Task 5: Audio que sigue la frase

**Files:**
- Modify: `apps/mobile/src/screens/ReadingDetailScreen.tsx`, `apps/mobile/src/readings/ReadingSentence.tsx`, `apps/mobile/src/audio/useSpeech.ts`

**Interfaces:**
- Consumes: `reading.audio_kind` (Plan 7).

Reproducción frase a frase, con la que suena resaltada, control de velocidad, y la posibilidad de tocar una frase para empezar por ahí. **La sincronización es exacta por construcción**: no se estima dónde va el audio, se reproduce una frase y se sabe cuál.

- [ ] **Step 1: Write the failing test**

```tsx
  it('resalta la frase que está sonando', async () => {
    await renderDetail();
    await fireEvent.press(screen.getByLabelText('Reproducir'));

    expect(screen.getByTestId('sentence-0').props.accessibilityState.selected).toBe(true);
  });

  it('empieza por la frase que se toca', async () => {
    await renderDetail();
    await fireEvent.press(screen.getByLabelText('Leer desde aquí', { exact: false }));

    expect(mockSpeak).toHaveBeenCalledWith(expect.stringContaining('咖啡比茶贵'), expect.anything());
  });

  it('aplica la velocidad elegida', async () => {
    await renderDetail();
    await fireEvent.press(screen.getByText('0.75x'));
    await fireEvent.press(screen.getByLabelText('Reproducir'));

    expect(mockSpeak).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rate: 0.75 }));
  });

  it('para al salir de la pantalla', async () => {
    // Un audio que sigue sonando en otra pantalla es un fallo, no una función.
    const { unmount } = await renderDetail();
    await fireEvent.press(screen.getByLabelText('Reproducir'));
    unmount();

    expect(mockStop).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Write minimal implementation**

```ts
// apps/mobile/src/audio/useSpeech.ts — añadir a lo que ya hay
/**
 * Reproduce frase a frase y avisa de cuál suena.
 *
 * La sincronización es exacta por construcción: no se estima por dónde va el
 * audio, se reproduce una frase y se sabe cuál es. Con marcas de tiempo por
 * palabra —que expo-speech no da de forma fiable— esto bajaría a palabra sin
 * cambiar la interfaz.
 */
export function speakSentences(
  sentences: readonly string[],
  fromIndex: number,
  options: { rate: number; onSentence(index: number | null): void },
) {
  let cancelled = false;

  function next(index: number) {
    if (cancelled || index >= sentences.length) {
      options.onSentence(null);
      return;
    }

    options.onSentence(index);
    Speech.speak(sentences[index], {
      rate: options.rate,
      onDone: () => next(index + 1),
      onStopped: () => options.onSentence(null),
      onError: () => options.onSentence(null),
    });
  }

  next(fromIndex);

  return () => {
    cancelled = true;
    Speech.stop();
  };
}
```

`ReadingDetailScreen` guarda el índice activo y el cancelador que devuelve la función, pasa el índice a `ReadingText` para que la frase se resalte, y llama al cancelador en la limpieza del efecto.

Las velocidades son tres —0,75x, 1x y 1,25x— y no un deslizador: tres opciones se eligen de un toque y cubren el rango útil.

El `useEffect` de limpieza llama a `stop()` al desmontar.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src
git commit -m "feat(readings): audio por frases con resaltado, velocidad y punto de inicio"
```

---

## Task 6: Progreso, marcadores y offline

**Files:**
- Create: `supabase/migrations/2026090211_reading_progress.sql`
- Modify: `packages/data/src/repositories/readings.ts`, `apps/mobile/src/screens/ReadingsScreen.tsx`, `ReadingDetailScreen.tsx`

**Interfaces:**
- Produces: `reading_progress` y las funciones `markRead`, `toggleBookmark`, `getReadingProgress`.

Lo que cierra el bucle del maestro: **una lectura cambia de forma medible el plan posterior**. Terminarla registra un `learning_event`, y el planificador del 5B lo usa para no volver a proponerla.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090211_reading_progress.sql
--
-- Sin esto el planificador no puede evitar repetir una lectura ni saber por
-- dónde iba el usuario, y "seen_recently" de la función de valor del Plan 5B
-- no tiene de dónde salir.
create table if not exists public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reading_slug text not null references public.reading(slug) on delete cascade,
  bookmarked boolean not null default false,
  -- Índice de la última frase leída, para reanudar donde se dejó.
  last_sentence integer not null default 0,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, reading_slug)
);

create index if not exists idx_reading_progress_finished
  on public.reading_progress(user_id, finished_at desc);

alter table public.reading_progress enable row level security;

drop policy if exists reading_progress_select_own on public.reading_progress;
create policy reading_progress_select_own on public.reading_progress
for select using (user_id = auth.uid());

drop policy if exists reading_progress_write_own on public.reading_progress;
create policy reading_progress_write_own on public.reading_progress
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Write the failing test**

```ts
  it('marcar como leída registra el evento que el planificador consulta', async () => {
    const client = progressClient();

    await markRead('shop-01-tea-and-coffee', client);

    expect((client as any).chains.learning_event.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reading_completed' }),
    );
  });

  it('el marcador se puede quitar', async () => {
    const client = progressClient({ bookmarked: true });

    await toggleBookmark('shop-01-tea-and-coffee', client);

    expect((client as any).chains.reading_progress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarked: false }),
      expect.anything(),
    );
  });

  it('recuerda por qué frase se iba', async () => {
    const client = progressClient({ last_sentence: 4 });

    expect((await getReadingProgress('shop-01-tea-and-coffee', client)).last_sentence).toBe(4);
  });
```

- [ ] **Step 3: Write minimal implementation**

`markRead` escribe `finished_at` y un `learning_event` de tipo `reading_completed` con los `target_words` de la lectura en el payload —eso es lo que permite al planificador saber qué reforzó—. `toggleBookmark` invierte el valor actual. La lista muestra tres estados: sin empezar, empezada, y leída, con el marcador aparte.

**Offline**: las diez lecturas del catálogo van en el seed y pesan poco, así que se cachean enteras en la primera carga usando el mismo almacén SQLite que el Plan 3 usa para las tarjetas. Una lectura ya cargada se abre sin red.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations packages/data/src apps/mobile/src
git commit -m "feat(readings): progreso, marcadores, lectura terminada y caché offline"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. Activar «Show pinyin» lo muestra **una vez**, junto a cada frase.
3. Tocar una frase muestra su traducción; volver a tocarla la esconde.
4. Las palabras conocidas, en aprendizaje, objetivo y desconocidas se distinguen a simple vista.
5. Tocar `还` en una lectura muestra sus dos acepciones, con la del nivel primero.
6. La lista de lecturas muestra el porcentaje que reconocerás antes de abrir cada una.
7. Terminar una lectura escribe un `learning_event`, y el planificador deja de proponerla.

## Lo que este plan deja explícitamente sin resolver

- **No hay desambiguación de sentidos**, y es deliberado: se muestran todas las acepciones. Elegir una automáticamente pide análisis sintáctico, y adivinar por frecuencia fallaría en silencio justo en las palabras ambiguas.
- **El resaltado es por frase, no por palabra.** `expo-speech` no da marcas de tiempo fiables en ambas plataformas y no hay audio humano. Con grabación y timings, la misma interfaz baja a palabra sin rehacerse.
- **La recomendación de la siguiente lectura necesita el Plan 5B**, que no está ejecutado. Este plan deja la cobertura calculada y visible; enchufarla a `rankContent` es una línea cuando el 5B esté.
- **No se generan ejercicios a partir de los errores de la lectura.** Es el paso 5 del planificador y necesita que el Plan 6 exista.
- **La caché offline no se invalida sola.** Con diez lecturas que solo cambian al desplegar, un borrado manual desde Ajustes basta; con un catálogo grande haría falta versionado.
