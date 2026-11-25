import { describe, expect, it } from 'vitest';
import { sourceHash } from '../../packages/domain/src/media/manifest.ts';
import { clipKey, readingAudioExpectations, speakerOf, spokenText } from './reading-audio.js';

const series = {
  code: 'tienda',
  characters: [{ name: '小林', role_es: 'x' }, { name: '先生', role_es: 'y' }],
};

const dialogue = {
  slug: 'tienda-02',
  format: 'dialogue',
  series: 'tienda',
  sentences: [
    { zh: '小林：这件衣服多少钱？', pinyin: 'Xiǎolín: Zhè jiàn yīfu duōshao qián?', es: '' },
    { zh: '先生：两百块。', pinyin: 'Xiānsheng: Liǎng bǎi kuài.', es: '' },
    { zh: '妈妈说：太贵了。', pinyin: 'Māma shuō: Tài guì le.', es: '' },
  ],
};

describe('audio de lecturas', () => {
  it('la clave de cada frase es su índice con dos cifras', () => {
    expect([0, 7, 12].map(clipKey)).toEqual(['00', '07', '12']);
  });

  it('en un diálogo, el prefijo «nombre：» de un personaje declarado dice quién habla', () => {
    expect(dialogue.sentences.map(sentence => speakerOf(sentence, dialogue, series)))
      .toEqual(['小林', '先生', null]);
  });

  it('fuera de un diálogo nadie habla por prefijo', () => {
    const story = { ...dialogue, format: 'story' };

    expect(speakerOf(dialogue.sentences[0], story, series)).toBeNull();
  });

  it('lo que se oye es la frase sin el prefijo del que habla', () => {
    expect(dialogue.sentences.map(sentence => spokenText(sentence, dialogue, series)))
      .toEqual(['这件衣服多少钱？', '两百块。', '妈妈说：太贵了。']);
  });

  it('espera un clip por frase, con el hash de su zh y su pinyin completos', () => {
    const expectations = readingAudioExpectations(dialogue, series);

    expect(expectations.expectedKeys).toEqual(['00', '01', '02']);
    expect(expectations.textByKey['01']).toBe('两百块。');
    expect(expectations.sourceHashByKey['01']).toBe(sourceHash(dialogue.sentences[1]));
  });
});
