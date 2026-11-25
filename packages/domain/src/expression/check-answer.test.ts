// packages/domain/src/expression/check-answer.test.ts
import { checkAnswerRules, checkAnswerShape, type CommunicativeContext, type CommunicativeTask } from './check-answer';

const ctx: CommunicativeContext = {
  dictionary: [
    { hanzi: '我', hsk_level: 1 },
    { hanzi: '不', hsk_level: 1 },
    { hanzi: '能', hsk_level: 1 },
    { hanzi: '去', hsk_level: 1 },
    { hanzi: '今天', hsk_level: 1 },
    { hanzi: '明天', hsk_level: 1 },
    { hanzi: '有', hsk_level: 1 },
    { hanzi: '事', hsk_level: 1 },
    { hanzi: '了', hsk_level: 1 },
    { hanzi: '吧', hsk_level: 1 },
    { hanzi: '吃', hsk_level: 1 },
    { hanzi: '饭', hsk_level: 1 },
    { hanzi: '因为', hsk_level: 2 },
    { hanzi: '所以', hsk_level: 2 },
    { hanzi: '已经', hsk_level: 2 },
  ],
  grammar_points: [
    { hsk_level: 2, code: '6.4.3', markers: ['因为', '所以'] },
    { hsk_level: 1, code: '2.1.1', markers: ['了'] },
    { hsk_level: 2, code: '9.9.9', markers: ['是…的'] },
  ],
};

function task(overrides: Partial<CommunicativeTask> = {}): CommunicativeTask {
  return {
    slug: '2-03-rechazar-invitacion',
    hsk_level: 2,
    situation_es: 'Tu compañera te invita al cine el sábado. No puedes: explica por qué y propón otro día.',
    mode: 'write',
    intent: ['rechazar la invitación', 'dar un motivo', 'proponer otro día'],
    required_markers: [{ hsk_level: 2, code: '6.4.3' }],
    min_chars: 6,
    max_chars: 30,
    model_answer: { zh: '我今天有事，所以不能去。明天去吧！', pinyin: '…', es: '…' },
    ...overrides,
  };
}

describe('checkAnswerRules', () => {
  it('acepta una respuesta en chino, de su nivel, con el marcador pedido', () => {
    expect(checkAnswerRules('因为我今天有事，所以不能去。明天去吧！', task(), ctx)).toEqual({
      ok: true,
      reasons: [],
      unknown_words: [],
      missing_markers: [],
    });
  });

  it('rechaza pinyin con not_chinese y no mira nada más', () => {
    expect(checkAnswerRules('wo bu neng qu', task(), ctx)).toEqual({
      ok: false,
      reasons: ['not_chinese'],
      unknown_words: [],
      missing_markers: [],
    });
  });

  it('rechaza una respuesta en español con not_chinese', () => {
    expect(checkAnswerRules('No puedo ir, tengo cosas.', task(), ctx).reasons).toEqual(['not_chinese']);
  });

  it('rechaza una respuesta que mezcla hanzi y letras latinas', () => {
    expect(checkAnswerRules('我不能去 because 我有事', task(), ctx).reasons).toEqual(['not_chinese']);
  });

  it('señala el marcador que falta', () => {
    const result = checkAnswerRules('我今天有事，不能去。明天去吧！', task(), ctx);

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(['marker_missing']);
    expect(result.missing_markers).toEqual(['6.4.3']);
  });

  it('un marcador con partes (是…的) exige todas, en orden', () => {
    const withShiDe = task({ required_markers: [{ hsk_level: 2, code: '9.9.9' }] });

    expect(checkAnswerRules('是我去的。', withShiDe, { ...ctx, dictionary: [...ctx.dictionary, { hanzi: '是', hsk_level: 1 }, { hanzi: '的', hsk_level: 1 }] }).missing_markers).toEqual([]);
    expect(checkAnswerRules('的我去是。', withShiDe, { ...ctx, dictionary: [...ctx.dictionary, { hanzi: '是', hsk_level: 1 }, { hanzi: '的', hsk_level: 1 }] }).missing_markers).toEqual(['9.9.9']);
  });

  it('rechaza vocabulario por encima del nivel de la tarea', () => {
    const hsk1 = task({ hsk_level: 1, required_markers: [{ hsk_level: 1, code: '2.1.1' }] });

    const result = checkAnswerRules('我已经吃饭了。', hsk1, ctx);

    expect(result.reasons).toEqual(['unknown_vocabulary']);
    expect(result.unknown_words).toEqual(['已', '经']);
  });

  it('acepta como vocabulario los nombres propios del contexto', () => {
    const named = { ...ctx, proper_nouns: ['小明'] };

    expect(checkAnswerRules('小明今天有事，所以不能去。', task(), named).ok).toBe(true);
  });

  it('mide la longitud en hanzi, sin puntuación', () => {
    expect(checkAnswerRules('所以不去。', task(), ctx).reasons).toEqual(['too_short']);
    expect(
      checkAnswerRules('因为我今天有事所以不能去明天去吧因为我今天有事所以不能去明天去吧', task(), ctx).reasons,
    ).toEqual(['too_long']);
  });

  it('acumula los motivos que no se excluyen', () => {
    const result = checkAnswerRules('已经。', task(), ctx);

    expect(result.reasons).toEqual(['too_short', 'marker_missing']);
  });
});

describe('checkAnswerShape', () => {
  it('es la parte que no necesita diccionario: idioma y longitud', () => {
    expect(checkAnswerShape('wo bu neng qu', task())).toEqual(['not_chinese']);
    expect(checkAnswerShape('不去。', task())).toEqual(['too_short']);
    expect(checkAnswerShape('我今天有事，所以不能去。', task())).toEqual([]);
  });
});
