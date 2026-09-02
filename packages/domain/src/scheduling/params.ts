import { generatorParameters, type FSRSParameters } from 'ts-fsrs';

const MIN_RETENTION = 0.7;
const MAX_RETENTION = 0.97;
export const DEFAULT_RETENTION = 0.9;

export interface SchedulingSettings {
  request_retention?: number | null;
}

export function schedulingParams(input: SchedulingSettings): FSRSParameters {
  const requested = Number(input.request_retention);
  const retention = Number.isFinite(requested)
    ? Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, requested))
    : DEFAULT_RETENTION;

  return generatorParameters({
    request_retention: retention,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    enable_short_term: true,
    enable_fuzz: false,
  });
}
