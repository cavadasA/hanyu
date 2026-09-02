import { emptyAnswer, toSolution } from './contract';

describe('emptyAnswer', () => {
  it('da una respuesta vacía con la forma de su tipo', () => {
    expect(emptyAnswer('fill_blank')).toEqual({ kind: 'fill_blank', text: '' });
    expect(emptyAnswer('multiple_choice')).toEqual({ kind: 'multiple_choice', option: '' });
    expect(emptyAnswer('reorder')).toEqual({ kind: 'reorder', tokens: [] });
    expect(emptyAnswer('dictation')).toEqual({ kind: 'dictation', text: '' });
    expect(emptyAnswer('matching')).toEqual({ kind: 'matching', pairs: {} });
  });
});

describe('toSolution', () => {
  it('acepta la respuesta de fill_blank desde el prompt o desde la columna answer', () => {
    expect(
      toSolution('fill_blank', { sentence: '我___喝茶。', correct: '喜欢' }, null),
    ).toEqual({ kind: 'fill_blank', accept: ['喜欢'] });

    expect(toSolution('fill_blank', { sentence: '我___喝茶。' }, '喜欢')).toEqual({
      kind: 'fill_blank',
      accept: ['喜欢'],
    });
  });

  it('acepta varias respuestas válidas en fill_blank', () => {
    expect(
      toSolution('fill_blank', { correct: ['喜欢', '爱'] }, null),
    ).toEqual({ kind: 'fill_blank', accept: ['喜欢', '爱'] });
  });

  it('lee el orden correcto de reorder como lista, no como cadena', () => {
    expect(
      toSolution(
        'reorder',
        { words: ['喝', '我'], correct_order: ['我', '喜欢', '喝', '茶'] },
        '我喜欢喝茶',
      ),
    ).toEqual({ kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] });
  });

  it('reconstruye el orden desde la columna answer cuando falta correct_order', () => {
    expect(toSolution('reorder', { words: ['我', '好'] }, ['我', '好'])).toEqual({
      kind: 'reorder',
      order: ['我', '好'],
    });
  });

  it('lee los pares de matching del prompt e ignora el literal "matched"', () => {
    const solution = toSolution(
      'matching',
      { pairs: [{ left: '学生', right: 'student' }, { left: '老师', right: 'teacher' }] },
      'matched',
    );

    expect(solution).toEqual({
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher' },
    });
  });

  it('conserva el pinyin de dictation solo cuando se acepta', () => {
    expect(
      toSolution('dictation', { audio_text: '你好', pinyin: 'nǐ hǎo', accept_pinyin: true }, '你好'),
    ).toEqual({ kind: 'dictation', hanzi: '你好', pinyin: 'nǐ hǎo' });

    expect(
      toSolution('dictation', { audio_text: '你好', pinyin: 'nǐ hǎo', accept_pinyin: false }, '你好'),
    ).toEqual({ kind: 'dictation', hanzi: '你好', pinyin: null });
  });

  it('lee la opción correcta de multiple_choice', () => {
    expect(
      toSolution('multiple_choice', { question: '?', options: ['a', 'b'], correct: 'b' }, 'b'),
    ).toEqual({ kind: 'multiple_choice', correct: 'b' });
  });
});
