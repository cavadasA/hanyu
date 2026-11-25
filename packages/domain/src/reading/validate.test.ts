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

const context = {
  dictionary,
  max_level: 2,
  target_word_ids: [],
  grammar_points: [
    { code: '6.3.4', hsk_level: 2 },
    { code: '2.6.1', hsk_level: 3 },
  ],
};
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
  target_grammar: [{ code: '6.3.4', level: 2 }],
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

  it('rechaza una secuencia A-B-C predecible aunque las respuestas no sean iguales', () => {
    const reading = {
      ...valid,
      questions: [
        { ...valid.questions[0], answer_index: 0 },
        { ...valid.questions[0], answer_index: 1 },
        { ...valid.questions[0], answer_index: 2 },
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

  it('rechaza un objetivo gramatical inexistente o de otro nivel', () => {
    const reading = {
      ...valid,
      target_grammar: [{ code: '2.6.1', level: 3 }],
    };

    expect(validateReading(reading, context).map(i => i.kind)).toContain('unknown_grammar');
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
  it('acepta los nombres propios que le pasa el contexto, y sólo ésos', () => {
    const named = {
      ...valid,
      sentences: valid.sentences.map((sentence, index) =>
        index === 0 ? { ...sentence, zh: '小林喜欢喝茶，茶比咖啡好喝。' } : sentence),
    };

    expect(validateReading(named, { ...context, proper_nouns: ['小林'] })).toEqual([]);
    expect(validateReading(named, context).map(i => i.detail)).toContain('小');
  });

  it('un nombre propio no sirve como palabra objetivo', () => {
    const named = {
      ...valid,
      sentences: valid.sentences.map((sentence, index) =>
        index === 0 ? { ...sentence, zh: '小林喜欢喝茶，茶比咖啡好喝。' } : sentence),
      target_words: ['小林'],
    };

    expect(validateReading(named, { ...context, proper_nouns: ['小林'] }))
      .toEqual([{ kind: 'unknown_vocabulary', detail: '小林' }]);
  });
});

describe('validateReading: preguntas inferenciales', () => {
  const INFERENCE_KINDS = ['inference_needs_two', 'inference_is_literal', 'rationale_missing', 'inference_not_last', 'no_inferential', 'missing_evidence'];
  const inferenceIssues = (reading: Parameters<typeof validateReading>[0], ctx: Parameters<typeof validateReading>[1] = context) =>
    validateReading(reading, ctx).filter(issue => INFERENCE_KINDS.includes(issue.kind));

  const lunch = {
    ...valid,
    sentences: [
      { zh: '我六点起床。', pinyin: 'Wǒ liù diǎn qǐchuáng.', es: 'Me levanto a las seis.' },
      { zh: '妈妈做好了午饭。', pinyin: 'Māma zuòhǎo le wǔfàn.', es: 'Mamá ha hecho la comida.' },
      { zh: '我中午回家。', pinyin: 'Wǒ zhōngwǔ huí jiā.', es: 'Vuelvo a casa a mediodía.' },
    ],
  };
  const inferential = {
    kind: 'inferential' as const,
    prompt: '他中午在哪儿吃饭？',
    options: ['学校', '家里', '饭馆'],
    answer_index: 1,
    evidence_sentences: [1, 2],
    rationale_es: 'Su madre ha hecho la comida y él vuelve a casa a mediodía: come en casa.',
  };

  it('una inferencial que combina dos frases y cuya respuesta no está escrita es válida', () => {
    expect(inferenceIssues({ ...lunch, questions: [valid.questions[0], inferential] })).toEqual([]);
  });

  it('si la respuesta correcta aparece tal cual en el texto, no es inferencial', () => {
    const literal = { ...inferential, prompt: '他几点起床？', options: ['五点', '六点', '七点'], answer_index: 1, evidence_sentences: [0, 2] };
    expect(inferenceIssues({ ...lunch, questions: [literal] })).toEqual([
      { kind: 'inference_is_literal', question_index: 0, detail: '六点' },
    ]);
  });

  it('una inferencial necesita al menos dos frases de evidencia que existan', () => {
    expect(inferenceIssues({ ...lunch, questions: [{ ...inferential, evidence_sentences: [1] }] })).toEqual([
      { kind: 'inference_needs_two', question_index: 0 },
    ]);
    expect(inferenceIssues({ ...lunch, questions: [{ ...inferential, evidence_sentences: [1, 7] }] })).toEqual([
      { kind: 'missing_evidence', question_index: 0 },
    ]);
  });

  it('una inferencial explica por qué, en al menos 20 caracteres', () => {
    expect(inferenceIssues({ ...lunch, questions: [{ ...inferential, rationale_es: 'Come en casa.' }] })).toEqual([
      { kind: 'rationale_missing', question_index: 0 },
    ]);
  });

  it('la inferencial va al final: una literal detrás cambiaría los ids de las respuestas guardadas', () => {
    expect(inferenceIssues({ ...lunch, questions: [inferential, valid.questions[0]] })).toEqual([
      { kind: 'inference_not_last', question_index: 1 },
    ]);
  });

  it('con el catálogo completo, toda lectura tiene al menos una inferencial', () => {
    const onlyLiteral = { ...lunch, questions: [valid.questions[0]] };
    expect(inferenceIssues(onlyLiteral)).toEqual([]);
    expect(inferenceIssues(onlyLiteral, { ...context, complete: true })).toEqual([{ kind: 'no_inferential' }]);
  });
});

