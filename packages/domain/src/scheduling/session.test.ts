import { describe, expect, it } from 'vitest';
import { schedulingParams } from './params';
import { applyReview, emptyState, type SchedulingState } from './schedule';
import { MAX_SESSION_SHOWINGS, shouldRequeueInSession } from './session';

const params = schedulingParams({});
const now = new Date('2026-09-06T10:00:00.000Z');

function rate(state: SchedulingState, grade: 'again' | 'hard' | 'good' | 'easy', at = now) {
  return applyReview(state, grade, at, params).state;
}

describe('shouldRequeueInSession', () => {
  it('requeues a new card that is still in learning steps', () => {
    for (const grade of ['again', 'hard', 'good'] as const) {
      const state = rate(emptyState(now), grade);
      expect(state.state).toBe('learning');
      expect(shouldRequeueInSession({ state, shown: 1 })).toBe(true);
    }
  });

  it('does not requeue a card that graduated to review', () => {
    const state = rate(emptyState(now), 'easy');
    expect(state.state).toBe('review');
    expect(shouldRequeueInSession({ state, shown: 1 })).toBe(false);
  });

  it('requeues a lapsed review card that fell back to relearning', () => {
    const review = rate(emptyState(now), 'easy');
    const lapsed = rate(review, 'again', new Date('2026-09-20T10:00:00.000Z'));
    expect(lapsed.state).toBe('relearning');
    expect(shouldRequeueInSession({ state: lapsed, shown: 1 })).toBe(true);
  });

  it('stops requeueing once the card hits the per-session showing cap', () => {
    const state = rate(emptyState(now), 'hard');
    expect(shouldRequeueInSession({ state, shown: MAX_SESSION_SHOWINGS - 1 })).toBe(true);
    expect(shouldRequeueInSession({ state, shown: MAX_SESSION_SHOWINGS })).toBe(false);
    expect(shouldRequeueInSession({ state, shown: MAX_SESSION_SHOWINGS + 1 })).toBe(false);
  });

  it('bounds the Hard fixed point: repeated Hard cannot loop forever', () => {
    // FSRS devuelve 6 minutos y el mismo learning step ante cada Hard, así que
    // sin tope la tarjeta se reencolaría indefinidamente.
    let state = emptyState(now);
    let showings = 0;
    let at = now;

    while (showings < 50) {
      showings += 1;
      state = rate(state, 'hard', at);
      if (!shouldRequeueInSession({ state, shown: showings })) break;
      at = new Date(state.due);
    }

    expect(state.state).toBe('learning');
    expect(showings).toBe(MAX_SESSION_SHOWINGS);
  });

  it('honours an explicit cap', () => {
    const state = rate(emptyState(now), 'good');
    expect(shouldRequeueInSession({ state, shown: 1, max: 1 })).toBe(false);
    expect(shouldRequeueInSession({ state, shown: 1, max: 2 })).toBe(true);
  });
});
