import { describe, expect, it } from 'vitest';
import { tokenizeReading } from './tokenize';

const dictionary = [
  {
    id: 1,
    hanzi: '你',
    pinyin: 'nǐ',
    meaning_en: 'you',
    meaning_es: null,
    hsk_level: 1,
    pos: 'pronoun',
    frequency: 1,
    in_srs: false,
  },
  {
    id: 2,
    hanzi: '你好',
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    meaning_es: 'hola',
    hsk_level: 1,
    pos: null,
    frequency: 2,
    in_srs: true,
  },
  {
    id: 3,
    hanzi: '朋友',
    pinyin: 'péngyou',
    meaning_en: 'friend',
    meaning_es: 'amigo',
    hsk_level: 1,
    pos: 'noun',
    frequency: 3,
    in_srs: false,
  },
];

describe('tokenizeReading', () => {
  it('uses the longest dictionary match without dropping punctuation', () => {
    const tokens = tokenizeReading('你好，朋友。', dictionary);

    expect(tokens.map(token => token.text)).toEqual(['你好', '，', '朋友', '。']);
    expect(tokens[0]).toMatchObject({
      id: 't0',
      type: 'word',
      word: { id: 2, in_srs: true },
    });
  });

  it('keeps unknown Chinese characters selectable', () => {
    expect(tokenizeReading('龘。', dictionary)).toEqual([
      { id: 't0', text: '龘', type: 'unknown', word: null },
      { id: 't1', text: '。', type: 'punctuation', word: null },
    ]);
  });

  it('preserves emoji surrogate pairs and stable UTF-16 offsets', () => {
    expect(tokenizeReading('你🙂好', dictionary)).toEqual([
      {
        id: 't0',
        text: '你',
        type: 'word',
        word: dictionary[0],
      },
      { id: 't1', text: '🙂', type: 'punctuation', word: null },
      { id: 't3', text: '好', type: 'unknown', word: null },
    ]);
  });

  it('elige la coincidencia más larga aunque una más corta aparezca antes', () => {
    const longestDictionary = [
      { hanzi: '中', pinyin: 'zhōng' },
      { hanzi: '中国', pinyin: 'zhōngguó' },
      { hanzi: '国人', pinyin: 'guórén' },
      { hanzi: '中国人', pinyin: 'zhōngguórén' },
    ];

    expect(tokenizeReading('中国人', longestDictionary).map(token => token.text)).toEqual(['中国人']);
  });

  it('separa la puntuación como token propio', () => {
    const tokens = tokenizeReading('你好。我', [{ hanzi: '你好', pinyin: 'nǐ hǎo' }]);

    expect(tokens.map(token => token.type)).toEqual(['word', 'punctuation', 'unknown']);
  });
});

describe('tokenizeReading: acepciones', () => {
  const senses = [
    { id: 20, hanzi: '好', pinyin: 'hǎo', hsk_level: 2, meaning_en: 'good', meaning_es: 'bueno', pos: 'adjective' },
    { id: 10, hanzi: '好', pinyin: 'hǎo', hsk_level: 1, meaning_en: 'good', meaning_es: 'bueno', pos: 'adjective' },
    { id: 30, hanzi: '会', pinyin: 'huì', hsk_level: 1, sense_index: 1, meaning_en: 'can', meaning_es: 'saber', pos: 'verb' },
    { id: 31, hanzi: '会', pinyin: 'huì', hsk_level: 3, sense_index: 2, meaning_en: 'meeting', meaning_es: 'reunión', pos: 'noun' },
  ];

  it('dos entradas idénticas en dos niveles son una sola acepción: la de nivel más bajo', () => {
    const [token] = tokenizeReading('好', senses);
    expect(token.word?.id).toBe(10);
    expect(token.senses).toBeUndefined();
  });

  it('dos acepciones distintas se adjuntan las dos', () => {
    const [token] = tokenizeReading('会', senses);
    expect(token.senses?.map(sense => sense.id)).toEqual([30, 31]);
  });
});
