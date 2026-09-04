import { describe, expect, it } from 'vitest';
import { validateExercise } from './validate';

const context = {
  dictionary: [
    { hanzi: '我', pinyin: 'wǒ', hsk_level: 1 },
    { hanzi: '喜欢', pinyin: 'xǐhuan', hsk_level: 1 },
    { hanzi: '喝', pinyin: 'hē', hsk_level: 1 },
    { hanzi: '茶', pinyin: 'chá', hsk_level: 1 },
    { hanzi: '贵', pinyin: 'guì', hsk_level: 1 },
    { hanzi: '咖啡', pinyin: 'kāfēi', hsk_level: 2 },
    { hanzi: '比', pinyin: 'bǐ', hsk_level: 2 },
  ],
  max_level: 2,
};

const valid = {
  slug: 'l2-bi-comparison-01',
  type: 'fill_blank' as const,
  hsk_level: 2,
  unit_code: '6.3.4',
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
});
