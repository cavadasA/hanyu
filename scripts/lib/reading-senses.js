// Acepción de cada palabra de una lectura, resuelta en la build (Plan 14).
// La frase se tokeniza con el mismo diccionario que usa la Edge Function
// tokenize-reading (las filas de words, HSK 1–3, sin expandir variantes): así
// la aparición n-ésima de una palabra es la misma aquí y en el móvil.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignTokens } from '../../packages/domain/src/reading/align-pinyin.ts';
import { resolveSenses } from '../../packages/domain/src/reading/senses.ts';

const seedDir = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'server', 'db', 'seeds');

/** Las filas de `words` tal como las siembra build-supabase-seed.js. */
export function loadWordRows() {
  return [1, 2, 3].flatMap(level =>
    JSON.parse(readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf8')).map(word => ({
      hanzi: word.hanzi,
      pinyin: word.pinyin,
      hsk_level: level,
      sense_index: word.sense_index ?? null,
      meaning_en: word.meaning_en,
      meaning_es: word.meaning_es ?? null,
      pos: word.pos ?? null,
    })),
  );
}

/** Marca los tokens que caen dentro de una aparición de un nombre de personaje. */
function markProperNouns(tokens, zh, properNouns) {
  const spans = properNouns.flatMap(name => {
    const found = [];
    for (let at = zh.indexOf(name); at !== -1; at = zh.indexOf(name, at + name.length)) {
      found.push([at, at + name.length]);
    }
    return found;
  });
  let offset = 0;
  return tokens.map(token => {
    const start = offset;
    offset += token.text.length;
    const inName = spans.some(([from, to]) => start >= from && offset <= to);
    return inName ? { ...token, proper_noun: true } : token;
  });
}

/**
 * Frases de la lectura con `senses` (las acepciones que el tokenizador no
 * elegiría solo) y los problemas de resolución, con la forma de los de
 * validateReading.
 */
export function readingSenses(reading, words, properNouns = []) {
  const issues = [];
  const aligned = reading.sentences.map((sentence, index) => {
    const tokens = alignTokens(sentence, words);
    if (!tokens) {
      issues.push({ kind: 'pinyin_unaligned', sentence_index: index, detail: sentence.zh });
      return { tokens: [] };
    }
    return { tokens: markProperNouns(tokens, sentence.zh, properNouns) };
  });

  const result = resolveSenses(
    { hsk_level: reading.hsk_level, sentences: aligned, senses: reading.senses },
    words,
  );
  for (const issue of result.issues) {
    issues.push({
      kind: issue.kind,
      sentence_index: issue.sentence,
      detail: issue.detail ? `${issue.hanzi} (${issue.detail})` : issue.hanzi,
    });
  }

  const sentences = reading.sentences.map((sentence, index) => {
    const senses = result.resolved
      .filter(sense => sense.sentence === index && sense.by !== 'only')
      .map(({ hanzi, occurrence, hsk_level, sense_index }) => ({ hanzi, occurrence, hsk_level, sense_index }));
    return senses.length > 0 ? { ...sentence, senses } : sentence;
  });

  return { sentences, issues };
}
