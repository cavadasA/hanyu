import { deriveUnits, splitItem } from './derive-units.js';

const words = [
  { id: 1, hanzi: '帮忙', hsk_level: 2 },
  { id: 2, hanzi: '游泳', hsk_level: 2 },
  { id: 3, hanzi: '跳舞', hsk_level: 2 },
  { id: 4, hanzi: '跑步', hsk_level: 2 },
  { id: 5, hanzi: '还', hsk_level: 1 },
];

const grammar = [
  {
    code: '2.2.3', hsk_level: 2, group: '词类', category: '动词',
    detail: '离合词', title: '离合词', items: ['帮忙、游泳、跳舞、跑步'],
  },
  {
    code: '2.2.1', hsk_level: 2, group: '词类', category: '动词',
    detail: '动词重叠', title: '动词重叠', items: ['动词重叠：AA、A一A、A了A、ABAB'],
  },
  {
    code: '2.7.3', hsk_level: 2, group: '词类', category: '副词',
    detail: '时间副词', title: '时间副词', items: ['还2、已经'],
  },
];

describe('splitItem', () => {
  it('separa una lista de palabras por el separador chino', () => {
    expect(splitItem('帮忙、游泳、跳舞、跑步')).toEqual(['帮忙', '游泳', '跳舞', '跑步']);
  });

  it('descarta el prefijo descriptivo antes de los dos puntos', () => {
    expect(splitItem('动词重叠：AA、A一A')).toEqual(['AA', 'A一A']);
  });

  it('quita el índice de sentido para poder casar con el corpus', () => {
    expect(splitItem('还2、已经')).toEqual(['还', '已经']);
  });
});

describe('deriveUnits', () => {
  const units = deriveUnits(grammar, words);

  it('crea una unidad por punto de gramática', () => {
    expect(units.map((unit) => unit.code)).toEqual(['2.2.3', '2.2.1', '2.7.3']);
  });

  it('ancla las palabras que el punto enumera', () => {
    const separable = units.find((unit) => unit.code === '2.2.3');

    expect(separable.word_ids).toEqual([1, 2, 3, 4]);
  });

  it('conserva como patrón lo que no es una palabra', () => {
    const reduplication = units.find((unit) => unit.code === '2.2.1');

    expect(reduplication.word_ids).toEqual([]);
    expect(reduplication.patterns).toEqual(['AA', 'A一A', 'A了A', 'ABAB']);
  });

  it('casa una palabra aunque el sílabo la escriba con índice de sentido', () => {
    const adverbs = units.find((unit) => unit.code === '2.7.3');

    expect(adverbs.word_ids).toEqual([5]);
  });

  it('conserva el sentido exacto cuando el corpus comparte hanzi y nivel', () => {
    const duplicateWords = [
      { id: 10, hanzi: '还', hsk_level: 1, sense_index: 1 },
      { id: 11, hanzi: '还', hsk_level: 1, sense_index: 2 },
    ];
    const duplicateUnits = deriveUnits([
      {
        code: '2.7.4', hsk_level: 1, group: '副词', category: '时间',
        detail: '还', title: '还', items: ['还2'],
      },
    ], duplicateWords);

    expect(duplicateUnits[0].word_ids).toEqual([11]);
  });

  it('usa el candidato más cercano si el sílabo pide un sentido ausente', () => {
    const fallbackUnits = deriveUnits([
      {
        code: '2.8.1', hsk_level: 1, group: '词类', category: '连词',
        detail: '连接词语或短语', title: '连接词语或短语', items: ['还2、和2'],
      },
    ], [
      { id: 20, hanzi: '还', hsk_level: 1, sense_index: null },
      { id: 21, hanzi: '还', hsk_level: 3, sense_index: null },
      { id: 22, hanzi: '和', hsk_level: 1, sense_index: 1 },
    ]);

    expect(fallbackUnits[0].word_ids).toEqual([20, 22]);
    expect(fallbackUnits[0].patterns).toEqual([]);
  });
});
