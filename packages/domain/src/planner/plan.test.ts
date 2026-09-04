import { buildDailyPlan } from './plan';

const base = {
  due_reviews: 12,
  relearning: 3,
  active_unit: { code: '2.2.3', title: '离合词', total_words: 4, settled_words: 1 },
  new_allowance: 10,
  readings: [],
  exercises: [],
  exam_date: null,
};

describe('buildDailyPlan', () => {
  it('pone los repasos vencidos antes que nada', () => {
    expect(buildDailyPlan(base).steps[0].kind).toBe('reviews');
  });

  it('pone el reaprendizaje antes que las palabras nuevas', () => {
    const kinds = buildDailyPlan(base).steps.map((step) => step.kind);

    expect(kinds.indexOf('relearning')).toBeLessThan(kinds.indexOf('new_items'));
  });

  it('declara la lectura como no disponible en vez de omitirla', () => {
    const reading = buildDailyPlan(base).steps.find((step) => step.kind === 'reading');

    expect(reading?.status).toBe('unavailable');
    expect(reading?.reason).toBe('no_content');
  });

  it('enciende la lectura en cuanto hay uno que proponer', () => {
    const plan = buildDailyPlan({
      ...base,
      readings: [{ id: 'r1', topic: 'compras', word_ids: [1, 2, 3] }],
      learner: { target_word_ids: [1, 2, 3], known_word_ids: [], recent_content_ids: [], covered_topics: [] },
    });
    const reading = plan.steps.find((step) => step.kind === 'reading');

    expect(reading?.status).toBe('ready');
    expect(reading?.payload?.id).toBe('r1');
  });

  it('no propone la práctica de examen sin fecha objetivo', () => {
    const exam = buildDailyPlan(base).steps.find((step) => step.kind === 'exam');

    expect(exam?.status).toBe('unavailable');
    expect(exam?.reason).toBe('no_exam_date');
  });

  it('omite las palabras nuevas cuando el cupo diario está agotado', () => {
    const plan = buildDailyPlan({ ...base, new_allowance: 0 });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.status).toBe('unavailable');
    expect(newItems?.reason).toBe('daily_limit_reached');
  });

  it('lleva la unidad activa en el paso de elementos nuevos', () => {
    const newItems = buildDailyPlan(base).steps.find((step) => step.kind === 'new_items');

    expect(newItems?.payload?.unit_title).toBe('离合词');
  });
});
