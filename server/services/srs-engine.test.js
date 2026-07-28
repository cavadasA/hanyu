import { describe, it, expect } from 'vitest';
import { calculateSrs } from './srs-engine.js';

describe('SM-2 SRS Engine', () => {
  const today = '2026-07-28';

  it('resets on quality < 3 (failed review)', () => {
    const result = calculateSrs({
      quality: 2,
      repetitions: 5,
      easeFactor: 2.5,
      interval: 30,
      today,
    });

    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('learning');
  });

  it('first correct review sets interval to 1', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      today,
    });

    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('learning');
  });

  it('second correct review sets interval to 6', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 1,
      easeFactor: 2.5,
      interval: 1,
      today,
    });

    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(6);
    expect(result.status).toBe('review');
  });

  it('subsequent reviews multiply interval by ease factor', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 2,
      easeFactor: 2.5,
      interval: 6,
      today,
    });

    expect(result.repetitions).toBe(3);
    expect(result.interval).toBe(15);
    expect(result.status).toBe('review');
  });

  it('calculates correct next review date', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      today: '2026-07-28',
    });

    expect(result.nextReview).toBe('2026-07-29');
  });

  it('adjusts ease factor based on quality', () => {
    const easy = calculateSrs({
      quality: 5,
      repetitions: 2,
      easeFactor: 2.5,
      interval: 6,
      today,
    });
    const hard = calculateSrs({
      quality: 3,
      repetitions: 2,
      easeFactor: 2.5,
      interval: 6,
      today,
    });

    expect(easy.easeFactor).toBeGreaterThan(2.5);
    expect(hard.easeFactor).toBeLessThan(2.5);
  });

  it('ease factor never drops below 1.3', () => {
    const result = calculateSrs({
      quality: 3,
      repetitions: 2,
      easeFactor: 1.3,
      interval: 6,
      today,
    });

    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('marks as mastered after many successful reviews', () => {
    const result = calculateSrs({
      quality: 5,
      repetitions: 10,
      easeFactor: 2.5,
      interval: 60,
      today,
    });

    expect(result.status).toBe('mastered');
  });
});