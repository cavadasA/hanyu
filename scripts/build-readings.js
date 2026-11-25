// El contenido se crea en tiempo de construcción, no de ejecución: cada lectura
// es un fichero del repositorio que pasa por los validadores antes de entrar al
// seed. Un texto malo rompe la build en vez de llegar al usuario, y el catálogo
// entero se revisa en un diff.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReading } from '../packages/domain/src/reading/validate.ts';
import {
  COMPLETENESS_KINDS,
  validateCatalogShape,
} from '../packages/domain/src/reading/series.ts';
import { defaultContentDir, defaultIndexFile, findManifests } from './lib/media.js';
import { clipKey } from './lib/reading-audio.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const defaultReadingDir = join(seedDir, 'readings');
const defaultSeriesFile = join(seedDir, 'reading-series.json');

export function loadSeries(seriesFile = defaultSeriesFile) {
  return JSON.parse(readFileSync(seriesFile, 'utf8'));
}

export function loadReadings(readingDir = defaultReadingDir) {
  if (!existsSync(readingDir)) {
    return [];
  }

  return readdirSync(readingDir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const reading = JSON.parse(readFileSync(join(readingDir, name), 'utf8'));
      const expectedSlug = name.slice(0, -'.json'.length);
      if (reading.slug !== expectedSlug) {
        throw new Error(`Reading slug ${reading.slug} must match filename ${name}`);
      }
      return reading;
    })
    .sort((a, b) => {
      if (a.hsk_level !== b.hsk_level) return a.hsk_level - b.hsk_level;
      if (a.series !== b.series) {
        if (a.series === null || a.series === undefined) return 1;
        if (b.series === null || b.series === undefined) return -1;
        return String(a.series).localeCompare(String(b.series));
      }
      const aIndex = a.series_index ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.series_index ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a.slug).localeCompare(String(b.slug));
    });
}

export function loadDictionary() {
  const dictionary = [];
  for (const level of [1, 2, 3]) {
    for (const word of JSON.parse(
      readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf8'),
    )) {
      dictionary.push({ hanzi: word.hanzi, pinyin: word.pinyin, hsk_level: level });
      // El sílabo da formas alternativas en la misma entrada: 没（有）, 有时（候）.
      // Ambas son vocabulario del nivel.
      for (const variant of word.variants ?? []) {
        if (variant !== word.hanzi) {
          dictionary.push({ hanzi: variant, pinyin: word.pinyin, hsk_level: level });
        }
      }
    }
  }
  return dictionary;
}

function loadGrammarPoints() {
  return JSON.parse(readFileSync(join(seedDir, 'grammar-points.json'), 'utf8'))
    .map(point => ({ code: point.code, hsk_level: point.hsk_level }));
}

/** Nombres de los personajes de la serie de una lectura: sólo ésos se aceptan en su texto. */
function properNounsFor(reading, series) {
  const declaration = series.find(entry => entry.code === reading.series);
  return declaration ? declaration.characters.map(character => character.name) : [];
}

/**
 * Audio de una lectura: el `kind` de su manifiesto y un clip por frase sacado de
 * media-index.json (que build-media sólo rellena si el manifiesto valida). Sin
 * manifiesto, 'tts' y ningún clip. Con manifiesto, cada frase sin clip es un
 * `clip_missing`: nunca se sirve el audio de otra frase.
 */
export function readingAudio(reading, { manifest, indexEntry }) {
  if (!manifest) {
    return { audio_kind: 'tts', sentence_audio: reading.sentences.map(() => null), issues: [] };
  }

  const issues = [];
  const sentence_audio = reading.sentences.map((_, index) => {
    const clip = indexEntry?.[clipKey(index)];
    if (!clip) {
      issues.push({ kind: 'clip_missing', sentence_index: index });
      return null;
    }
    return { path: clip.path, duration_ms: clip.duration_ms };
  });
  return { audio_kind: manifest.kind, sentence_audio, issues };
}

/** Manifiesto y entrada de media-index.json de cada lectura, por slug. */
export function loadReadingAudio({ audioDir = defaultContentDir, mediaIndexFile = defaultIndexFile } = {}) {
  const index = existsSync(mediaIndexFile) ? JSON.parse(readFileSync(mediaIndexFile, 'utf8')) : {};
  const manifests = new Map(
    findManifests(audioDir).map(({ owner, manifest }) => [owner, manifest]),
  );
  return reading => readingAudio(reading, {
    manifest: manifests.get(`readings/${reading.slug}`) ?? null,
    indexEntry: index[`readings/${reading.slug}`],
  });
}

export function validateCatalog({ readingsDir, seriesFile, audioDir, mediaIndexFile } = {}) {
  const dictionary = loadDictionary();
  const grammar_points = loadGrammarPoints();
  const series = loadSeries(seriesFile);
  const audioOf = loadReadingAudio({ audioDir, mediaIndexFile });

  return loadReadings(readingsDir).map(reading => ({
    slug: reading.slug,
    issues: [
      ...validateReading(reading, {
        dictionary,
        max_level: reading.hsk_level,
        target_word_ids: [],
        grammar_points,
        proper_nouns: properNounsFor(reading, series),
      }),
      ...audioOf(reading).issues,
    ],
  }));
}

/**
 * Forma del catálogo. Mientras las series se van llenando, los huecos y los
 * temas sin serie no cuentan; con `complete` (el corpus se declara terminado)
 * cuentan todos.
 */
export function validateCatalogStructure({ readingsDir, seriesFile, complete = false } = {}) {
  const readings = loadReadings(readingsDir).filter(reading => reading.hsk_level === 2);
  const issues = validateCatalogShape(readings, loadSeries(seriesFile));
  return complete ? issues : issues.filter(issue => !COMPLETENESS_KINDS.includes(issue.kind));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && process.argv[1].endsWith('build-readings.js')) {
  const options = {
    readingsDir: argValue('--readings'),
    seriesFile: argValue('--series'),
    complete: process.argv.includes('--complete'),
  };
  const results = validateCatalog(options);
  const bad = results.filter(entry => entry.issues.length > 0);
  const structure = validateCatalogStructure(options);

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

  if (structure.length > 0) {
    console.error('\ncatálogo');
    for (const issue of structure) {
      console.error(`  ${issue.kind}: ${issue.detail}`);
    }
  }

  console.log(`\n${results.length} lecturas, ${bad.length} con problemas`);
  if (bad.length > 0 || structure.length > 0) process.exit(1);
}
