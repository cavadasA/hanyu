import { describe, expect, it } from 'vitest';
import { distinctSenses, pinyinMatches, resolveSenses, type SenseAnnotation } from './senses';

// Entradas con la forma del corpus (server/db/seeds/hsk*-words.json).
const dictionary = [
  { hanzi: '长城', pinyin: 'Chángchéng', hsk_level: 3, sense_index: null, meaning_en: 'the Great Wall', meaning_es: 'la Gran Muralla', pos: 'noun' },
  { hanzi: '长', pinyin: 'cháng', hsk_level: 2, sense_index: null, meaning_en: 'long', meaning_es: 'largo', pos: 'adjective' },
  { hanzi: '长', pinyin: 'zhǎng', hsk_level: 3, sense_index: null, meaning_en: 'to grow', meaning_es: 'crecer', pos: 'verb' },
  { hanzi: '很', pinyin: 'hěn', hsk_level: 1, sense_index: null, meaning_en: 'very', meaning_es: 'muy', pos: 'adverb' },
  { hanzi: '他', pinyin: 'tā', hsk_level: 1, sense_index: null, meaning_en: 'he', meaning_es: 'él', pos: 'pronoun' },
  { hanzi: '会', pinyin: 'huì', hsk_level: 1, sense_index: 1, meaning_en: 'can', meaning_es: 'saber', pos: 'verb' },
  { hanzi: '会', pinyin: 'huì', hsk_level: 3, sense_index: 2, meaning_en: 'meeting', meaning_es: 'reunión', pos: 'noun' },
  { hanzi: '好', pinyin: 'hǎo', hsk_level: 1, sense_index: null, meaning_en: 'good', meaning_es: 'bueno', pos: 'adjective' },
  { hanzi: '好', pinyin: 'hǎo', hsk_level: 2, sense_index: null, meaning_en: 'good', meaning_es: 'bueno', pos: 'adjective' },
  { hanzi: '一会儿', pinyin: 'yíhuìr', hsk_level: 2, sense_index: null, meaning_en: 'a moment', meaning_es: 'un momento', pos: 'adverb' },
  { hanzi: '一会儿', pinyin: 'yíhuìr', hsk_level: 3, sense_index: null, meaning_en: 'a moment', meaning_es: 'un momento', pos: 'adverb' },
  { hanzi: '花', pinyin: 'huā', hsk_level: 2, sense_index: 1, meaning_en: 'flower', meaning_es: 'flor', pos: 'noun' },
  { hanzi: '花', pinyin: 'huā', hsk_level: 2, sense_index: 2, meaning_en: 'to spend', meaning_es: 'gastar', pos: 'verb' },
];

type Token = { text: string; pinyin: string | null };
const t = (text: string, pinyin: string | null = null): Token => ({ text, pinyin });

function reading(tokens: Token[], senses?: SenseAnnotation[], hsk_level = 3) {
  return { hsk_level, sentences: [{ tokens }], ...(senses ? { senses } : {}) };
}

describe('distinctSenses', () => {
  it('dos entradas idénticas en dos niveles son una sola: la de nivel más bajo', () => {
    const senses = distinctSenses(dictionary.filter(entry => entry.hanzi === '好'));
    expect(senses).toHaveLength(1);
    expect(senses[0].hsk_level).toBe(1);
  });

  it('dos acepciones con el mismo pinyin y distinto significado se conservan', () => {
    expect(distinctSenses(dictionary.filter(entry => entry.hanzi === '会'))).toHaveLength(2);
  });

  it('sin significado no se puede afirmar que dos entradas sean la misma', () => {
    const bare = [
      { hanzi: '会', pinyin: 'huì', hsk_level: 1 },
      { hanzi: '会', pinyin: 'huì', hsk_level: 3 },
    ];
    expect(distinctSenses(bare)).toHaveLength(2);
  });
});

describe('pinyinMatches', () => {
  it('ignora mayúsculas, espacios y apóstrofos', () => {
    expect(pinyinMatches('Chángchéng', 'cháng chéng')).toBe(true);
  });

  it('el tono sí cuenta', () => {
    expect(pinyinMatches('cháng', 'zhǎng')).toBe(false);
    expect(pinyinMatches('mǎi', 'mài')).toBe(false);
  });

  it('el cambio de tono de 一 y 不 no cuenta', () => {
    expect(pinyinMatches('yīhuìr', 'yíhuìr', '一会儿')).toBe(true);
    expect(pinyinMatches('bú kèqi', 'bù kèqi', '不客气')).toBe(true);
  });

  it('fuera de 一 y 不, yī/yì siguen siendo distintos', () => {
    expect(pinyinMatches('yī', 'yì', '衣')).toBe(false);
  });
});

describe('resolveSenses', () => {
  it('长 en 长城很长 se resuelve por el pinyin de la frase', () => {
    const { resolved, issues } = resolveSenses(
      reading([t('长城', 'Chángchéng'), t('很', 'hěn'), t('长', 'cháng'), t('。')]),
      dictionary,
    );
    expect(issues).toEqual([]);
    expect(resolved).toEqual([
      { sentence: 0, hanzi: '长', occurrence: 0, hsk_level: 2, sense_index: null, by: 'pinyin' },
    ]);
  });

  it('会 sin anotación da sense_unresolved: las dos entradas son huì', () => {
    const { resolved, issues } = resolveSenses(
      reading([t('他', 'tā'), t('会', 'huì'), t('。')]),
      dictionary,
    );
    expect(resolved).toEqual([]);
    expect(issues).toEqual([{ kind: 'sense_unresolved', sentence: 0, hanzi: '会' }]);
  });

  it('会 anotado como «saber» se resuelve por la anotación', () => {
    const { resolved, issues } = resolveSenses(
      reading(
        [t('他', 'tā'), t('会', 'huì'), t('。')],
        [{ sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 1, sense_index: 1 }],
      ),
      dictionary,
    );
    expect(issues).toEqual([]);
    expect(resolved).toEqual([
      { sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 1, sense_index: 1, by: 'annotation' },
    ]);
  });

  it('una anotación zhǎng sobre una frase con cháng da sense_conflict', () => {
    const { issues } = resolveSenses(
      reading(
        [t('长城', 'Chángchéng'), t('很', 'hěn'), t('长', 'cháng'), t('。')],
        [{ sentence: 0, hanzi: '长', occurrence: 0, hsk_level: 3, sense_index: null }],
      ),
      dictionary,
    );
    expect(issues).toEqual([
      { kind: 'sense_conflict', sentence: 0, hanzi: '长', detail: 'anotado zhǎng, la frase dice cháng' },
    ]);
  });

  it('una anotación que nombra una entrada inexistente da sense_conflict', () => {
    const { issues } = resolveSenses(
      reading(
        [t('他', 'tā'), t('会', 'huì'), t('。')],
        [{ sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 2, sense_index: 1 }],
      ),
      dictionary,
    );
    expect(issues).toEqual([
      { kind: 'sense_conflict', sentence: 0, hanzi: '会', detail: 'no hay entrada 会 HSK 2 #1' },
    ]);
  });

  it('好 (idéntico en L1 y L2) se resuelve sin anotación con la entrada L1', () => {
    const { resolved, issues } = resolveSenses(
      reading([t('很', 'hěn'), t('好', 'hǎo'), t('。')]),
      dictionary,
    );
    expect(issues).toEqual([]);
    expect(resolved).toEqual([
      { sentence: 0, hanzi: '好', occurrence: 0, hsk_level: 1, sense_index: null, by: 'only' },
    ]);
  });

  it('会 «reunión» (L3) en una lectura HSK 2 da sense_above_level', () => {
    const { issues } = resolveSenses(
      reading(
        [t('他', 'tā'), t('会', 'huì'), t('。')],
        [{ sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 3, sense_index: 2 }],
        2,
      ),
      dictionary,
    );
    expect(issues).toEqual([
      { kind: 'sense_above_level', sentence: 0, hanzi: '会', detail: 'HSK 3 en una lectura HSK 2' },
    ]);
  });

  it('una palabra de una sola entrada por encima del nivel también da sense_above_level', () => {
    const { issues } = resolveSenses(
      reading([t('长城', 'Chángchéng'), t('很', 'hěn'), t('长', 'cháng'), t('。')], undefined, 2),
      dictionary,
    );
    expect(issues).toEqual([
      { kind: 'sense_above_level', sentence: 0, hanzi: '长城', detail: 'HSK 3 en una lectura HSK 2' },
    ]);
  });

  it('el pinyin con cambio de tono de 一 resuelve 一会儿', () => {
    const { resolved, issues } = resolveSenses(
      reading([t('一会儿', 'yīhuìr'), t('。')]),
      dictionary,
    );
    expect(issues).toEqual([]);
    expect(resolved[0]).toMatchObject({ hanzi: '一会儿', hsk_level: 2, by: 'only' });
  });

  it('distingue la segunda aparición de la misma palabra', () => {
    const { resolved, issues } = resolveSenses(
      reading(
        [t('花', 'huā'), t('很', 'hěn'), t('好', 'hǎo'), t('花', 'huā'), t('。')],
        [
          { sentence: 0, hanzi: '花', occurrence: 0, hsk_level: 2, sense_index: 1 },
          { sentence: 0, hanzi: '花', occurrence: 1, hsk_level: 2, sense_index: 2 },
        ],
      ),
      dictionary,
    );
    expect(issues).toEqual([]);
    expect(resolved.filter(sense => sense.hanzi === '花')).toEqual([
      { sentence: 0, hanzi: '花', occurrence: 0, hsk_level: 2, sense_index: 1, by: 'annotation' },
      { sentence: 0, hanzi: '花', occurrence: 1, hsk_level: 2, sense_index: 2, by: 'annotation' },
    ]);
  });

  it('una anotación sobre un token sin varias acepciones da annotation_orphan', () => {
    const { issues } = resolveSenses(
      reading(
        [t('很', 'hěn'), t('好', 'hǎo'), t('。')],
        [
          { sentence: 0, hanzi: '好', occurrence: 0, hsk_level: 1, sense_index: null },
          { sentence: 0, hanzi: '会', occurrence: 0, hsk_level: 1, sense_index: 1 },
        ],
      ),
      dictionary,
    );
    expect(issues).toEqual([
      { kind: 'annotation_orphan', sentence: 0, hanzi: '好' },
      { kind: 'annotation_orphan', sentence: 0, hanzi: '会' },
    ]);
  });

  it('sin pinyin alineado, una palabra con varias acepciones pide anotación', () => {
    const { issues } = resolveSenses(reading([t('长', null), t('。')]), dictionary);
    expect(issues).toEqual([{ kind: 'sense_unresolved', sentence: 0, hanzi: '长' }]);
  });
});
