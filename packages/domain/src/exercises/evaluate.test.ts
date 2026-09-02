import { evaluateAnswer, isAnswerComplete } from './evaluate';
import type { ExerciseSolution } from './contract';

const fillBlank: ExerciseSolution = { kind: 'fill_blank', accept: ['喜欢'] };
const choice: ExerciseSolution = { kind: 'multiple_choice', correct: 'student' };
const reorder: ExerciseSolution = { kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] };
const dictation: ExerciseSolution = { kind: 'dictation', hanzi: '你好', pinyin: 'nǐ hǎo' };
const matching: ExerciseSolution = {
  kind: 'matching',
  pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
};

describe('isAnswerComplete', () => {
  it('exige todos los pares en matching antes de poder comprobar', () => {
    expect(isAnswerComplete(matching, { kind: 'matching', pairs: { 学生: 'student' } })).toBe(false);
    expect(
      isAnswerComplete(matching, {
        kind: 'matching',
        pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
      }),
    ).toBe(true);
  });

  it('exige todas las piezas en reorder', () => {
    expect(isAnswerComplete(reorder, { kind: 'reorder', tokens: ['我', '喜欢'] })).toBe(false);
    expect(isAnswerComplete(reorder, { kind: 'reorder', tokens: ['我', '喜欢', '喝', '茶'] })).toBe(true);
  });

  it('exige texto no vacío en los tipos escritos', () => {
    expect(isAnswerComplete(fillBlank, { kind: 'fill_blank', text: '  ' })).toBe(false);
    expect(isAnswerComplete(fillBlank, { kind: 'fill_blank', text: '喜欢' })).toBe(true);
    expect(isAnswerComplete(choice, { kind: 'multiple_choice', option: '' })).toBe(false);
  });
});

describe('evaluateAnswer', () => {
  it('acierta reorder comparando listas, no cadenas', () => {
    const result = evaluateAnswer(reorder, {
      kind: 'reorder',
      tokens: ['我', '喜欢', '喝', '茶'],
    });

    expect(result.correct).toBe(true);
  });

  it('señala la primera posición equivocada en reorder', () => {
    const result = evaluateAnswer(reorder, {
      kind: 'reorder',
      tokens: ['我', '喝', '喜欢', '茶'],
    });

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({ kind: 'reorder', first_wrong_index: 1 });
  });

  it('acierta matching comparando el mapa completo', () => {
    const result = evaluateAnswer(matching, {
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend' },
    });

    expect(result.correct).toBe(true);
    expect(result.detail).toEqual({ kind: 'matching', wrong: [], missing: [] });
  });

  it('dice qué pares de matching están mal y cuáles faltan', () => {
    const result = evaluateAnswer(matching, {
      kind: 'matching',
      pairs: { 学生: 'teacher', 老师: 'teacher' },
    });

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({ kind: 'matching', wrong: ['学生'], missing: ['朋友'] });
  });

  it('acepta dictation en hanzi con y sin puntuación', () => {
    expect(evaluateAnswer(dictation, { kind: 'dictation', text: '你好' }).correct).toBe(true);
    expect(evaluateAnswer(dictation, { kind: 'dictation', text: '你好。' }).correct).toBe(true);
  });

  it('acepta dictation en las cuatro formas de teclear el pinyin', () => {
    for (const text of ['nǐ hǎo', 'ni hao', 'ni3 hao3', 'nihao']) {
      expect(evaluateAnswer(dictation, { kind: 'dictation', text }).correct).toBe(true);
    }
  });

  it('rechaza el pinyin cuando el ejercicio no lo acepta', () => {
    const hanziOnly: ExerciseSolution = { kind: 'dictation', hanzi: '你好', pinyin: null };

    expect(evaluateAnswer(hanziOnly, { kind: 'dictation', text: 'ni hao' }).correct).toBe(false);
  });

  it('ignora mayúsculas y espacios sobrantes en las respuestas escritas', () => {
    expect(evaluateAnswer(choice, { kind: 'multiple_choice', option: ' Student ' }).correct).toBe(true);
    expect(evaluateAnswer(fillBlank, { kind: 'fill_blank', text: ' 喜欢 ' }).correct).toBe(true);
  });

  it('acepta cualquiera de las respuestas válidas de fill_blank', () => {
    const many: ExerciseSolution = { kind: 'fill_blank', accept: ['喜欢', '爱'] };

    expect(evaluateAnswer(many, { kind: 'fill_blank', text: '爱' }).correct).toBe(true);
  });

  it('devuelve incorrecto sin romperse cuando la respuesta es de otro tipo', () => {
    const result = evaluateAnswer(reorder, { kind: 'fill_blank', text: '我喜欢喝茶' } as never);

    expect(result.correct).toBe(false);
  });
});
