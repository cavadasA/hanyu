import {
  applyReview,
  cardPhase,
  emptyState,
  isLeech,
  previewIntervals,
  retrievability,
} from './schedule';
import { schedulingParams } from './params';

const params = schedulingParams({});
const now = new Date('2026-09-02T10:00:00.000Z');

describe('applyReview', () => {
  it('un Again devuelve la tarjeta en minutos, no al día siguiente', () => {
    const { interval_minutes } = applyReview(emptyState(now), 'again', now, params);

    expect(interval_minutes).toBeLessThan(60);
  });

  it('guarda la recuperabilidad calculada junto al nuevo estado FSRS', () => {
    const { state } = applyReview(emptyState(now), 'good', now, params);

    expect(state.retrievability).toEqual(expect.any(Number));
    expect(state.retrievability).toBeGreaterThanOrEqual(0);
    expect(state.retrievability).toBeLessThanOrEqual(1);
  });

  it('los cuatro botones programan cosas distintas', () => {
    const intervals = previewIntervals(emptyState(now), now, params);

    expect(new Set(Object.values(intervals)).size).toBe(4);
    expect(intervals.again).toBeLessThan(intervals.hard);
    expect(intervals.hard).toBeLessThan(intervals.good);
    expect(intervals.good).toBeLessThan(intervals.easy);
  });

  it('el intervalo mostrado es el que después se aplica', () => {
    const state = emptyState(now);
    const preview = previewIntervals(state, now, params);
    const applied = applyReview(state, 'good', now, params);

    expect(applied.interval_minutes).toBe(preview.good);
  });

  it('un acierto sobre una tarjeta madura alarga la estabilidad', () => {
    const mature = {
      ...emptyState(now),
      stability: 30,
      difficulty: 5,
      reps: 8,
      state: 'review' as const,
      last_review: new Date('2026-09-01T10:00:00.000Z').toISOString(),
    };

    expect(applyReview(mature, 'good', now, params).state.stability).toBeGreaterThan(30);
  });

  it('un fallo cuenta un lapso y baja la estabilidad', () => {
    const mature = {
      ...emptyState(now),
      stability: 30,
      difficulty: 5,
      reps: 8,
      lapses: 1,
      state: 'review' as const,
      last_review: new Date('2026-09-01T10:00:00.000Z').toISOString(),
    };
    const after = applyReview(mature, 'again', now, params);

    expect(after.state.lapses).toBe(2);
    expect(after.state.stability).toBeLessThan(30);
  });
});

describe('retrievability', () => {
  it('cae con el tiempo transcurrido desde el último repaso', () => {
    const state = {
      ...emptyState(now),
      stability: 10,
      difficulty: 5,
      reps: 3,
      state: 'review' as const,
      last_review: now.toISOString(),
      due: new Date('2026-09-12T10:00:00.000Z').toISOString(),
    };

    const soon = retrievability(state, new Date('2026-09-03T10:00:00.000Z'), params);
    const later = retrievability(state, new Date('2026-09-30T10:00:00.000Z'), params);

    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(later).toBeGreaterThanOrEqual(0);
  });
});

describe('cardPhase', () => {
  it('llama mastered a lo que se recuerda con holgura, no a lo repetido muchas veces', () => {
    const solid = {
      ...emptyState(now),
      stability: 200,
      difficulty: 3,
      reps: 6,
      state: 'review' as const,
      last_review: now.toISOString(),
      due: new Date('2027-01-01T00:00:00.000Z').toISOString(),
    };
    const shaky = { ...solid, stability: 5 };

    expect(cardPhase(solid, now, params)).toBe('mastered');
    expect(cardPhase(shaky, now, params)).toBe('review');

    const overdue = {
      ...solid,
      last_review: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    };
    expect(cardPhase(overdue, now, params)).toBe('review');
  });
});

describe('isLeech', () => {
  it('marca la tarjeta que se ha fallado una y otra vez', () => {
    expect(isLeech({ ...emptyState(now), lapses: 8 })).toBe(true);
    expect(isLeech({ ...emptyState(now), lapses: 3 })).toBe(false);
  });
});
