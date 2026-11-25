//
// Genera desde las fuentes oficiales las dos listas que el corpus no tenía:
// caracteres y gramática. Las palabras las genera import-hsk-data.js, que
// necesita además el mazo enriquecido.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialCharacters } from './lib/official-terms.js';
import { OFFICIAL_HANDWRITING } from './lib/official-handwriting.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';
import { deriveGrammarPrerequisites } from './lib/grammar-prerequisites.js';
import { deriveUnits } from './lib/derive-units.js';
import { applyGrammarContent, loadGrammarFiles } from './build-grammar.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

const handwriting = new Set([...OFFICIAL_HANDWRITING.hsk_1_2, ...OFFICIAL_HANDWRITING.hsk_3]);
const characters = [];
for (const level of [1, 2, 3]) {
  for (const hanzi of loadOfficialCharacters(level)) {
    characters.push({ hanzi, hsk_level: level, handwriting: handwriting.has(hanzi) });
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

/**
 * El sílabo enumera los puntos de gramática pero no los explica ni los
 * ejemplifica. Ese contenido vive en grammar/<nivel>-<código>.json, validado
 * por build-grammar.js, y se superpone aquí por (nivel, código), igual que
 * sense-glosses-es.json hace con las glosas españolas. Sin esto, cada
 * regeneración borra el trabajo editorial.
 */
applyGrammarContent(grammar, loadGrammarFiles().map(({ entry }) => entry));

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

const corpus = [];
for (const level of [1, 2, 3]) {
  corpus.push(...JSON.parse(readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf-8')));
}

// El corpus no lleva id: lo asigna Postgres al sembrarlo. Aquí se usa el índice
// estable dentro del fichero, y el generador de seed lo resuelve por forma,
// nivel y sentido.
const units = deriveUnits(grammar, corpus.map((word, index) => ({ ...word, id: index })));
writeFileSync(join(seedDir, 'units.json'), JSON.stringify(units, null, 2), 'utf8');
console.log(`unidades: ${units.length} -> units.json`);
