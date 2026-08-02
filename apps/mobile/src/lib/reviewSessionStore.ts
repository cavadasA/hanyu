export type ReviewMode = 'recognition' | 'recall' | 'listening';

export interface ReviewSessionSnapshot {
  active: boolean;
  total: number;
  reviewed: number;
  mode: ReviewMode;
  startedAt: number;
}

let session: ReviewSessionSnapshot | null = null;

export function getReviewSession(): ReviewSessionSnapshot | null {
  return session;
}

export function setReviewSession(newSession: ReviewSessionSnapshot): void {
  session = newSession;
}

export function clearReviewSession(): void {
  session = null;
}
