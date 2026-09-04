import { describe, expect, it } from 'vitest';
import { loadReadings, validateCatalog } from './build-readings.js';

describe('catálogo de lecturas', () => {
  it('carga las lecturas del directorio', () => {
    expect(loadReadings().length).toBeGreaterThan(0);
  });

  it('cada lectura tiene un slug único', () => {
    const slugs = loadReadings().map(reading => reading.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('mantiene el orden y la identidad de la serie tienda', () => {
    const readings = loadReadings().filter(reading => reading.series === 'tienda');

    expect(readings.map(reading => reading.slug)).toEqual([
      'shop-01-tea-and-coffee',
      'market-02-too-expensive',
      'market-03-buying-fruit',
    ]);
    expect(readings.map(reading => reading.series_index)).toEqual([1, 2, 3]);
    expect(new Set(readings.map(reading => reading.series)).size).toBe(1);
  });

  it('no deja una secuencia de respuestas A-B-C en el catálogo', () => {
    const predictable = loadReadings().filter(reading =>
      reading.questions?.length === 3 &&
      reading.questions.every((question, index) => question.answer_index === index),
    );

    expect(predictable).toEqual([]);
  });

  it('todas las lecturas del catálogo pasan los validadores', () => {
    const bad = validateCatalog().filter(entry => entry.issues.length > 0);

    expect(
      bad.map(entry => `${entry.slug}: ${entry.issues.map(issue => issue.kind).join(', ')}`),
    ).toEqual([]);
  });
});
