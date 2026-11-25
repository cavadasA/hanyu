import { describe, expect, it } from 'vitest';
import { alignSentence, polyphonesIn, sentenceToSsml } from './ssml.js';

const dictionary = [
  { hanzi: '我', pinyin: 'wǒ' },
  { hanzi: '在', pinyin: 'zài' },
  { hanzi: '银行', pinyin: 'yínháng' },
  { hanzi: '不行', pinyin: 'bùxíng' },
  { hanzi: '工作', pinyin: 'gōngzuò' },
  { hanzi: '觉得', pinyin: 'juéde' },
  { hanzi: '睡觉', pinyin: 'shuìjiào' },
  { hanzi: '很', pinyin: 'hěn' },
  { hanzi: '好', pinyin: 'hǎo' },
  { hanzi: '喝', pinyin: 'hē' },
  { hanzi: '茶', pinyin: 'chá' },
  { hanzi: '一点儿', pinyin: 'yìdiǎnr' },
  { hanzi: '绿茶', pinyin: 'lǜchá' },
];

const voice = 'zh-CN-XiaoxiaoNeural';

describe('alignSentence', () => {
  const ph = (sentence, options) => alignSentence(sentence, dictionary, options).map(entry => entry.ph);

  it('da a cada hanzi su sílaba y su tono según el pinyin de la frase', () => {
    expect(ph({ zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōngzuò.' })).toEqual([
      'wo 3', 'zai 4', 'yin 2', 'hang 2', 'gong 1', 'zuo 4',
    ]);
  });

  it('el tono neutro es el 5, la ü se escribe v y el erhua es su propia sílaba', () => {
    expect(ph({ zh: '觉得绿茶一点儿', pinyin: 'Juéde lǜchá yìdiǎnr.' }))
      .toEqual(['jue 2', 'de 5', 'lv 4', 'cha 2', 'yi 4', 'dian 3', 'r 5']);
  });

  it('alinea nombres sin entrada en el diccionario', () => {
    expect(ph({ zh: '我叫李文。', pinyin: 'Wǒ jiào Lǐ Wén.' })).toEqual(['wo 3', 'jiao 4', 'li 3', 'wen 2']);
  });

  it('el índice es la posición del hanzi en la frase original', () => {
    expect(alignSentence({ zh: '小林：我很好。', pinyin: 'Xiǎolín: Wǒ hěn hǎo.' }, dictionary, { speaker: '小林' })
      .map(entry => entry.index)).toEqual([3, 4, 5]);
  });
});

describe('sentenceToSsml', () => {
  it('fuerza la lectura de 行 en 银行 desde el pinyin de la frase', () => {
    const ssml = sentenceToSsml({ zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōngzuò.' }, voice, dictionary);

    expect(ssml).toContain('<phoneme alphabet="sapi" ph="hang 2">行</phoneme>');
    expect(ssml).toContain(`<voice name="${voice}">`);
  });

  it('fuerza la lectura de 觉 en 觉得', () => {
    const ssml = sentenceToSsml({ zh: '我觉得很好。', pinyin: 'Wǒ juéde hěn hǎo.' }, voice, dictionary);

    expect(ssml).toContain('ph="jue 2"');
  });

  it('un hanzi con una sola lectura en el diccionario no se fuerza', () => {
    const withoutBuxing = dictionary.filter(entry => entry.hanzi !== '不行');
    const ssml = sentenceToSsml({ zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōngzuò.' }, voice, withoutBuxing);

    expect(ssml).not.toContain('<phoneme');
  });

  it('una frase sin polífonos no lleva <phoneme>', () => {
    const ssml = sentenceToSsml({ zh: '我很好。', pinyin: 'Wǒ hěn hǎo.' }, voice, dictionary);

    expect(ssml).not.toContain('<phoneme');
    expect(ssml).toContain('我很好。');
  });

  it('con una sílaba de menos en el pinyin, lanza en vez de dejar que la voz adivine', () => {
    expect(() => sentenceToSsml({ zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōng.' }, voice, dictionary))
      .toThrow(/sílabas/);
  });

  it('el prefijo «nombre：» de un diálogo no se pronuncia', () => {
    const ssml = sentenceToSsml(
      { zh: '小林：我觉得很好。', pinyin: 'Xiǎolín: Wǒ juéde hěn hǎo.' },
      voice,
      dictionary,
      { speaker: '小林' },
    );

    expect(ssml).not.toContain('小林');
    expect(ssml).toContain('ph="jue 2"');
  });
});

describe('polyphonesIn', () => {
  it('lista los caracteres con más de una lectura y la sílaba que se fuerza', () => {
    expect(polyphonesIn({ zh: '我在银行喝一点儿茶。', pinyin: 'Wǒ zài yínháng hē yìdiǎnr chá.' }, dictionary))
      .toEqual([{ index: 3, hanzi: '行', ph: 'hang 2' }]);
  });
});
