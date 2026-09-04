import { describe, expect, it } from 'vitest';
import { validateReading } from './validate';

const dictionary = [
  { hanzi: '我', pinyin: 'wǒ', hsk_level: 1 },
  { hanzi: '喜欢', pinyin: 'xǐhuān', hsk_level: 1 },
  { hanzi: '喝', pinyin: 'hē', hsk_level: 1 },
  { hanzi: '茶', pinyin: 'chá', hsk_level: 1 },
  { hanzi: '比', pinyin: 'bǐ', hsk_level: 2 },
  { hanzi: '咖啡', pinyin: 'kāfēi', hsk_level: 2 },
  { hanzi: '好喝', pinyin: 'hǎohē', hsk_level: 2 },
];

const context = { dictionary, max_level: 2, target_word_ids: [] };
const validSentence = {
  zh: '我喜欢喝茶，茶比咖啡好喝。',
  pinyin: 'Wǒ xǐhuān hē chá, chá bǐ kāfēi hǎohē.',
  es: 'Me gusta beber té; el té está más rico que el café.',
};

const valid = {
  slug: 'tea-vs-coffee',
  title: '茶和咖啡',
  hsk_level: 2,
  format: 'short_text',
  topic: 'comida',
  sentences: Array.from({ length: 8 }, () => ({ ...validSentence })),
  target_words: ['比'],
  target_grammar: ['6.3.4'],
  questions: [
    {
      prompt: '说话人更喜欢什么？',
      options: ['茶', '咖啡', '水'],
      answer_index: 0,
      evidence_sentence: 1,
    },
  ],
};

describe('validateReading', () => {
  it('acepta una lectura correcta', () => {
    expect(validateReading(valid, context)).toEqual([]);
  });

  it('rechaza vocabulario por encima del nivel', () => {
    const reading = {
      ...valid,
      sentences: [{ zh: '我喜欢喝茶。图书馆。', pinyin: '...', es: '...' }],
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('unknown_vocabulary');
  });

  it('exige que cada frase tenga pinyin y traducción', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶。', pinyin: '', es: '' }] };
    const kinds = validateReading(reading, context).map(i => i.kind);

    expect(kinds).toContain('missing_pinyin');
    expect(kinds).toContain('missing_translation');
  });

  it('exige que cada frase termine en puntuación', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶', pinyin: 'a', es: 'b' }] };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('unsegmented');
  });

  it('rechaza una lectura demasiado corta para su nivel', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢。', pinyin: 'a', es: 'b' }] };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('too_short');
  });

  it('rechaza una lectura demasiado larga para su nivel', () => {
    const reading = {
      ...valid,
      sentences: Array.from({ length: 25 }, () => ({ ...validSentence })),
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('too_long');
  });

  it('exige que la respuesta correcta no esté siempre en la misma posición', () => {
    const reading = {
      ...valid,
      questions: [
        { ...valid.questions[0], answer_index: 0 },
        { ...valid.questions[0], answer_index: 0 },
        { ...valid.questions[0], answer_index: 0 },
      ],
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('answers_not_spread');
  });

  it('exige que cada pregunta apunte a una frase que exista', () => {
    const reading = {
      ...valid,
      questions: [{ ...valid.questions[0], evidence_sentence: 9 }],
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('missing_evidence');
  });

  it('rechaza distractores repetidos o iguales a la respuesta', () => {
    const reading = {
      ...valid,
      questions: [{ ...valid.questions[0], options: ['茶', '茶', '水'] }],
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('duplicate_options');
  });

  it('exige que las palabras objetivo aparezcan de verdad en el texto', () => {
    const reading = { ...valid, target_words: ['图书馆'] };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('target_absent');
  });

  it('rechaza una lectura sin preguntas', () => {
    const reading = { ...valid, questions: [] };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('no_questions');
  });

  it('señala dónde está el problema, no solo que lo hay', () => {
    const reading = { ...valid, sentences: [{ zh: '我喜欢喝茶', pinyin: '', es: '' }] };
    const issue = validateReading(reading, context).find(i => i.kind === 'missing_pinyin');

    expect(issue?.sentence_index).toBe(0);
  });
});
