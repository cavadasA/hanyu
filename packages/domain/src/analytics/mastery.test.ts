// packages/domain/src/analytics/mastery.test.ts
import { isDemonstrated, masteryBySkill, syllabusCoverage } from './mastery';

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
    expect(syllabusCoverage([], 0, now).percent_demonstrated).toBe(0);
  });

  it('soporta el conteo de alcance como número sin tener que serializar arrays de ids', () => {
    const states = [
      { ...state(1, 'recognition', 200), in_scope: true },
      { ...state(2, 'recognition', 3), in_scope: true },
    ];

    const coverage = syllabusCoverage(states, 10, now);

    expect(coverage.in_scope).toBe(10);
    expect(coverage.started).toBe(2);
    expect(coverage.demonstrated).toBe(1);
    expect(coverage.percent_demonstrated).toBe(10);
  });

  it('deduplica ids si el alcance se proporciona como array con duplicados', () => {
    const scopeWithDups = [1, 1, 2, 2, 3];
    const states = [state(1, 'recognition', 200), state(2, 'recognition', 3)];

    const coverage = syllabusCoverage(states, scopeWithDups, now);

    expect(coverage.in_scope).toBe(3);
    expect(coverage.started).toBe(2);
    expect(coverage.demonstrated).toBe(1);
    expect(coverage.percent_demonstrated).toBe(33);
  });

  it('no asume in_scope como true cuando el alcance es numérico para evitar pasar del 100 %', () => {
    // Si un estado no tiene in_scope marcado explícitamente como true,
    // no debe contarse dentro del alcance numérico.
    const states = [
      { ...state(1, 'recognition', 200), in_scope: true },
      state(2, 'recognition', 200), // in_scope ausente (undefined)
    ];

    const coverage = syllabusCoverage(states, 1, now);

    expect(coverage.in_scope).toBe(1);
    expect(coverage.demonstrated).toBe(1);
    expect(coverage.percent_demonstrated).toBe(100);
  });
});

describe('isDemonstrated', () => {
  it('requiere que la retención actual no haya decaído por debajo del umbral', () => {
    // Estabilidad 40 días pero sin repasar en 60 días: retención < 0.90, ya no está demostrada
    const decayed = state(1, 'recognition', 40, 60);
    expect(isDemonstrated(decayed, now)).toBe(false);

    // Estabilidad 40 días repasada hace 10 días: retención >= 0.90, demostrada
    const fresh = state(1, 'recognition', 40, 10);
    expect(isDemonstrated(fresh, now)).toBe(true);
  });

  it('respeta la retención objetivo configurada (0.95 vs 0.90)', () => {
    // Con estabilidad 40 días y repasada hace 32 días:
    // A 0.90 de retención objetivo aún está por encima del umbral
    // A 0.95 de retención objetivo ya ha decaído por debajo de 0.95
    const card = state(1, 'recognition', 40, 32);
    expect(isDemonstrated(card, now, 0.90)).toBe(true);
    expect(isDemonstrated(card, now, 0.95)).toBe(false);
  });

  it('descarta estados sin fecha de repaso o suspendidos', () => {
    const noDate = { ...state(1, 'recognition', 40, 10), last_reviewed_at: null };
    expect(isDemonstrated(noDate, now)).toBe(false);

    const suspended = { ...state(1, 'recognition', 40, 10), suspended: true };
    expect(isDemonstrated(suspended, now)).toBe(false);
  });
});
