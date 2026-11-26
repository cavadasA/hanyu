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

  it('sin mazo no afirma que el cupo de palabras nuevas está agotado', () => {
    const plan = buildDailyPlan({ ...base, new_allowance: 0, deck_size: 0, new_quota_left: 10 });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.status).toBe('unavailable');
    expect(newItems?.reason).toBe('no_deck');
  });

  it('con cupo pendiente y sin palabras nuevas en los mazos lo dice así', () => {
    const plan = buildDailyPlan({ ...base, new_allowance: 0, deck_size: 300, new_quota_left: 10 });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.reason).toBe('no_new_words');
  });

  it('con el cupo gastado sigue diciendo que el límite diario está alcanzado', () => {
    const plan = buildDailyPlan({ ...base, new_allowance: 0, deck_size: 300, new_quota_left: 0 });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.reason).toBe('daily_limit_reached');
  });

  it('declara una unidad no disponible sin afirmar que está completada', () => {
    const plan = buildDailyPlan({ ...base, active_unit: null });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.reason).toBe('unit_unavailable');
  });

  it('mantiene en la ruta una unidad de patrones para estudiarla en gramática', () => {
    const plan = buildDailyPlan({
      ...base,
      active_unit: {
        code: '1.1',
        title: '前缀',
        total_words: 0,
        settled_words: 0,
        word_count: 0,
        grammar_id: 42,
        total_items: 1,
        settled_items: 0,
      },
    });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems).toMatchObject({
      status: 'ready',
      payload: { grammar_id: 42, grammar_only: true, unit_progress: '0/1' },
    });
  });

  it('abre el patrón pendiente de una unidad mixta después de consolidar sus palabras', () => {
    const plan = buildDailyPlan({
      ...base,
      active_unit: {
        code: '2.4',
        title: '比较句',
        total_words: 2,
        settled_words: 2,
        word_count: 2,
        pattern_count: 1,
        grammar_id: 43,
        total_items: 3,
        settled_items: 2,
      },
    });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems).toMatchObject({
      status: 'ready',
      payload: { grammar_id: 43, grammar_only: true, unit_progress: '2/3' },
    });
  });

  it('muestra el progreso de todos los elementos de una unidad mixta', () => {
    const plan = buildDailyPlan({
      ...base,
      active_unit: {
        code: '2.4',
        title: '比较句',
        total_words: 2,
        settled_words: 1,
        word_count: 2,
        pattern_count: 1,
        grammar_id: 43,
        total_items: 3,
        settled_items: 1,
      },
    });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.payload).toMatchObject({ unit_progress: '1/3' });
  });

  it('lleva la unidad activa en el paso de elementos nuevos', () => {
    const newItems = buildDailyPlan(base).steps.find((step) => step.kind === 'new_items');

    expect(newItems?.payload?.unit_title).toBe('离合词');
  });

  it('conserva el progreso de la meta de repasos para la pantalla', () => {
    const plan = buildDailyPlan({
      ...base,
      review_completed: 12,
      review_target: 200,
    });
    const reviews = plan.steps.find((step) => step.kind === 'reviews');

    expect(reviews?.payload).toMatchObject({ count: 12, completed: 12, target: 200 });
  });

  it('no propone material cuyo valor total sea negativo', () => {
    const plan = buildDailyPlan({
      ...base,
      readings: [{ id: 'opaque', topic: null, word_ids: [90, 91, 92, 93, 94] }],
      learner: { target_word_ids: [], known_word_ids: [], recent_content_ids: [], covered_topics: [] },
    });
    const reading = plan.steps.find((step) => step.kind === 'reading');

    expect(reading).toMatchObject({ status: 'unavailable', reason: 'no_suitable_content' });
  });

  it('resuelve los empates de contenido con un orden estable', () => {
    const plan = buildDailyPlan({
      ...base,
      readings: [
        { id: 'b', topic: 'nuevo', word_ids: [1] },
        { id: 'a', topic: 'nuevo', word_ids: [2] },
      ],
      learner: { target_word_ids: [], known_word_ids: [1, 2], recent_content_ids: [], covered_topics: [] },
    });
    const reading = plan.steps.find((step) => step.kind === 'reading');

    expect(reading?.payload?.id).toBe('a');
  });

  it('distingue no tener lecturas de no haber podido mirarlas', () => {
    // "Todavía no hay lecturas" y "no he podido leer el catálogo" piden cosas
    // distintas al usuario. Colapsarlas en no_content esconde una avería.
    const plan = buildDailyPlan({ ...base, readings: [], readings_unavailable: true });
    const reading = plan.steps.find((step) => step.kind === 'reading');

    expect(reading?.status).toBe('unavailable');
    expect(reading?.reason).toBe('content_unavailable');
  });

  // Hoy decía «Todavía no hay ejercicios disponibles» aunque la unidad activa los
  // tenía: el banco no se rankea y el paso declaraba un hueco que no existe.
  it('sin ejercicios rankeados, lleva a la sesión de ejercicios de la unidad con su progreso', () => {
    const plan = buildDailyPlan({ ...base, unit_exercises: { completed: 2, target: 5 } });
    const exercises = plan.steps.find((step) => step.kind === 'exercises');

    expect(exercises).toEqual({ kind: 'exercises', status: 'ready', payload: { completed: 2, target: 5 } });
  });

  it('sin banco de ejercicios de unidad sigue declarando que no hay', () => {
    const exercises = buildDailyPlan(base).steps.find((step) => step.kind === 'exercises');

    expect(exercises?.status).toBe('unavailable');
    expect(exercises?.reason).toBe('no_content');
  });
});
