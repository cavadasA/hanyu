export function calculateSrs({ quality, repetitions, easeFactor, interval, today }) {
  let newRepetitions = repetitions;
  let newInterval = interval;
  let newEaseFactor = easeFactor;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(newInterval * newEaseFactor);
    }

    newRepetitions += 1;
  }

  newEaseFactor =
    newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEaseFactor = Math.max(1.3, newEaseFactor);

  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + newInterval);
  const nextReview = date.toISOString().split('T')[0];

  let status;
  if (quality < 3) {
    status = 'learning';
  } else if (newRepetitions === 1) {
    status = 'learning';
  } else if (newInterval >= 21 && newRepetitions >= 5) {
    status = 'mastered';
  } else {
    status = 'review';
  }

  return {
    repetitions: newRepetitions,
    easeFactor: Math.round(newEaseFactor * 100) / 100,
    interval: newInterval,
    nextReview,
    status,
  };
}