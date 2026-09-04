// El contenido se crea en tiempo de construcción, no de ejecución: cada lectura
// es un fichero del repositorio que pasa por los validadores antes de entrar al
// seed. Un texto malo rompe la build en vez de llegar al usuario, y el catálogo
// entero se revisa en un diff.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReading } from '../packages/domain/src/reading/validate.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const readingDir = join(seedDir, 'readings');

export function loadReadings() {
  if (!existsSync(readingDir)) {
    return [];
  }

  return readdirSync(readingDir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(join(readingDir, name), 'utf8')));
}

function loadDictionary() {
  const dictionary = [];
  for (const level of [1, 2, 3]) {
    for (const word of JSON.parse(
      readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf8'),
    )) {
      dictionary.push({ hanzi: word.hanzi, pinyin: word.pinyin, hsk_level: level });
    }
  }
  return dictionary;
}

export function validateCatalog() {
  const dictionary = loadDictionary();

  return loadReadings().map(reading => ({
    slug: reading.slug,
    issues: validateReading(reading, {
      dictionary,
      max_level: reading.hsk_level,
      target_word_ids: [],
    }),
  }));
}

if (process.argv[1] && process.argv[1].endsWith('build-readings.js')) {
  const results = validateCatalog();
  const bad = results.filter(entry => entry.issues.length > 0);

  for (const entry of bad) {
    console.error(`\n${entry.slug}`);
    for (const issue of entry.issues) {
      const where =
        issue.sentence_index !== undefined
          ? ` (frase ${issue.sentence_index + 1})`
          : issue.question_index !== undefined
            ? ` (pregunta ${issue.question_index + 1})`
            : '';
      console.error(`  ${issue.kind}${where}${issue.detail ? `: ${issue.detail}` : ''}`);
    }
  }

  console.log(`\n${results.length} lecturas, ${bad.length} con problemas`);
  if (bad.length > 0) process.exit(1);
}
