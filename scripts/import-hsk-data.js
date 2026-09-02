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

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(rootDir, 'data');
const seedDir = join(rootDir, 'server', 'db', 'seeds');

function normalizeReadingKey(input) {
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
 * es (hanzi, lectura normalizada) y no el índice de fila, porque el número y
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
      existing.set(`${word.hanzi}|${normalizeReadingKey(word.pinyin)}`, word.meaning_es);
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
    `${entry.hanzi}|${normalizeReadingKey(entry.pinyin)}`,
    entry.meaning_es,
  ]),
);

for (const level of [1, 2, 3]) {
  const filePath = join(dataDir, `HSK_Level_${level}.txt`);

  if (!existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Run download first.`);
    console.warn('  Download from: https://github.com/krmanik/HSK-3.0/tree/main/New%20HSK%20(2025)/Anki%20xiehanzi');
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter((l) => l.trim());

  const outPath = join(seedDir, `hsk${level}-words.json`);
  const spanish = loadExistingSpanish(outPath);

  const words = [];
  const unresolved = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const [simplified, , pinyinRaw, , , pos, freq, ...htmlParts] = cols;
    const html = htmlParts.join('\t'); // rejoin in case HTML had tabs
    const hanzi = simplified?.trim();
    if (!hanzi) continue;

    const pinyin = pinyinRaw?.trim() || '';
    const entry = parseDictionaryEntry(html);
    const sense = selectReading(entry, pinyin);

    if (!sense) {
      // Sin lectura resuelta no podemos afirmar qué sentido es esta fila.
      // Se registra en vez de inventar una glosa.
      unresolved.push(`${hanzi} ${pinyin}`);
      continue;
    }

    words.push({
      hanzi,
      traditional: entry.traditional && entry.traditional !== hanzi ? entry.traditional : null,
      pinyin,
      meaning_en: sense.meanings.slice(0, 5).join('; '),
      meaning_es:
        curatedSpanish.get(`${hanzi}|${normalizeReadingKey(pinyin)}`) ??
        spanish.get(`${hanzi}|${normalizeReadingKey(pinyin)}`) ??
        null,
      classifier: sense.classifiers.length > 0 ? sense.classifiers.join('、') : null,
      pos: mapPos(pos?.trim()),
      frequency: parseInt(freq, 10) || 0,
    });
  }

  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);

  if (unresolved.length > 0) {
    console.warn(`  ${unresolved.length} filas sin lectura resuelta: ${unresolved.join(', ')}`);
  }
}

console.log('Import complete. Run "npm run seed" to populate the database.');
