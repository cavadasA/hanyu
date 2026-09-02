//
// Genera desde las fuentes oficiales las dos listas que el corpus no tenía:
// caracteres y gramática. Las palabras las genera import-hsk-data.js, que
// necesita además el mazo enriquecido.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialCharacters } from './lib/official-terms.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';
import { deriveGrammarPrerequisites } from './lib/grammar-prerequisites.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

const characters = [];
for (const level of [1, 2, 3]) {
  for (const hanzi of loadOfficialCharacters(level)) {
    characters.push({ hanzi, hsk_level: level });
  }
}
writeFileSync(
  join(seedDir, 'hsk-characters.json'),
  JSON.stringify(characters, null, 2),
  'utf8',
);
console.log(`caracteres: ${characters.length} -> hsk-characters.json`);

const grammar = [];
for (const level of [1, 2, 3]) {
  grammar.push(...loadOfficialGrammar(level));
}
writeFileSync(
  join(seedDir, 'grammar-points.json'),
  JSON.stringify(grammar, null, 2),
  'utf8',
);
console.log(`gramática: ${grammar.length} -> grammar-points.json`);

const prerequisites = deriveGrammarPrerequisites(grammar);
writeFileSync(
  join(seedDir, 'grammar-prerequisites.json'),
  JSON.stringify(prerequisites, null, 2),
  'utf8',
);
console.log(`prerrequisitos: ${prerequisites.length} -> grammar-prerequisites.json`);
