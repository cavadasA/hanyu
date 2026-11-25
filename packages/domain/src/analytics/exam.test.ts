import { examReadiness, type ExamAttemptSummary } from './exam';

const attempt = (overrides: Partial<ExamAttemptSummary> = {}): ExamAttemptSummary => ({
  scope: 'full',
  repeated: false,
  finished_at: '2026-11-20T10:00:00Z',
  total_percent: 60,
  part_scores: { L1: { correct: 4, total: 5, percent: 80 }, R4: { correct: 2, total: 5, percent: 40 } },
  ...overrides,
});

describe('examReadiness', () => {
  it('sin intentos → null (ninguna métrica sin datos muestra un cero)', () => {
    expect(examReadiness([])).toBeNull();
  });

  it('dos intentos completos → trend con los dos totales en orden cronológico', () => {
    const result = examReadiness([
      attempt({ finished_at: '2026-11-22T10:00:00Z', total_percent: 70 }),
      attempt({ finished_at: '2026-11-20T10:00:00Z', total_percent: 55 }),
    ]);
    expect(result?.trend).toEqual([55, 70]);
    expect(result?.last_percent).toBe(70);
  });

  it('un intento repetido no entra', () => {
    const result = examReadiness([
      attempt({ total_percent: 55 }),
      attempt({ finished_at: '2026-11-24T10:00:00Z', total_percent: 95, repeated: true }),
    ]);
    expect(result?.trend).toEqual([55]);
  });

  it('las partes o secciones sueltas no entran; solo con ellas → null', () => {
    expect(examReadiness([attempt({ scope: 'part' }), attempt({ scope: 'section' })])).toBeNull();
  });

  it('weakest_part es la de menor porcentaje en el último intento', () => {
    const result = examReadiness([
      attempt({ finished_at: '2026-11-20T10:00:00Z', part_scores: { W2: { correct: 0, total: 5, percent: 0 } } }),
      attempt({ finished_at: '2026-11-22T10:00:00Z' }),
    ]);
    expect(result?.weakest_part).toBe('R4');
  });
});
