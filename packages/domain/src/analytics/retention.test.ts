// packages/domain/src/analytics/retention.test.ts
import { observedRetention } from './retention';

const now = new Date('2026-09-05T10:00:00.000Z');

function review(daysAgo: number, grade: string, phase = 'review') {
  return {
    occurred_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    grade,
    phase_before: phase,
  };
}

describe('observedRetention', () => {
  it('cuenta como acierto todo lo que no es again', () => {
    const reviews = [review(1, 'good'), review(2, 'hard'), review(3, 'again'), review(4, 'easy')];

    expect(observedRetention(reviews, now, 7).rate).toBeCloseTo(0.75);
  });

  it('funciona con notas numéricas de la base de datos (1=again, 2=hard, 3=good, 4=easy)', () => {
    const reviews = [review(1, '3'), review(2, '2'), review(3, '1'), review(4, '4')];

    expect(observedRetention(reviews, now, 7).rate).toBeCloseTo(0.75);
  });

  it('excluye las tarjetas que estaban en aprendizaje', () => {
    // Fallar algo que ves por segunda vez en diez minutos no dice nada sobre
    // tu retención a treinta días.
    const reviews = [review(1, 'good'), review(1, 'again', 'learning'), review(1, 'again', 'relearning')];

    expect(observedRetention(reviews, now, 7).rate).toBe(1);
    expect(observedRetention(reviews, now, 7).sample).toBe(1);
  });

  it('respeta la ventana pedida', () => {
    const reviews = [review(2, 'good'), review(40, 'again')];

    expect(observedRetention(reviews, now, 7).sample).toBe(1);
    expect(observedRetention(reviews, now, 30).sample).toBe(1);
    expect(observedRetention(reviews, now, 60).sample).toBe(2);
  });

  it('devuelve la distancia al objetivo, con signo', () => {
    const reviews = [review(1, 'good'), review(2, 'good'), review(3, 'again'), review(4, 'good')];

    // 0,75 observado contra 0,9 objetivo: se está repasando demasiado tarde.
    expect(observedRetention(reviews, now, 7, 0.9).target_gap).toBeCloseTo(-0.15);
  });

  it('no inventa una tasa sin muestra', () => {
    // Cero repasos no es cero retención. Devolver 0 aquí haría que la pantalla
    // dijera que no recuerdas nada cuando lo que pasa es que no has estudiado.
    expect(observedRetention([], now, 7).rate).toBeNull();
  });
});
