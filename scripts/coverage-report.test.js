import { buildCoverageReport } from './coverage-report.js';

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
