import type { ReadingToken } from '@hanyu/data';
import { sentenceOf } from './sentenceOf';

function token(id: string, text: string, type: ReadingToken['type'] = 'word'): ReadingToken {
  return { id, text, type, word: null };
}

const tokens: ReadingToken[] = [
  token('t0', '我'),
  token('t1', '喜欢'),
  token('t2', '喝茶'),
  token('t3', '。', 'punctuation'),
  token('t4', '她'),
  token('t5', '看书'),
  token('t6', '，', 'punctuation'),
  token('t7', '我'),
  token('t8', '睡觉'),
  token('t9', '。', 'punctuation'),
];

describe('sentenceOf', () => {
  it('devuelve la frase que contiene el token, con su puntuación final', () => {
    expect(sentenceOf(tokens, 't1')?.text).toBe('我喜欢喝茶。');
  });

  it('no corta en una coma: la frase llega hasta el punto', () => {
    // Una coma separa cláusulas, no frases. Cortar ahí daría un contexto
    // demasiado corto para entender el uso de la palabra.
    expect(sentenceOf(tokens, 't5')?.text).toBe('她看书，我睡觉。');
    expect(sentenceOf(tokens, 't8')?.text).toBe('她看书，我睡觉。');
  });

  it('devuelve la frase aunque el texto no termine en puntuación', () => {
    expect(sentenceOf([token('a', '你好')], 'a')?.text).toBe('你好');
  });

  it('devuelve null cuando el token no está en la lista', () => {
    expect(sentenceOf(tokens, 'nope')).toBeNull();
  });

  it('devuelve también los tokens de la frase, para poder marcar el hueco', () => {
    expect(sentenceOf(tokens, 't1')?.tokens.map((t) => t.id)).toEqual(['t0', 't1', 't2', 't3']);
  });
});
