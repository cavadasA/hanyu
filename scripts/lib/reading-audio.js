// Qué audio espera cada lectura: un clip por frase, con clave `00`, `01`…
// En un diálogo, la frase empieza por «nombre：» de un personaje de la serie;
// ese prefijo decide la voz y no se pronuncia.
import { sourceHash } from '../../packages/domain/src/media/manifest.ts';

export function clipKey(index) {
  return String(index).padStart(2, '0');
}

export function speakerOf(sentence, reading, series) {
  if (reading.format !== 'dialogue' || !series) return null;
  const match = /^([^：]{1,6})：/.exec(sentence.zh);
  if (!match) return null;
  return series.characters.some(character => character.name === match[1]) ? match[1] : null;
}

export function spokenText(sentence, reading, series) {
  const speaker = speakerOf(sentence, reading, series);
  return speaker ? sentence.zh.slice(speaker.length + 1) : sentence.zh;
}

export function readingAudioExpectations(reading, series) {
  const keys = reading.sentences.map((_, index) => clipKey(index));
  return {
    expectedKeys: keys,
    textByKey: Object.fromEntries(
      reading.sentences.map((sentence, index) => [keys[index], spokenText(sentence, reading, series)]),
    ),
    sourceHashByKey: Object.fromEntries(
      reading.sentences.map((sentence, index) => [keys[index], sourceHash(sentence)]),
    ),
  };
}
