// El contenido de gramática es un fichero por punto del sílabo
// (server/db/seeds/grammar/<nivel>-<código>.json), validado en la build como
// las lecturas: un ejemplo que no ilustra el punto o usa vocabulario de un
// nivel superior rompe la build en vez de llegar al alumno.
//
// La clave es (nivel, código): 47 códigos se repiten entre niveles, así que el
// nombre del fichero lleva los dos y tiene que casar con lo que declara dentro.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGrammarEntry } from '../packages/domain/src/grammar/validate.ts';
import { loadDictionary } from './build-readings.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const grammarDir = join(rootDir, 'server', 'db', 'seeds', 'grammar');

const LEVELS = [1, 2, 3];

/** Campos que el fichero aporta sobre el punto oficial. */
const CONTENT_FIELDS = ['pattern', 'explanation', 'markers', 'examples', 'common_errors', 'see_also'];

export function grammarFileName(point) {
  return `${point.hsk_level}-${point.code}.json`;
}

export function loadGrammarFiles(dir = grammarDir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (grammarFileName(entry) !== name) {
        throw new Error(
          `${name} declara hsk_level ${entry.hsk_level} y code ${entry.code}: debería llamarse ${grammarFileName(entry)}`,
        );
      }
      return { file: name, entry };
    });
}

export function loadOfficialPoints() {
  return LEVELS.flatMap(level =>
    loadOfficialGrammar(level).map(point => ({ hsk_level: point.hsk_level, code: point.code })),
  );
}

const samePoint = (a, b) => a.hsk_level === b.hsk_level && a.code === b.code;

/** Superpone el contenido de cada fichero sobre su punto, por (nivel, código). */
export function applyGrammarContent(points, entries) {
  for (const point of points) {
    const entry = entries.find(candidate => samePoint(candidate, point));
    if (!entry) continue;

    for (const field of CONTENT_FIELDS) {
      point[field] = entry[field];
    }
  }
  return points;
}

export function buildGrammar({
  dir = grammarDir,
  official = loadOfficialPoints(),
  dictionary = loadDictionary(),
} = {}) {
  const files = loadGrammarFiles(dir);
  const issues = [];

  for (const { file, entry } of files) {
    if (!official.some(point => samePoint(point, entry))) {
      issues.push({ file, kind: 'unknown_point' });
      continue;
    }
    for (const issue of validateGrammarEntry(entry, { dictionary, known_points: official })) {
      issues.push({ file, ...issue });
    }
  }

  const counts = {};
  for (const level of LEVELS) {
    const points = official.filter(point => point.hsk_level === level);
    counts[level] = {
      done: points.filter(point => files.some(({ entry }) => samePoint(entry, point))).length,
      total: points.length,
    };
  }

  const missing = official.filter(point => !files.some(({ entry }) => samePoint(entry, point)));

  return { entries: files.map(({ entry }) => entry), issues, counts, missing };
}

export function summarize(result, { complete }) {
  const levels = LEVELS.map(level => `HSK ${level}: ${result.counts[level].done}/${result.counts[level].total}`);
  const line = `${levels.join(' · ')} · issues: ${result.issues.length}`;
  const ok = result.issues.length === 0 && (!complete || result.missing.length === 0);
  return { line, ok };
}

if (process.argv[1] && process.argv[1].endsWith('build-grammar.js')) {
  const complete = process.argv.includes('--complete');
  const result = buildGrammar();

  for (const issue of result.issues) {
    const where = issue.example_index !== undefined ? ` (ejemplo ${issue.example_index + 1})` : '';
    console.error(`${issue.file}: ${issue.kind}${where}${issue.detail ? `: ${issue.detail}` : ''}`);
  }
  if (complete && result.missing.length > 0) {
    console.error(`Sin fichero: ${result.missing.map(grammarFileName).join(', ')}`);
  }

  const { line, ok } = summarize(result, { complete });
  console.log(line);
  if (!ok) process.exit(1);
}
