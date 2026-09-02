import { deriveGrammarPrerequisites, splitStageIndex } from './grammar-prerequisites.js';

describe('splitStageIndex', () => {
  it('separa la familia de su etapa', () => {
    expect(splitStageIndex('比较句1')).toEqual({ family: '比较句', stage: 1 });
    expect(splitStageIndex('“是……的”句2')).toEqual({ family: '“是……的”句', stage: 2 });
  });

  it('devuelve etapa null cuando el título no está numerado', () => {
    expect(splitStageIndex('动词重叠')).toEqual({ family: '动词重叠', stage: null });
  });
});

describe('deriveGrammarPrerequisites', () => {
  const points = [
    { code: '6.3.1', hsk_level: 1, title: '“是”字句1', items: [] },
    { code: '6.3.1', hsk_level: 2, title: '“是”字句2', items: [] },
    { code: '6.3.4', hsk_level: 2, title: '比较句1', items: [] },
    { code: '6.3.4', hsk_level: 3, title: '比较句2', items: [] },
    { code: '2.2.1', hsk_level: 2, title: '动词重叠', items: ['AA、A一A'] },
  ];

  it('encadena cada etapa con la inmediatamente anterior de su familia', () => {
    expect(deriveGrammarPrerequisites(points)).toEqual([
      { code: '6.3.1', hsk_level: 2, requires_code: '6.3.1', requires_level: 1 },
      { code: '6.3.4', hsk_level: 3, requires_code: '6.3.4', requires_level: 2 },
    ]);
  });

  it('no inventa prerrequisitos para familias de una sola etapa', () => {
    const single = deriveGrammarPrerequisites([points[4]]);

    expect(single).toEqual([]);
  });

  it('ignora los índices de sentido léxico que aparecen en las viñetas', () => {
    const withItems = [
      { code: '2.7.3', hsk_level: 2, title: '时间副词', items: ['还2、已经、有时（候）'] },
      { code: '2.9.2', hsk_level: 2, title: '连接分句或者句子', items: ['因为2、所以'] },
    ];

    expect(deriveGrammarPrerequisites(withItems)).toEqual([]);
  });
});
