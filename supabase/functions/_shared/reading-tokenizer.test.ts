import { describe, expect, it } from 'vitest';
import { tokenizeReading } from './reading-tokenizer';

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
});
