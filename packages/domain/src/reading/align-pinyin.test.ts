import { describe, expect, it } from 'vitest';
import { alignTokens } from './align-pinyin';

const dictionary = [
  { hanzi: '我', pinyin: 'wǒ' },
  { hanzi: '在', pinyin: 'zài' },
  { hanzi: '银行', pinyin: 'yínháng' },
  { hanzi: '不行', pinyin: 'bùxíng' },
  { hanzi: '工作', pinyin: 'gōngzuò' },
  { hanzi: '觉得', pinyin: 'juéde' },
  { hanzi: '很', pinyin: 'hěn' },
  { hanzi: '好', pinyin: 'hǎo' },
  { hanzi: '长城', pinyin: 'Chángchéng' },
  { hanzi: '长', pinyin: 'cháng' },
  { hanzi: '长', pinyin: 'zhǎng' },
  { hanzi: '叫', pinyin: 'jiào' },
  { hanzi: '一点儿', pinyin: 'yìdiǎnr' },
  { hanzi: '女', pinyin: 'nǚ' },
];

const pinyinOf = (zh: string, pinyin: string) =>
  alignTokens({ zh, pinyin }, dictionary)?.map(token => [token.text, token.pinyin]);

describe('alignTokens', () => {
  it('da a cada token la parte del pinyin de la frase que le corresponde', () => {
    expect(pinyinOf('长城很长。', 'Chángchéng hěn cháng.')).toEqual([
      ['长城', 'chángchéng'],
      ['很', 'hěn'],
      ['长', 'cháng'],
      ['。', null],
    ]);
  });

  it('respeta el tono neutro, la ü y el erhua', () => {
    expect(pinyinOf('我觉得女一点儿。', 'Wǒ juéde nǚ yìdiǎnr.')).toEqual([
      ['我', 'wǒ'],
      ['觉得', 'juéde'],
      ['女', 'nǚ'],
      ['一点儿', 'yìdiǎnr'],
      ['。', null],
    ]);
  });

  it('alinea nombres sin entrada y el prefijo del hablante de un diálogo', () => {
    expect(pinyinOf('李文：我叫李文。', 'Lǐ Wén: Wǒ jiào Lǐ Wén.')).toEqual([
      ['李', 'lǐ'],
      ['文', 'wén'],
      ['：', null],
      ['我', 'wǒ'],
      ['叫', 'jiào'],
      ['李', 'lǐ'],
      ['文', 'wén'],
      ['。', null],
    ]);
  });

  it('con una sílaba de menos en el pinyin no hay alineación', () => {
    expect(alignTokens({ zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōng.' }, dictionary)).toBeNull();
  });
});
