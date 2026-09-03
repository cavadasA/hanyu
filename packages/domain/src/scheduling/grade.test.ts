import { gradeWrittenAnswer } from './grade';

const base = {
  expected: '你好',
  submitted: '你好',
  kind: 'hanzi' as const,
  elapsed_ms: 4000,
  hints: 0,
};

describe('gradeWrittenAnswer', () => {
  it('una respuesta correcta, rápida y sin ayudas es easy', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1500 }).grade).toBe('easy');
  });

  it('una respuesta correcta a ritmo normal es good', () => {
    expect(gradeWrittenAnswer(base).grade).toBe('good');
  });

  it('una respuesta correcta pero lenta es hard', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 20000 }).grade).toBe('hard');
  });

  it('una respuesta correcta con pista es hard aunque sea rápida', () => {
    // Acertar con ayuda no demuestra lo mismo que acertar sin ella.
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1000, hints: 1 }).grade).toBe('hard');
  });

  it('una respuesta incorrecta es again', () => {
    const result = gradeWrittenAnswer({ ...base, submitted: '你号' });

    expect(result.grade).toBe('again');
    expect(result.correct).toBe(false);
  });

  it('ignora la puntuación y los espacios sobrantes', () => {
    expect(gradeWrittenAnswer({ ...base, submitted: ' 你好。' }).correct).toBe(true);
  });

  it('acepta el pinyin tecleado de las cuatro formas', () => {
    for (const submitted of ['nǐ hǎo', 'ni hao', 'ni3 hao3', 'nihao']) {
      const result = gradeWrittenAnswer({
        expected: 'nǐ hǎo',
        submitted,
        kind: 'pinyin',
        elapsed_ms: 4000,
        hints: 0,
      });
      expect(result.correct).toBe(true);
    }
  });

  it('explica por qué bajó la nota', () => {
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 20000 }).reason).toBe('slow');
    expect(gradeWrittenAnswer({ ...base, hints: 1 }).reason).toBe('hint');
    expect(gradeWrittenAnswer({ ...base, elapsed_ms: 1500 }).reason).toBe('fast');
  });
});
