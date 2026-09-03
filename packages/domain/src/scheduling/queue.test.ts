import { describe, expect, it } from 'vitest';
import { schedulingParams } from './params';
import { emptyState } from './schedule';
import { orderQueue } from './queue';

const params = schedulingParams({});
const now = new Date('2026-09-02T10:00:00.000Z');

function card(id: string, over: Partial<ReturnType<typeof emptyState>>, extra: object = {}) {
  return { id, is_new: false, scheduling: { ...emptyState(now), ...over }, ...extra };
}

describe('orderQueue', () => {
  it('pone primero lo que está más cerca de olvidarse', () => {
    const solid = card('solid', {
      state: 'review', stability: 60, difficulty: 5, reps: 5,
      last_review: '2026-08-03T10:00:00.000Z', due: '2026-09-02T00:00:00.000Z',
    });
    const shaky = card('shaky', {
      state: 'review', stability: 3, difficulty: 8, reps: 2,
      last_review: '2026-08-03T10:00:00.000Z', due: '2026-09-02T00:00:00.000Z',
    });

    expect(orderQueue([solid, shaky], now, params, 'due').map((c) => c.id)).toEqual([
      'shaky',
      'solid',
    ]);
  });

  it('mete las tarjetas nuevas después de los repasos', () => {
    const review = card('review', { state: 'review', stability: 10, reps: 3 });
    const fresh = { ...card('fresh', {}), is_new: true };

    expect(orderQueue([fresh, review], now, params, 'due').map((c) => c.id)).toEqual([
      'review',
      'fresh',
    ]);
  });

  it('ordena las nuevas por frecuencia cuando esa es la estrategia', () => {
    const rare = { ...card('rare', {}, { frequency: 900 }), is_new: true };
    const common = { ...card('common', {}, { frequency: 5 }), is_new: true };

    expect(orderQueue([rare, common], now, params, 'frequency').map((c) => c.id)).toEqual([
      'common',
      'rare',
    ]);
  });

  it('no altera la lista que recibe', () => {
    const input = [card('a', {}), card('b', {})];
    const copy = [...input];

    orderQueue(input, now, params, 'due');

    expect(input).toEqual(copy);
  });
});
