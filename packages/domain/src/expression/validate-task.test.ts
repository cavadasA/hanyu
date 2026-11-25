// packages/domain/src/expression/validate-task.test.ts
import type { CommunicativeContext, CommunicativeTask } from './check-answer';
import { validateCommunicativeTask } from './validate-task';

const ctx: CommunicativeContext = {
  dictionary: ['我', '今天', '有', '事', '不', '能', '去', '明天', '吧', '所以', '因为'].map((hanzi) => ({
    hanzi,
    hsk_level: hanzi === '所以' || hanzi === '因为' ? 2 : 1,
  })),
  grammar_points: [
    { hsk_level: 2, code: '6.4.3', markers: ['因为', '所以'] },
    { hsk_level: 3, code: '1.1.1', markers: ['把'] },
    { hsk_level: 2, code: '7.7.7', markers: ['。'] },
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
    model_answer: {
      zh: '我今天有事，所以不能去。明天去吧！',
      pinyin: 'Wǒ jīntiān yǒu shì, suǒyǐ bù néng qù. Míngtiān qù ba!',
      es: 'Hoy tengo cosas que hacer, así que no puedo ir. ¡Vamos mañana!',
    },
    ...overrides,
  };
}

const kinds = (t: CommunicativeTask) => validateCommunicativeTask(t, ctx).map((issue) => issue.kind);

describe('validateCommunicativeTask', () => {
  it('acepta una tarea cuya respuesta modelo pasa sus propias reglas', () => {
    expect(validateCommunicativeTask(task(), ctx)).toEqual([]);
  });

  it('rechaza una tarea cuya respuesta modelo no aprueba', () => {
    const issues = validateCommunicativeTask(
      task({ model_answer: { zh: '我今天有事，不能去。明天去吧！', pinyin: 'x', es: 'x' } }),
      ctx,
    );

    expect(issues).toEqual([{ kind: 'model_answer_fails', detail: 'marker_missing' }]);
  });

  it('rechaza un slug que no empieza por el nivel', () => {
    expect(kinds(task({ slug: '3-03-rechazar-invitacion' }))).toEqual(['invalid_slug']);
    expect(kinds(task({ slug: 'rechazar' }))).toEqual(['invalid_slug']);
  });

  it('rechaza un modo desconocido', () => {
    expect(kinds(task({ mode: 'sing' as never }))).toEqual(['invalid_mode']);
  });

  it('exige situación, intenciones y respuesta modelo completas', () => {
    expect(kinds(task({ situation_es: ' ' }))).toEqual(['missing_situation']);
    expect(kinds(task({ intent: [] }))).toEqual(['missing_intent']);
    expect(kinds(task({ intent: ['dar un motivo', ''] }))).toEqual(['missing_intent']);
    expect(kinds(task({ model_answer: { zh: '我今天有事，所以不能去。', pinyin: '', es: 'x' } }))).toEqual([
      'missing_model_answer',
    ]);
  });

  it('exige al menos un marcador gramatical', () => {
    expect(kinds(task({ required_markers: [] }))).toEqual(['missing_markers']);
  });

  it('rechaza un punto gramatical que no existe o es de un nivel superior', () => {
    expect(kinds(task({ required_markers: [{ hsk_level: 2, code: '9.9.9' }] }))).toEqual(['unknown_grammar_point']);
    expect(kinds(task({ required_markers: [{ hsk_level: 3, code: '1.1.1' }] }))).toEqual(['grammar_above_level']);
  });

  it('rechaza un punto cuyos marcadores no se pueden buscar en un texto', () => {
    expect(kinds(task({ required_markers: [{ hsk_level: 2, code: '7.7.7' }] }))).toEqual(['unusable_marker']);
  });

  it('rechaza límites de longitud incoherentes', () => {
    expect(kinds(task({ min_chars: 40, max_chars: 30 }))).toEqual(['invalid_length_bounds']);
    expect(kinds(task({ min_chars: 0 }))).toEqual(['invalid_length_bounds']);
  });
});
