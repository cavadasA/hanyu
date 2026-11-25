import { describe, expect, it } from 'vitest';
import { READING_TOPICS } from '../packages/domain/src/reading/series.ts';
import {
  COMMUNICATIVE_FUNCTIONS,
  loadCommunicativeTasks,
  validateCommunicativeCatalog,
} from './build-communicative.js';

describe('tareas comunicativas', () => {
  const tasks = loadCommunicativeTasks();

  it('cada tarea pasa validateCommunicativeTask: su respuesta modelo aprueba sus reglas', () => {
    expect(validateCommunicativeCatalog()).toEqual([]);
  });

  it('hay 24 tareas de HSK 2', () => {
    expect(tasks.filter(({ task }) => task.hsk_level === 2)).toHaveLength(24);
  });

  it('dos por cada tema del maestro y una por cada función comunicativa del sílabo', () => {
    const hsk2 = tasks.filter(({ task }) => task.hsk_level === 2).map(({ task }) => task);
    for (const topic of READING_TOPICS) {
      expect(hsk2.filter((task) => task.topic === topic).map((task) => task.slug)).toHaveLength(2);
    }
    for (const fn of COMMUNICATIVE_FUNCTIONS) {
      expect(hsk2.filter((task) => task.function === fn).map((task) => task.slug)).toHaveLength(1);
    }
  });

  it('el fichero se llama como el principio de su slug', () => {
    for (const { file, task } of tasks) {
      expect(task.slug.startsWith(file.replace(/\.json$/, '') + '-')).toBe(true);
    }
  });
});
