import {
  getReviewSession,
  setReviewSession,
  clearReviewSession,
  type ReviewSessionSnapshot,
} from './reviewSessionStore';

describe('reviewSessionStore', () => {
  beforeEach(() => {
    clearReviewSession();
  });

  it('starts null', () => {
    expect(getReviewSession()).toBeNull();
  });

  it('stores and retrieves a snapshot', () => {
    const snap: ReviewSessionSnapshot = {
      active: true,
      total: 25,
      reviewed: 8,
      mode: 'recognition',
      startedAt: 1000,
    };
    setReviewSession(snap);
    expect(getReviewSession()).toEqual(snap);
  });

  it('clearReviewSession resets to null', () => {
    setReviewSession({
      active: true,
      total: 10,
      reviewed: 0,
      mode: 'recall',
      startedAt: 0,
    });
    clearReviewSession();
    expect(getReviewSession()).toBeNull();
  });
});
