import { rankContent } from './rank';

const learner = {
  target_word_ids: [1, 2, 3, 4, 5, 6],
  known_word_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  recent_content_ids: [],
  covered_topics: [],
};

const item = {
  id: 'r1',
  topic: 'compras',
  word_ids: [1, 2, 3, 10, 11, 12, 13, 14, 15, 16],
};

describe('rankContent', () => {
  it('sube el valor cuando la lectura refuerza palabras objetivo', () => {
    const few = rankContent({ ...item, word_ids: [1, 10, 11, 12] }, learner);
    const many = rankContent(item, learner);

    expect(many.value).toBeGreaterThan(few.value);
  });

  it('penaliza el exceso de vocabulario desconocido', () => {
    const comprehensible = rankContent(item, learner);
    const opaque = rankContent(
      { ...item, word_ids: [90, 91, 92, 93, 94, 95, 96, 1, 2, 3] },
      learner,
    );

    expect(opaque.value).toBeLessThan(comprehensible.value);
  });

  it('penaliza lo visto hace poco', () => {
    const fresh = rankContent(item, learner);
    const repeated = rankContent(item, { ...learner, recent_content_ids: ['r1'] });

    expect(repeated.value).toBeLessThan(fresh.value);
  });

  it('premia un tema del sílabo que aún no se ha tocado', () => {
    const uncovered = rankContent(item, learner);
    const covered = rankContent(item, { ...learner, covered_topics: ['compras'] });

    expect(uncovered.value).toBeGreaterThan(covered.value);
  });

  it('explica cada término que movió el valor', () => {
    const { reasons } = rankContent(item, learner);

    expect(reasons.map((reason) => reason.kind)).toContain('reinforces_targets');
    expect(reasons.find((reason) => reason.kind === 'reinforces_targets')?.count).toBe(3);
  });

  it('no premia una lectura sin ninguna palabra', () => {
    expect(rankContent({ ...item, word_ids: [] }, learner).value).toBe(0);
  });

  it('penaliza un texto sin nada nuevo por encima del máximo comprensible', () => {
    const veryEasy = rankContent({ ...item, word_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }, learner);
    const slightlyHarder = rankContent({ ...item, word_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18, 90] }, learner);

    expect(veryEasy.value).toBeLessThan(slightlyHarder.value);
    expect(veryEasy.reasons.map((reason) => reason.kind)).toContain('too_easy');
  });
});
