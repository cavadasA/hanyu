// SSML de una frase con la pronunciación de cada polífono forzada desde el
// campo `pinyin` de la propia frase. La alineación hanzi ↔ pinyin vive en el
// dominio (packages/domain/src/reading/align-pinyin.ts), que también la usa la
// build para resolver la acepción de cada palabra (Plan 14).
import {
  alignHanzi,
  charReadings,
  syllableOf,
} from '../../packages/domain/src/reading/align-pinyin.ts';

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
  const aligned = alignHanzi({ zh, pinyin }, dictionary);
  if (!aligned) {
    throw new Error(
      `No se pueden alinear las sílabas de «${sentence.zh}» con su pinyin «${sentence.pinyin}»`,
    );
  }
  return aligned.hanzi.map(entry => ({
    index: offset + entry.index,
    hanzi: entry.char,
    ph: syllableOf(aligned.letters, entry.bounds),
  }));
}

/** Los hanzi polífonos de la frase (el diccionario los lee de más de una forma) con la sílaba que dice su pinyin. */
export function polyphonesIn(sentence, dictionary, options = {}) {
  const readings = charReadings(dictionary);
  return alignSentence(sentence, dictionary, options)
    .filter(({ hanzi }) => (readings.get(hanzi)?.size ?? 0) > 1);
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
