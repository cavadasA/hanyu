// Las tareas comunicativas son contenido del repositorio, como las lecturas:
// cada fichero pasa validateCommunicativeTask antes de entrar al seed. Una
// tarea cuya respuesta modelo no aprueba sus propias reglas rompe la build.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCommunicativeTask } from '../packages/domain/src/expression/validate-task.ts';
import { READING_TOPICS } from '../packages/domain/src/reading/series.ts';
import { loadDictionary } from './build-readings.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const defaultTaskDir = join(seedDir, 'communicative');

/** Funciones comunicativas del sílabo que el Plan 13 cubre con una tarea cada una. */
export const COMMUNICATIVE_FUNCTIONS = ['saludar', 'pedir', 'invitar', 'rechazar', 'disculparse', 'describir'];

export function loadCommunicativeTasks(taskDir = defaultTaskDir) {
  return readdirSync(taskDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, task: JSON.parse(readFileSync(join(taskDir, file), 'utf8')) }));
}

export function communicativeContext() {
  return {
    dictionary: loadDictionary(),
    grammar_points: JSON.parse(readFileSync(join(seedDir, 'grammar-points.json'), 'utf8'))
      .map((point) => ({ hsk_level: point.hsk_level, code: point.code, markers: point.markers ?? [] })),
  };
}

/** Problemas del catálogo, como `fichero: tipo (detalle)`. Vacío = válido. */
export function validateCommunicativeCatalog(taskDir = defaultTaskDir) {
  const ctx = communicativeContext();
  const problems = [];
  const slugs = new Set();

  for (const { file, task } of loadCommunicativeTasks(taskDir)) {
    for (const issue of validateCommunicativeTask(task, ctx)) {
      problems.push(`${file}: ${issue.kind}${issue.detail ? ` (${issue.detail})` : ''}`);
    }
    if (slugs.has(task.slug)) problems.push(`${file}: slug repetido (${task.slug})`);
    slugs.add(task.slug);
    const tagged = [task.topic !== undefined, task.function !== undefined].filter(Boolean).length;
    if (tagged !== 1) {
      problems.push(`${file}: debe tener topic o function, y solo uno`);
    } else if (task.topic !== undefined && !READING_TOPICS.includes(task.topic)) {
      problems.push(`${file}: topic desconocido (${task.topic})`);
    } else if (task.function !== undefined && !COMMUNICATIVE_FUNCTIONS.includes(task.function)) {
      problems.push(`${file}: function desconocida (${task.function})`);
    }
  }
  return problems;
}

if (process.argv[1] && process.argv[1].endsWith('build-communicative.js')) {
  const problems = validateCommunicativeCatalog();
  for (const problem of problems) console.error(problem);
  console.log(`${loadCommunicativeTasks().length} tareas, ${problems.length} problemas`);
  process.exit(problems.length > 0 ? 1 : 0);
}
