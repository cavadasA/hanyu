// SSML de una frase con la pronunciación de cada polífono forzada desde el
// campo `pinyin` de la propia frase. La alineación hanzi ↔ pinyin no usa tablas
// de sílabas: recorre los tokens del tokenizador de dominio y prueba como
// prefijo del pinyin normalizado la lectura de cada entrada del diccionario;
// para hanzi sueltos y nombres sin entrada usa las lecturas de `pinyin-pro`.
import { pinyin as pinyinPro } from 'pinyin-pro';
import { tokenizeReading } from '../../packages/domain/src/reading/tokenize.ts';

const TONE_MARKS = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };
const DIAERESIS = '̈';
const HAN = /\p{Script=Han}/u;
const ERHUA = 'r';

/** Letras del pinyin en minúsculas, sin espacios ni puntuación, con su tono (0 = sin marca). */
export function normalizePinyin(text) {
  const letters = [];
  for (const ch of text.toLowerCase().normalize('NFD')) {
    const last = letters[letters.length - 1];
    if (TONE_MARKS[ch] && last) last.tone = TONE_MARKS[ch];
    else if (ch === DIAERESIS && last) last.base = 'v';
    else if (/[a-z]/.test(ch)) letters.push({ base: ch, tone: 0 });
  }
  return letters;
}

function baseOf(text) {
  return normalizePinyin(text).map(letter => letter.base).join('');
}

const proCache = new Map();
/** Lecturas sin tono de un hanzi; 儿 admite además la «r» del erhua. */
function readingsOf(ch) {
  if (!proCache.has(ch)) {
    const readings = new Set(pinyinPro(ch, { multiple: true, type: 'array', toneType: 'none', v: true }));
    if (ch === '儿') readings.add(ERHUA);
    proCache.set(ch, [...readings].sort((a, b) => b.length - a.length));
  }
  return proCache.get(ch);
}

/** Todas las formas de repartir `base[start, end)` entre `chars`, una sílaba por hanzi. */
function* splitChars(chars, base, start, end) {
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
function* tokenAlignments(token, base, pos, entriesByHanzi) {
  const chars = Array.from(token.text);
  const seen = new Set();
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

function syllableOf(letters, [start, end]) {
  const span = letters.slice(start, end);
  const tone = span.find(letter => letter.tone)?.tone ?? 5;
  return `${span.map(letter => letter.base).join('')} ${tone}`;
}

const dictionaryCache = new WeakMap();
/** Índices derivados del diccionario: lecturas por forma y lecturas por hanzi. */
function indexDictionary(dictionary) {
  if (dictionaryCache.has(dictionary)) return dictionaryCache.get(dictionary);

  const entriesByHanzi = new Map();
  const readingsByChar = new Map();
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
      const readings = readingsByChar.get(ch) ?? new Set();
      readings.add(reading);
      readingsByChar.set(ch, readings);
    });
  }
  for (const bases of entriesByHanzi.values()) bases.sort((a, b) => b.length - a.length);

  const index = { entriesByHanzi, readingsByChar };
  dictionaryCache.set(dictionary, index);
  return index;
}

/** Un hanzi es polífono si el diccionario lo lee de más de una forma. */
function isPolyphone(ch, index) {
  return (index.readingsByChar.get(ch)?.size ?? 0) > 1;
}

function stripSpeaker(sentence, speaker) {
  const prefix = speaker ? `${speaker}：` : '';
  if (!prefix || !sentence.zh.startsWith(prefix)) return { zh: sentence.zh, pinyin: sentence.pinyin, offset: 0 };
  const colon = sentence.pinyin.search(/[:：]/);
  if (colon < 0) throw new Error(`El pinyin de «${sentence.zh}» no separa al hablante con dos puntos`);
  return { zh: sentence.zh.slice(prefix.length), pinyin: sentence.pinyin.slice(colon + 1), offset: prefix.length };
}

/**
 * Sílaba de cada hanzi de la frase según su propio pinyin.
 * Devuelve `[{ index, hanzi, ph }]`, con `index` en `sentence.zh`.
 */
export function alignSentence(sentence, dictionary, { speaker } = {}) {
  const { zh, pinyin, offset } = stripSpeaker(sentence, speaker);
  const index = indexDictionary(dictionary);
  const letters = normalizePinyin(pinyin);
  const base = letters.map(letter => letter.base).join('');
  const tokens = tokenizeReading(zh, dictionary).filter(token => HAN.test(token.text));

  const search = (ti, pos) => {
    if (ti === tokens.length) return pos === base.length ? [] : null;
    for (const split of tokenAlignments(tokens[ti], base, pos, index.entriesByHanzi)) {
      const rest = search(ti + 1, split.end);
      if (rest) return [...split.bounds.map(bounds => ({ token: tokens[ti], bounds })), ...rest];
    }
    return null;
  };

  const aligned = search(0, 0);
  if (!aligned) {
    throw new Error(
      `No se pueden alinear las sílabas de «${sentence.zh}» con su pinyin «${sentence.pinyin}»`,
    );
  }

  const position = new Map();
  return aligned.map(({ token, bounds }) => {
    const start = Number(token.id.slice(1));
    const k = position.get(token) ?? 0;
    position.set(token, k + 1);
    const local = start + Array.from(token.text).slice(0, k).join('').length;
    return { index: offset + local, hanzi: Array.from(token.text)[k], ph: syllableOf(letters, bounds) };
  });
}

/** Los hanzi polífonos de la frase con la sílaba que dice su pinyin. */
export function polyphonesIn(sentence, dictionary, options = {}) {
  const index = indexDictionary(dictionary);
  return alignSentence(sentence, dictionary, options).filter(({ hanzi }) => isPolyphone(hanzi, index));
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sentenceToSsml(sentence, voice, dictionary, options = {}) {
  const forced = new Map(polyphonesIn(sentence, dictionary, options).map(entry => [entry.index, entry]));
  const { offset } = stripSpeaker(sentence, options.speaker);

  let body = '';
  for (let i = offset; i < sentence.zh.length; i += 1) {
    const ch = sentence.zh[i];
    const entry = forced.get(i);
    body += entry
      ? `<phoneme alphabet="sapi" ph="${entry.ph}">${escapeXml(ch)}</phoneme>`
      : escapeXml(ch);
  }

  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">'
    + `<voice name="${voice}">${body}</voice></speak>`
  );
}
