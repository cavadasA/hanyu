import { buildCoverageReport, buildReadingCoverage } from './coverage-report.js';

describe('buildCoverageReport', () => {
  const report = buildCoverageReport();

  it('declara la revisión del sílabo y el estado de las fuentes', () => {
    expect(report.revision).toBe('2025-11');
    expect(report.sources.every((entry) => entry.status === 'ok')).toBe(true);
  });

  it('contabiliza los sentidos cubiertos y los no resueltos', () => {
    for (const level of [1, 2, 3]) {
      expect(report.vocabulary[level].covered + report.vocabulary[level].unresolved)
        .toBe(report.vocabulary[level].official);
    }
  });

  it('no deja sentidos sin fuente de diccionario sin resolver', () => {
    expect(report.vocabulary[2].unresolved).toBe(0);
    expect(report.vocabulary[3].unresolved).toBe(0);
  });

  it('separa la cobertura editorial de la cobertura del diccionario', () => {
    expect(report.vocabulary[2].editorial_overrides).toBe(3);
    expect(report.vocabulary[3].editorial_overrides).toBe(3);
  });

  it('cubre el 100 % de los caracteres oficiales', () => {
    expect(report.characters[2]).toEqual({ official: 125, covered: 125, percent: 100 });
  });

  it('cuenta los puntos de gramática por nivel', () => {
    expect(report.grammar[2].covered).toBeGreaterThan(40);
  });

  it('cuenta cuántas entradas tienen glosa española', () => {
    expect(report.vocabulary[2].with_spanish).toBeGreaterThan(0);
  });
});

describe('cobertura de las lecturas', () => {
  it('cuenta las palabras HSK 2 que aparecen y los puntos HSK 2 que se trabajan', () => {
    const coverage = buildReadingCoverage({
      readings: [{
        hsk_level: 2,
        sentences: [{ zh: '我们一起去旅游。' }],
        target_grammar: [{ code: '2.7.2', level: 2 }],
      }],
      dictionary: [
        { hanzi: '我们', hsk_level: 1 }, { hanzi: '一起', hsk_level: 2 },
        { hanzi: '去', hsk_level: 1 }, { hanzi: '旅游', hsk_level: 2 }, { hanzi: '跑步', hsk_level: 2 },
      ],
      grammarPoints: [{ code: '2.7.2', hsk_level: 2 }, { code: '6.4.3', hsk_level: 2 }],
    });

    expect(coverage.vocabulary).toEqual({ covered: 2, official: 3, percent: 66.7 });
    expect(coverage.grammar).toEqual({ covered: 1, official: 2, percent: 50 });
  });

  it('las 48 lecturas cubren al menos el 85 % del vocabulario y el 70 % de la gramática HSK 2', () => {
    const coverage = buildReadingCoverage();

    expect(coverage.readings).toBe(48);
    expect(coverage.vocabulary.percent).toBeGreaterThanOrEqual(85);
    expect(coverage.grammar.percent).toBeGreaterThanOrEqual(70);
  });
});
