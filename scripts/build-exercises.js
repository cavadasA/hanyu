// El banco se crea en tiempo de construcción: cada ejercicio es un fichero
// que pasa por el mismo contrato antes de entrar en el seed de Supabase.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExercise } from '../packages/domain/src/exercises/validate.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const exerciseDir = join(seedDir, 'exercises');
const MINIMUM_PER_COMBINATION = 6;
const TYPES = ['fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching'];

export function loadExercises() {
  if (!existsSync(exerciseDir)) return [];

  return readdirSync(exerciseDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const exercise = JSON.parse(readFileSync(join(exerciseDir, name), 'utf8'));
      const expectedSlug = name.slice(0, -'.json'.length);
      if (exercise.slug !== expectedSlug) {
        throw new Error(`Exercise slug ${exercise.slug} must match filename ${name}`);
      }
      return exercise;
    })
    .sort((left, right) => String(left.slug).localeCompare(String(right.slug)));
}

function loadDictionary() {
  const dictionary = [];
  for (const level of [1, 2, 3]) {
    for (const word of JSON.parse(readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf8'))) {
      dictionary.push({ hanzi: word.hanzi, pinyin: word.pinyin, hsk_level: level });
    }
  }
  return dictionary;
}

export function validateBank() {
  const dictionary = loadDictionary();
  return loadExercises().map((exercise) => ({
    slug: exercise.slug,
    issues: validateExercise(exercise, {
      dictionary,
      max_level: exercise.hsk_level,
    }),
  }));
}

export function countByCombination(exercises = loadExercises()) {
  const counts = new Map();
  for (const exercise of exercises) {
    const key = `${exercise.hsk_level}:${exercise.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function missingCombinations(exercises = loadExercises()) {
  const counts = countByCombination(exercises);
  const missing = [];

  for (const level of [1, 2, 3]) {
    for (const type of TYPES) {
      const count = counts.get(`${level}:${type}`) ?? 0;
      if (count < MINIMUM_PER_COMBINATION) {
        missing.push({ level, type, count, minimum: MINIMUM_PER_COMBINATION });
      }
    }
  }

  return missing;
}

if (process.argv[1] && process.argv[1].endsWith('build-exercises.js')) {
  const exercises = loadExercises();
  const results = validateBank();
  const bad = results.filter((entry) => entry.issues.length > 0);
  const missing = missingCombinations(exercises);

  for (const entry of bad) {
    console.error(`\n${entry.slug}`);
    for (const issue of entry.issues) {
      console.error(`  ${issue.kind}${issue.detail ? `: ${issue.detail}` : ''}`);
    }
  }

  const counts = Object.fromEntries(countByCombination(exercises));
  console.log(`\n${exercises.length} ejercicios, ${bad.length} con problemas`);
  console.log(`Cobertura por combinación: ${JSON.stringify(counts)}`);

  if (missing.length > 0) {
    for (const entry of missing) {
      console.error(`  coverage ${entry.level}:${entry.type} ${entry.count}/${entry.minimum}`);
    }
  }

  if (bad.length > 0 || missing.length > 0) process.exit(1);
}
