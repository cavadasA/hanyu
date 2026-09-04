import { describe, expect, it } from 'vitest';
import { loadExercises, validateBank } from './build-exercises.js';

describe('banco de ejercicios', () => {
  it('carga un fichero por ejercicio con slug único', () => {
    const exercises = loadExercises();
    const slugs = exercises.map((exercise) => exercise.slug);

    expect(exercises.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('tiene al menos seis ejercicios por combinación nivel y tipo', () => {
    const exercises = loadExercises();
    const counts = new Map();

    for (const exercise of exercises) {
      const key = `${exercise.hsk_level}:${exercise.type}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const level of [1, 2, 3]) {
      for (const type of ['fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching']) {
        expect(counts.get(`${level}:${type}`) ?? 0).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('todo el banco pasa los validadores', () => {
    expect(validateBank().filter((entry) => entry.issues.length > 0)).toEqual([]);
  });
});
