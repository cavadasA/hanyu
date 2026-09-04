import { describe, expect, it } from 'vitest';
import { orderExercises } from './order';

describe('orderExercises', () => {
  it('ordena de reconocimiento a producción sin mutar la entrada', () => {
    const exercises = [
      { slug: 'dictation', type: 'dictation' as const },
      { slug: 'reorder', type: 'reorder' as const },
      { slug: 'matching', type: 'matching' as const },
      { slug: 'fill', type: 'fill_blank' as const },
    ];

    expect(orderExercises(exercises).map((exercise) => exercise.slug)).toEqual([
      'matching',
      'reorder',
      'fill',
      'dictation',
    ]);
    expect(exercises.map((exercise) => exercise.slug)).toEqual([
      'dictation',
      'reorder',
      'matching',
      'fill',
    ]);
  });
});
