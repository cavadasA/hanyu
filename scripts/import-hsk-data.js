/**
 * Import script for HSK data from krmanik/HSK-3.0 Anki xiehanzi files.
 *
 * Source: https://github.com/krmanik/HSK-3.0
 * Path:   New HSK (2025)/Anki xiehanzi/HSK_Level_{1,2,3}.txt
 *
 * Format (tab-separated, no header row):
 *   simplified  traditional  pinyin  zhuyin  level  POS  frequency  HTML_dictionary
 *
 * Usage:
 *   1. Download files into data/ directory (or run this script — it downloads automatically)
 *   2. Run: node scripts/import-hsk-data.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseDictionaryEntry, selectReading } from './lib/cedict-html.js';
import { dedupeOfficialTerms, loadOfficialWords } from './lib/official-terms.js';
import { selectSenseSource } from './lib/sense-overrides.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(rootDir, 'data');
const seedDir = join(rootDir, 'server', 'db', 'seeds');

function normalizeSenseKey(input) {
  // La normalización del dominio quita los tonos para comparar formato. Una
  // glosa curada no puede hacer eso: 只 zhī y 只 zhǐ son sentidos distintos.
  return String(input).normalize('NFC').toLowerCase().replace(/[\s'’·-]/g, '');
}

/**
 * Map Chinese POS abbreviations to English.
 */
const POS_MAP = {
  '名': 'noun', '动': 'verb', '形': 'adjective', '副': 'adverb',
  '代': 'pronoun', '数': 'numeral', '量': 'measure word', '介': 'preposition',
  '连': 'conjunction', '助': 'particle', '叹': 'interjection', '前缀': 'prefix',
  '后缀': 'suffix',
};

function mapPos(posRaw) {
  if (!posRaw) return '';
  // Take the first POS if multiple (e.g. "动、名" -> "verb")
  const first = posRaw.split(/[、，,]/)[0].replace(/[^一-龥a-zA-Z]/g, '').trim();
  return POS_MAP[first] || posRaw;
}

/**
 * Las glosas españolas se curan a mano y no vienen del fichero fuente. Al
 * regenerar hay que arrastrarlas, o cada importación las destruiría. La clave
 * es (hanzi, lectura con tono, sentido) y no el índice de fila, porque el número y
 * el orden de las filas puede cambiar entre importaciones. El tono se
 * conserva: 只 zhī y 只 zhǐ son sentidos distintos aunque normalizePinyin los
 * reduzca a la misma forma para comparaciones de formato.
 */
function loadExistingSpanish(outPath) {
  if (!existsSync(outPath)) {
    return new Map();
  }

  const existing = new Map();
  for (const word of JSON.parse(readFileSync(outPath, 'utf-8'))) {
    if (word.meaning_es) {
      existing.set(`${word.hanzi}|${normalizeSenseKey(word.pinyin)}|${word.sense_index ?? ''}`, word.meaning_es);
    }
  }

  return existing;
}

/**
 * Glosas españolas curadas por sentido. Se aplican después de arrastrar las
 * existentes, así que ganan sobre lo que hubiera en el JSON anterior: son la
 * corrección deliberada de una mezcla de sentidos.
 */
const curatedSpanish = new Map(
  JSON.parse(readFileSync(join(seedDir, 'sense-glosses-es.json'), 'utf-8')).map((entry) => [
    `${entry.hanzi}|${normalizeSenseKey(entry.pinyin)}|${entry.sense_index ?? ''}`,
    entry.meaning_es,
  ]),
);

// CC-CEDICT no siempre separa en filas distintas los sentidos que el sílabo
// distingue por índice. Estas excepciones editoriales son explícitas y
// versionadas: nunca se elige silenciosamente otra acepción del diccionario.
const senseOverrides = new Map(
  JSON.parse(readFileSync(join(seedDir, 'sense-overrides.json'), 'utf-8')).map((entry) => [
    `${entry.hanzi}|${entry.hsk_level}|${entry.sense_index ?? ''}`,
    entry,
  ]),
);

const unresolvedTerms = [];

for (const level of [1, 2, 3]) {
  const filePath = join(dataDir, `HSK_Level_${level}.txt`);

  if (!existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Run download first.`);
    console.warn('  Download from: https://github.com/krmanik/HSK-3.0/tree/main/New%20HSK%20(2025)/Anki%20xiehanzi');
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter((l) => l.trim());

  // El mazo Anki se indexa por forma escrita, que es la única clave que
  // comparte con la lista oficial: el mazo ha perdido el índice de sentido.
  const enriched = new Map();
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const [simplified, , pinyinRaw, , , pos, freq, ...htmlParts] = cols;
    const hanzi = simplified?.trim();
    if (!hanzi) continue;

    const list = enriched.get(hanzi) ?? [];
    list.push({
      pinyin: pinyinRaw?.trim() || '',
      pos: mapPos(pos?.trim()),
      frequency: parseInt(freq, 10) || 0,
      html: htmlParts.join('\t'),
    });
    enriched.set(hanzi, list);
  }

  const outPath = join(seedDir, `hsk${level}-words.json`);
  const spanish = loadExistingSpanish(outPath);

  const words = [];
  const official = dedupeOfficialTerms(loadOfficialWords(level), level);

  if (official.duplicates.length > 0) {
    console.warn(
      `  ${official.duplicates.length} líneas oficiales repetidas fusionadas en HSK ${level}: ` +
        official.duplicates.map((term) => `${term.form}${term.sense_index ?? ''}`).join(', '),
    );
  }

  for (const term of official.terms) {
    const override = senseOverrides.get(
      `${term.form}|${level}|${term.sense_index ?? ''}`,
    );

    // Se prueban todas las variantes: el mazo puede listar la forma corta
    // (没) donde la lista oficial escribe la larga (没（有）).
    const candidates = term.variants
      .map((variant) => enriched.get(variant))
      .find((found) => found && found.length > 0);

    if (!candidates && !override) {
      unresolvedTerms.push({
        hsk_level: level,
        form: term.form,
        sense_index: term.sense_index,
        reason: 'missing_dictionary_entry',
      });
      continue;
    }

    // Cuando el mazo trae varias filas para la misma forma escrita, el índice
    // de sentido oficial las ordena: el sentido n usa la fila n si existe.
    // Si el mazo no tiene esa fila, el término queda explícitamente sin
    // resolver; reutilizar la última acepción mezcla sentidos en silencio.
    const source = selectSenseSource(candidates, term.sense_index, override);
    if (!source && !override) {
      unresolvedTerms.push({
        hsk_level: level,
        form: term.form,
        sense_index: term.sense_index,
        reason: 'missing_dictionary_sense',
        available_readings: candidates.map((candidate) => candidate.pinyin),
      });
      continue;
    }

    const entry = source ? parseDictionaryEntry(source.html) : null;
    const sense = source && entry ? selectReading(entry, source.pinyin) : null;

    if (!sense && !override) {
      unresolvedTerms.push({
        hsk_level: level,
        form: term.form,
        sense_index: term.sense_index,
        reason: 'missing_dictionary_reading',
        pinyin: source.pinyin,
      });
      continue;
    }

    const senseKey = `${term.sense_index ?? ''}`;
    const pinyin = override?.pinyin ?? source?.pinyin;
    const key = `${term.form}|${normalizeSenseKey(pinyin)}|${senseKey}`;

    words.push({
      hanzi: term.form,
      sense_index: term.sense_index,
      variants: term.variants,
      traditional:
        override?.traditional ??
        (entry?.traditional && entry.traditional !== term.form ? entry.traditional : null),
      pinyin,
      meaning_en: override?.meaning_en ?? sense.meanings.slice(0, 5).join('; '),
      meaning_es: override?.meaning_es ?? curatedSpanish.get(key) ?? spanish.get(key) ?? null,
      classifier:
        override?.classifier ??
        (sense?.classifiers.length > 0 ? sense.classifiers.join('、') : null),
      pos: override?.pos ?? source?.pos ?? null,
      frequency: override?.frequency ?? source?.frequency ?? 0,
    });
  }

  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);

}

writeFileSync(
  join(seedDir, 'unresolved-hsk-terms.json'),
  JSON.stringify(unresolvedTerms, null, 2),
  'utf-8',
);
if (unresolvedTerms.length > 0) {
  console.warn(
    `Términos oficiales sin resolver: ${unresolvedTerms.length} -> unresolved-hsk-terms.json`,
  );
}

console.log('Import complete. Run "npm run seed" to populate the database.');
