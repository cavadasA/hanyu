import { describe, expect, it } from 'vitest';
import { validateExercise } from './validate';

const context = {
  dictionary: [
    { id: 1, hanzi: '我', pinyin: 'wǒ', hsk_level: 1 },
    { id: 2, hanzi: '喜欢', pinyin: 'xǐhuan', hsk_level: 1 },
    { id: 3, hanzi: '喝', pinyin: 'hē', hsk_level: 1 },
    { id: 4, hanzi: '茶', pinyin: 'chá', hsk_level: 1 },
    { id: 5, hanzi: '贵', pinyin: 'guì', hsk_level: 1 },
    { id: 6, hanzi: '咖啡', pinyin: 'kāfēi', hsk_level: 2 },
    { id: 7, hanzi: '比', pinyin: 'bǐ', hsk_level: 2 },
  ],
  max_level: 2,
  units: [
    { code: '6.3.4', hsk_level: 2 },
    { code: '2.2.1', hsk_level: 1 },
  ],
};

const valid = {
  slug: 'l2-bi-comparison-01',
  type: 'fill_blank' as const,
  hsk_level: 2,
  unit_code: '6.3.4',
  target_word_id: 7,
  prompt: { sentence: '咖啡___茶贵。', options: ['比', '喜欢', '喝', '茶'], correct: '比' },
  explanation: '比 compara dos cosas: A 比 B + adjetivo.',
};

describe('validateExercise', () => {
  it('acepta un ejercicio correcto', () => {
    expect(validateExercise(valid, context)).toEqual([]);
  });

  it('exige que la respuesta esté entre las opciones', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, correct: '虽然' } };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'answer_not_in_options',
    );
  });

  it('rechaza opciones de vocabulario por encima del nivel', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, options: ['比', '图书馆', '喝', '茶'] } };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'unknown_vocabulary',
    );
  });

  it('rechaza un correct_order que no es la misma permutación que words', () => {
    const broken = {
      ...valid,
      type: 'reorder' as const,
      prompt: {
        words: ['我', '喜欢', '喝'],
        correct_order: ['我', '喜欢', '茶'],
      },
    };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'invalid_reorder',
    );
  });

  it('rechaza una unidad de otro nivel', () => {
    const broken = { ...valid, unit_code: '2.2.1' };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'unit_level_mismatch',
    );
  });

  it('exige explicaciones comprensibles en español', () => {
    const broken = { ...valid, explanation: '“比”表示两个对象之间的比较。' };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'explanation_not_spanish',
    );
  });

  it('rechaza opciones repetidas', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, options: ['比', '比', '喝', '茶'] } };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'duplicate_options',
    );
  });

  it('rechaza vocabulario fuera de nivel', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, sentence: '咖啡___图书馆贵。' } };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'unknown_vocabulary',
    );
  });

  it('exige que fill_blank tenga un hueco', () => {
    const broken = { ...valid, prompt: { ...valid.prompt, sentence: '咖啡比茶贵。' } };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain('no_blank');
  });

  it('exige una explicación que no sea solo la traducción de la respuesta', () => {
    const broken = { ...valid, explanation: "比 (bǐ) means 'than'." };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain(
      'gloss_not_explanation',
    );
  });

  it('exige que el ejercicio declare a qué unidad pertenece', () => {
    const broken = { ...valid, unit_code: '' };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain('no_unit');
  });

  it('exige un target_word_id del nivel permitido', () => {
    const broken = { ...valid, target_word_id: 999 };

    expect(validateExercise(broken, context).map((issue) => issue.kind)).toContain('invalid_target');
  });
});
