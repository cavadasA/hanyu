import { describe, expect, it } from 'vitest';
import { validateCatalogShape, type SeriesDeclaration } from './series';

const tienda: SeriesDeclaration = {
  code: 'tienda',
  title: '小商店',
  topic: 'compras',
  characters: [{ name: '小林', role_es: 'estudiante' }],
  planned_episodes: 2,
};

const trabajo: SeriesDeclaration = {
  code: 'oficina',
  title: '新工作',
  topic: 'trabajo',
  characters: [{ name: '王明', role_es: 'oficinista' }],
  planned_episodes: 2,
};

function episode(series: string | null, series_index: number | null, topic: string, zh = '小林去商店。王明也去。') {
  return {
    slug: `${series ?? 'suelta'}-${series_index ?? 0}`,
    topic,
    series,
    series_index,
    sentences: [{ zh, pinyin: '', es: '' }],
  };
}

const complete = [
  episode('tienda', 1, 'compras'),
  episode('tienda', 2, 'compras'),
  episode('oficina', 1, 'trabajo'),
  episode('oficina', 2, 'trabajo'),
];

const kinds = (issues: Array<{ kind: string }>) => issues.map(issue => issue.kind);

describe('validateCatalogShape', () => {
  it('un catálogo de dos series completas no tiene problemas', () => {
    expect(validateCatalogShape(complete, [tienda, trabajo], { topics: ['compras', 'trabajo'] })).toEqual([]);
  });

  it('series_gap: una serie con un episodio que falta lo nombra', () => {
    const series = [{ ...tienda, planned_episodes: 4 }];
    const readings = [1, 2, 4].map(index => episode('tienda', index, 'compras'));

    const issues = validateCatalogShape(readings, series, { topics: ['compras'] });

    expect(kinds(issues)).toEqual(['series_gap']);
    expect(issues[0].detail).toContain('3');
  });

  it('series_overfull: más episodios de los previstos', () => {
    const readings = [...complete, episode('tienda', 3, 'compras')];

    expect(kinds(validateCatalogShape(readings, [tienda, trabajo], { topics: ['compras', 'trabajo'] })))
      .toEqual(['series_overfull']);
  });

  it('series_unknown: una lectura de una serie no declarada', () => {
    const readings = [...complete, episode('playa', 1, 'compras')];

    expect(kinds(validateCatalogShape(readings, [tienda, trabajo], { topics: ['compras', 'trabajo'] })))
      .toEqual(['series_unknown']);
  });

  it('orphan_reading: toda lectura pertenece a una serie', () => {
    const readings = [...complete, episode(null, null, 'compras')];

    expect(kinds(validateCatalogShape(readings, [tienda, trabajo], { topics: ['compras', 'trabajo'] })))
      .toEqual(['orphan_reading']);
  });

  it('topic_mismatch: el tema de la lectura es el de su serie', () => {
    const readings = [episode('tienda', 1, 'salud'), ...complete.slice(1)];

    expect(kinds(validateCatalogShape(readings, [tienda, trabajo], { topics: ['compras', 'trabajo'] })))
      .toEqual(['topic_mismatch']);
  });

  it('topic_missing: un tema sin ninguna serie', () => {
    const readings = complete.filter(reading => reading.series === 'tienda');

    const issues = validateCatalogShape(readings, [tienda], { topics: ['compras', 'trabajo'] });

    expect(kinds(issues)).toEqual(['topic_missing']);
    expect(issues[0].detail).toBe('trabajo');
  });

  it('character_absent: un episodio sin ningún personaje de su serie', () => {
    const readings = [episode('tienda', 1, 'compras', '今天下雨。'), ...complete.slice(1)];

    const issues = validateCatalogShape(readings, [tienda, trabajo], { topics: ['compras', 'trabajo'] });

    expect(kinds(issues)).toEqual(['character_absent']);
    expect(issues[0].detail).toContain('tienda-1');
  });

  it('por defecto exige los nueve temas del maestro', () => {
    const issues = validateCatalogShape(complete, [tienda, trabajo]);

    expect(issues.filter(issue => issue.kind === 'topic_missing').map(issue => issue.detail)).toEqual([
      'vida diaria', 'estudio', 'eventos', 'lugares', 'salud', 'ocio', 'comunicación interpersonal',
    ]);
  });
});
