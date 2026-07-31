/** Bounded exponential backoff delays for transient sync retries (ms). */
export const SYNC_BACKOFF_DELAYS_MS = [1000, 2000, 5000, 10000, 30000] as const;

export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));
