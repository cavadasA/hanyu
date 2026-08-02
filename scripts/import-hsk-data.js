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
 * Extract the best English meanings from the HTML dictionary column.
 *
 * CC-CEDICT structures entries with multiple <ul> blocks — one per
 * reading/pronunciation. The first block is often a surname or rare
 * reading (e.g. 也 Yě → "surname Ye"), while the second block holds
 * the common meaning (yě → "also; too"). The old logic blindly took
 * the first <ul> and produced "surname Bai" instead of "hundred".
 *
 * Now we score every <ul> block and pick the best one, penalising
 * surname-only / used-in / variant-of entries and rewarding blocks
 * with more detail. "variant of X" entries are stripped before
 * scoring — they are dictionary metadata, not learner meanings.
 */
function extractMeanings(html) {
  if (!html) return '';

  // Patterns that are dictionary metadata, never useful as meanings
  const isMeta = (s) =>
    /^variant of /.test(s) ||
    /^old variant of /.test(s);

  // ── 1. Parse every <ul>…</ul> block, strip meta entries ─────
  const ulRegex = /<ul>([\s\S]*?)<\/ul>/g;
  const blocks = [];
  let ulMatch;
  while ((ulMatch = ulRegex.exec(html)) !== null) {
    const meanings = [];
    const liRegex = /<li>(.*?)<\/li>/g;
    let liMatch;
    while ((liMatch = liRegex.exec(ulMatch[1])) !== null) {
      const text = liMatch[1]
        .replace(/<[^>]*>/g, '')
        .trim();
      if (text && !isMeta(text)) meanings.push(text);
    }
    if (meanings.length > 0) blocks.push(meanings);
  }

  if (blocks.length === 0) return '';

  // ── 2. Score each block ──────────────────────────────────────
  function scoreBlock(meanings) {
    if (meanings.length === 0) return -999;

    let score = meanings.length * 10;        // more entries → primary
    const first = meanings[0];

    // Heavy penalties — these blocks are almost never what we want
    if (/^surname [A-Z]/.test(first))       score -= 300;
    if (/^used in /.test(first))            score -= 300;

    // "abbr. for …" blocks are also wrong (e.g. 新 → "abbr. for Xinjiang")
    // even when the block has multiple entries; the real meaning block
    // will have a clean first entry like "new"
    if (/^abbr\. for/.test(first))          score -= 200;

    // Milder penalty when "surname" appears mixed with real content
    // (e.g. "China; Chinese; surname Zhong" — still usable but not ideal)
    if (first.includes('surname') && !/^surname [A-Z]/.test(first))
      score -= 30;

    return score;
  }

  // ── 3. Pick the winner ───────────────────────────────────────
  let best = blocks[0];
  let bestScore = scoreBlock(best);

  for (let i = 1; i < blocks.length; i++) {
    const s = scoreBlock(blocks[i]);
    if (s > bestScore) {
      bestScore = s;
      best = blocks[i];
    }
  }

  // ── 4. Clean up final output ─────────────────────────────────
  // If the winning block still starts with a junk entry (can happen
  // when there's only one block, like 家 where the first entry is
  // "used in 傢伙"), skip it so we show actual meanings.
  const final = [];
  for (const m of best) {
    // Skip entries that are just cross-references, not meanings
    if (/^used in /.test(m)) continue;
    final.push(m);
    if (final.length >= 3) break;
  }

  // If filtering removed everything (shouldn't happen), fall back
  if (final.length === 0) return best.slice(0, 3).join('; ');

  return final.join('; ');
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