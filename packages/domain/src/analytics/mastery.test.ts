// packages/domain/src/analytics/mastery.test.ts
import { masteryBySkill, syllabusCoverage } from './mastery';

const now = new Date('2026-09-05T00:00:00.000Z');

function state(id: number, skill: string, stability: number, daysAgo = 1) {
  return {
    target_id: id,
    skill,
    stability,
    suspended: false,
    last_reviewed_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

describe('masteryBySkill', () => {
  it('cuenta por habilidad y no las mezcla', () => {
    const states = [state(1, 'recognition', 200), state(1, 'listening', 3), state(2, 'recognition', 200)];

    const result = masteryBySkill(states, now);

    expect(result.recognition.demonstrated).toBe(2);
    expect(result.listening.demonstrated).toBe(0);
  });

  it('acompaña cada cifra con la demostración más antigua', () => {
    // Una demostración de hace dos meses sin repaso posterior no vale lo mismo
    // que una de ayer.
    const states = [state(1, 'recognition', 200, 62), state(2, 'recognition', 200, 3)];

    expect(masteryBySkill(states, now).recognition.oldest_days).toBe(62);
  });

  it('no cuenta lo suspendido como demostrado', () => {
    const suspended = { ...state(1, 'recognition', 200), suspended: true };

    expect(masteryBySkill([suspended], now).recognition.demonstrated).toBe(0);
  });
});

describe('syllabusCoverage', () => {
  it('separa lo que la app enseña de lo que el usuario demuestra', () => {
    const scope = [1, 2, 3, 4];
    const states = [state(1, 'recognition', 200), state(2, 'recognition', 3)];

    const coverage = syllabusCoverage(states, scope, now);

    expect(coverage.in_scope).toBe(4);
    expect(coverage.started).toBe(2);
    expect(coverage.demonstrated).toBe(1);
  });

  it('no divide por cero con un alcance vacío', () => {
    expect(syllabusCoverage([], [], now).percent_demonstrated).toBe(0);
  });
});
