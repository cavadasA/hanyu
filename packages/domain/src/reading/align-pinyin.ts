// Alineación hanzi ↔ pinyin de una frase de lectura, desde su propio campo
// `pinyin`. No usa tablas de sílabas: recorre los tokens del tokenizador y
// prueba como prefijo del pinyin normalizado la lectura de cada entrada del
// diccionario; para hanzi sueltos y nombres sin entrada usa las lecturas de
// `pinyin-pro`.
//
// La usan la build (acepciones, Plan 14) y la síntesis de audio
// (scripts/lib/ssml.js, Plan 10). Depende de pinyin-pro, así que no se importa
// desde nada que corra en el móvil o en la Edge Function.
import { pinyin as pinyinPro } from 'pinyin-pro';
import { pinyinLetters, renderPinyin, type PinyinLetter } from './pinyin.ts';
import { tokenizeReading, type DictionaryEntry, type ReadingToken } from './tokenize.ts';
import type { SenseToken } from './senses.ts';

const HAN = /\p{Script=Han}/u;
const ERHUA = 'r';

type Bounds = [number, number];
interface Split {
  bounds: Bounds[];
  end: number;
}

function baseOf(text: string): string {
  return pinyinLetters(text).map(letter => letter.base).join('');
}

const proCache = new Map<string, string[]>();
/** Lecturas sin tono de un hanzi; 儿 admite además la «r» del erhua. */
function readingsOf(ch: string): string[] {
  let readings = proCache.get(ch);
  if (!readings) {
    const all = new Set<string>(pinyinPro(ch, { multiple: true, type: 'array', toneType: 'none', v: true }));
    if (ch === '儿') all.add(ERHUA);
    readings = [...all].sort((a, b) => b.length - a.length);
    proCache.set(ch, readings);
  }
  return readings;
}

/** Todas las formas de repartir `base[start, end)` entre `chars`, una sílaba por hanzi. */
function* splitChars(chars: string[], base: string, start: number, end?: number): Generator<Split> {
  if (chars.length === 0) {
    if (end === undefined || start === end) yield { bounds: [], end: start };
    return;
  }
  for (const reading of readingsOf(chars[0])) {
    const stop = start + reading.length;
    if (end !== undefined && stop > end) continue;
    if (base.startsWith(reading, start)) {
      for (const rest of splitChars(chars.slice(1), base, stop, end)) {
        yield { bounds: [[start, stop], ...rest.bounds], end: rest.end };
      }
    }
  }
}

/** Alineaciones posibles de un token a partir de `pos`: primero las entradas del diccionario. */
function* tokenAlignments(
  token: ReadingToken,
  base: string,
  pos: number,
  entriesByHanzi: Map<string, string[]>,
): Generator<Split> {
  const chars = Array.from(token.text);
  const seen = new Set<string>();
  for (const entryBase of entriesByHanzi.get(token.text) ?? []) {
    const end = pos + entryBase.length;
    if (!base.startsWith(entryBase, pos)) continue;
    for (const split of splitChars(chars, base, pos, end)) {
      const id = JSON.stringify(split.bounds);
      if (!seen.has(id)) {
        seen.add(id);
        yield split;
      }
    }
  }
  for (const split of splitChars(chars, base, pos)) {
    const id = JSON.stringify(split.bounds);
    if (!seen.has(id)) {
      seen.add(id);
      yield split;
    }
  }
}

interface DictionaryIndex {
  /** Lecturas sin tono de cada forma, de la más larga a la más corta. */
  entriesByHanzi: Map<string, string[]>;
  /** Lecturas sin tono que el diccionario da a cada hanzi suelto. */
  readingsByChar: Map<string, Set<string>>;
}

const dictionaryCache = new WeakMap<object, DictionaryIndex>();
function indexDictionary(dictionary: DictionaryEntry[]): DictionaryIndex {
  const cached = dictionaryCache.get(dictionary);
  if (cached) return cached;

  const entriesByHanzi = new Map<string, string[]>();
  const readingsByChar = new Map<string, Set<string>>();
  for (const entry of dictionary) {
    const entryBase = baseOf(entry.pinyin);
    const bases = entriesByHanzi.get(entry.hanzi) ?? [];
    if (!bases.includes(entryBase)) bases.push(entryBase);
    entriesByHanzi.set(entry.hanzi, bases);

    // Una entrada cuyo pinyin no se reparte entre sus hanzi (las variantes como
    // 没（有） comparten el pinyin de la forma larga) no dice nada de cada hanzi.
    const chars = Array.from(entry.hanzi);
    const split = splitChars(chars, entryBase, 0, entryBase.length).next().value;
    if (!split) continue;
    chars.forEach((ch, i) => {
      const reading = entryBase.slice(...split.bounds[i]);
      if (reading === ERHUA) return;
      const readings = readingsByChar.get(ch) ?? new Set<string>();
      readings.add(reading);
      readingsByChar.set(ch, readings);
    });
  }
  for (const bases of entriesByHanzi.values()) bases.sort((a, b) => b.length - a.length);

  const index = { entriesByHanzi, readingsByChar };
  dictionaryCache.set(dictionary, index);
  return index;
}

/** Lecturas sin tono que el diccionario da a cada hanzi: un polífono tiene más de una. */
export function charReadings(dictionary: DictionaryEntry[]): Map<string, Set<string>> {
  return indexDictionary(dictionary).readingsByChar;
}

/** Sílaba en el formato de SAPI: letras sin tono y el tono al final (5 = neutro). */
export function syllableOf(letters: readonly PinyinLetter[], [start, end]: Bounds): string {
  const span = letters.slice(start, end);
  const tone = span.find(letter => letter.tone)?.tone ?? 5;
  return `${span.map(letter => letter.base).join('')} ${tone}`;
}

export interface AlignedHanzi {
  token: ReadingToken;
  char: string;
  /** Posición del hanzi en `zh`, en unidades UTF-16. */
  index: number;
  /** Letras de `letters` que dicen este hanzi. */
  bounds: Bounds;
}

/**
 * La sílaba de cada hanzi de la frase según su propio pinyin, o null si las
 * sílabas del pinyin no se pueden repartir entre los hanzi.
 */
export function alignHanzi(
  sentence: { zh: string; pinyin: string },
  dictionary: DictionaryEntry[],
): { letters: PinyinLetter[]; tokens: ReadingToken[]; hanzi: AlignedHanzi[] } | null {
  const { entriesByHanzi } = indexDictionary(dictionary);
  const letters = pinyinLetters(sentence.pinyin);
  const base = letters.map(letter => letter.base).join('');
  const tokens = tokenizeReading(sentence.zh, dictionary);
  const han = tokens.filter(token => HAN.test(token.text));

  const search = (index: number, pos: number): Split[] | null => {
    if (index === han.length) return pos === base.length ? [] : null;
    for (const split of tokenAlignments(han[index], base, pos, entriesByHanzi)) {
      const rest = search(index + 1, split.end);
      if (rest) return [split, ...rest];
    }
    return null;
  };

  const splits = search(0, 0);
  if (!splits) return null;

  const hanzi = han.flatMap((token, t) => {
    const chars = Array.from(token.text);
    const start = Number(token.id.slice(1));
    return splits[t].bounds.map((bounds, k) => ({
      token,
      char: chars[k],
      index: start + chars.slice(0, k).join('').length,
      bounds,
    }));
  });
  return { letters, tokens, hanzi };
}

/**
 * Los tokens de la frase, tokenizada con `dictionary`, con la parte del pinyin
 * de la frase que dice cada uno (null en la puntuación). Si las sílabas del
 * pinyin no se pueden repartir entre los hanzi, devuelve null.
 */
export function alignTokens(
  sentence: { zh: string; pinyin: string },
  dictionary: DictionaryEntry[],
): SenseToken[] | null {
  const aligned = alignHanzi(sentence, dictionary);
  if (!aligned) return null;

  const pinyinByToken = new Map<ReadingToken, string>();
  for (const token of new Set(aligned.hanzi.map(entry => entry.token))) {
    const own = aligned.hanzi.filter(entry => entry.token === token);
    pinyinByToken.set(
      token,
      renderPinyin(aligned.letters.slice(own[0].bounds[0], own[own.length - 1].bounds[1])),
    );
  }

  return aligned.tokens.map(token => ({ text: token.text, pinyin: pinyinByToken.get(token) ?? null }));
}
