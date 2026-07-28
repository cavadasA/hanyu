import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(rootDir, 'data', 'HSK-3.0', 'New HSK (2021)', 'HSK List');
const seedDir = join(rootDir, 'server', 'db', 'seeds');

function parseTsv(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t').map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    const entry = {};

    headers.forEach((header, index) => {
      entry[header] = values[index]?.trim() || '';
    });

    return entry;
  });
}

function mapToWord(entry, index) {
  return {
    hanzi: entry.hanzi || entry.word || entry['汉字'] || '',
    pinyin: entry.pinyin || entry['拼音'] || '',
    meaning_en: entry.meaning || entry.english || entry.translation || entry['英文'] || '',
    pos: entry.pos || entry['词性'] || '',
    frequency: index + 1,
  };
}

for (const level of [1, 2, 3]) {
  const possiblePaths = [
    join(dataDir, `HSK ${level}.tsv`),
    join(dataDir, `HSK${level}.tsv`),
    join(dataDir, `Level ${level}.tsv`),
  ];

  const filePath = possiblePaths.find((candidate) => existsSync(candidate));
  if (!filePath) {
    console.warn(`Warning: No TSV file found for HSK level ${level}. Skipping.`);
    console.warn(`  Looked in: ${possiblePaths.join(', ')}`);
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries = parseTsv(content);
  const words = entries.map(mapToWord).filter((word) => word.hanzi);
  const outPath = join(seedDir, `hsk${level}-words.json`);

  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);
}

console.log('Import complete. Run "npm run seed" to populate the database.');