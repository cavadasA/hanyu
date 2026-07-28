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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(rootDir, 'data');
const seedDir = join(rootDir, 'server', 'db', 'seeds');

/**
 * Extract the first set of English meanings from the HTML dictionary column.
 * The HTML contains <li>meaning</li> tags. We grab the first <ul> block's meanings
 * (the primary reading) and join them with "; ".
 */
function extractMeanings(html) {
  if (!html) return '';

  // Get the first <ul>...</ul> block (primary reading)
  const firstUl = html.match(/<ul>([\s\S]*?)<\/ul>/);
  if (!firstUl) return '';

  // Extract all <li> contents from that block
  const meanings = [];
  const liRegex = /<li>(.*?)<\/li>/g;
  let match;
  while ((match = liRegex.exec(firstUl[1])) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, '') // strip any nested HTML tags
      .trim();
    if (text) meanings.push(text);
  }

  // Take up to 3 meanings to keep it concise
  return meanings.slice(0, 3).join('; ');
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

for (const level of [1, 2, 3]) {
  const filePath = join(dataDir, `HSK_Level_${level}.txt`);

  if (!existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Run download first.`);
    console.warn('  Download from: https://github.com/krmanik/HSK-3.0/tree/main/New%20HSK%20(2025)/Anki%20xiehanzi');
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter((l) => l.trim());

  const words = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const [simplified, , pinyin, , , pos, freq, ...htmlParts] = cols;
    const html = htmlParts.join('\t'); // rejoin in case HTML had tabs
    const hanzi = simplified?.trim();
    if (!hanzi) continue;

    words.push({
      hanzi,
      pinyin: pinyin?.trim() || '',
      meaning_en: extractMeanings(html),
      pos: mapPos(pos?.trim()),
      frequency: parseInt(freq, 10) || 0,
    });
  }

  const outPath = join(seedDir, `hsk${level}-words.json`);
  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);
}

console.log('Import complete. Run "npm run seed" to populate the database.');