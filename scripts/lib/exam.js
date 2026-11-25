// Contenido del simulacro en el repositorio:
//   server/db/seeds/exam-structure.json             estructura (HSK 2, formato 3.0)
//   server/db/seeds/exam/hsk<n>/instructions.json   instrucciones de 听力, comunes a las formas
//   server/db/seeds/exam/hsk<n>/<forma>/<parte>-<nn>.json   un grupo por fichero
// Los grupos de una forma van en el orden de sus ficheros (L1-01, L2-01, L2-02…).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const seedDir = join(rootDir, 'server', 'db', 'seeds');
export const examDir = join(seedDir, 'exam');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const PART_ORDER = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'R4', 'W1', 'W2'];

export function loadExamStructure(dir = seedDir) {
  return readJson(join(dir, 'exam-structure.json'));
}

export function loadExamInstructions(level, dir = examDir) {
  return readJson(join(dir, `hsk${level}`, 'instructions.json'));
}

function groupOrder(file) {
  const [part, number] = file.replace(/\.json$/, '').split('-');
  return [PART_ORDER.indexOf(part), Number(number)];
}

export function loadExamForm(level, code, dir = examDir) {
  const formDir = join(dir, `hsk${level}`, code);
  const files = readdirSync(formDir)
    .filter(file => /^[LRW]\d-\d{2}\.json$/.test(file))
    .sort((left, right) => {
      const [a, b] = [groupOrder(left), groupOrder(right)];
      return a[0] - b[0] || a[1] - b[1];
    });
  return { code, level, groups: files.map(file => readJson(join(formDir, file))) };
}

/** Códigos de las formas de un nivel (directorios bajo exam/hsk<n>/), en orden. */
export function listExamForms(level, dir = examDir) {
  const levelDir = join(dir, `hsk${level}`);
  if (!existsSync(levelDir)) return [];
  return readdirSync(levelDir)
    .filter(entry => statSync(join(levelDir, entry)).isDirectory())
    .sort();
}
