//
// Responde la pregunta que la auditoría dejó sin respuesta: qué porcentaje del
// sílabo HSK 3.0 está realmente en la app. Cubre solo la mitad de contenido;
// la mitad de aprendizaje —qué ha demostrado el usuario— llega con el Plan 9.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialWords, loadOfficialCharacters } from './lib/official-terms.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';
import { verifyLocalSources } from './fetch-syllabus.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

const readSeed = (name) => JSON.parse(readFileSync(join(seedDir, name), 'utf8'));
const percent = (covered, total) => (total === 0 ? 0 : Math.round((covered / total) * 100));

export function buildCoverageReport() {
  const manifest = JSON.parse(readFileSync(join(rootDir, 'data', 'sources.json'), 'utf8'));
  const characters = readSeed('hsk-characters.json');
  const grammar = readSeed('grammar-points.json');

  const vocabulary = {};
  const charactersByLevel = {};
  const grammarByLevel = {};

  for (const level of [1, 2, 3]) {
    const corpus = readSeed(`hsk${level}-words.json`);
    const official = loadOfficialWords(level);
    const have = new Set(corpus.map((row) => `${row.hanzi}#${row.sense_index ?? ''}`));
    const covered = official.filter((term) =>
      have.has(`${term.form}#${term.sense_index ?? ''}`),
    ).length;

    vocabulary[level] = {
      official: official.length,
      covered,
      with_spanish: corpus.filter((row) => row.meaning_es).length,
      percent: percent(covered, official.length),
    };

    const officialChars = loadOfficialCharacters(level);
    const haveChars = new Set(
      characters.filter((entry) => entry.hsk_level === level).map((entry) => entry.hanzi),
    );
    const coveredChars = officialChars.filter((hanzi) => haveChars.has(hanzi)).length;
    charactersByLevel[level] = {
      official: officialChars.length,
      covered: coveredChars,
      percent: percent(coveredChars, officialChars.length),
    };

    const officialGrammar = loadOfficialGrammar(level);
    const coveredGrammar = grammar.filter((point) => point.hsk_level === level).length;
    grammarByLevel[level] = {
      official: officialGrammar.length,
      covered: coveredGrammar,
      percent: percent(coveredGrammar, officialGrammar.length),
    };
  }

  return {
    revision: manifest.revision,
    sources: verifyLocalSources(),
    vocabulary,
    characters: charactersByLevel,
    grammar: grammarByLevel,
  };
}

if (process.argv[1] && process.argv[1].endsWith('coverage-report.js')) {
  const report = buildCoverageReport();
  console.log(`Sílabo HSK 3.0, revisión ${report.revision}`);

  const bad = report.sources.filter((entry) => entry.status !== 'ok');
  console.log(
    bad.length === 0
      ? 'Fuentes: las 12 coinciden con el manifiesto.'
      : `Fuentes: ${bad.length} con problemas -> ${bad.map((e) => `${e.id}:${e.status}`).join(', ')}`,
  );

  for (const level of [1, 2, 3]) {
    const v = report.vocabulary[level];
    const c = report.characters[level];
    const g = report.grammar[level];
    console.log(
      `HSK ${level}: vocabulario ${v.covered}/${v.official} (${v.percent} %), ` +
        `español ${v.with_spanish}/${v.covered}, ` +
        `caracteres ${c.covered}/${c.official} (${c.percent} %), ` +
        `gramática ${g.covered}/${g.official} (${g.percent} %)`,
    );
  }
}
