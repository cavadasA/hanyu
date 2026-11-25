import { describe, expect, it } from 'vitest';
import { loadDictionary, loadReadings, validateCatalog } from './build-readings.js';

describe('catálogo de lecturas', () => {
  it('carga las lecturas del directorio', () => {
    expect(loadReadings().length).toBeGreaterThan(0);
  });

  it('cada lectura tiene un slug único', () => {
    const slugs = loadReadings().map(reading => reading.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('declara el nivel junto a cada objetivo gramatical', () => {
    expect(loadReadings().every(reading =>
      reading.target_grammar?.every(target =>
        typeof target === 'object' &&
        typeof target.code === 'string' &&
        Number.isInteger(target.level),
      ),
    )).toBe(true);
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

  it('el diccionario incluye las variantes oficiales en su nivel (没 de 没（有）, 有时 de 有时（候）)', () => {
    const dictionary = loadDictionary();

    expect(dictionary).toContainEqual(expect.objectContaining({ hanzi: '没', hsk_level: 1 }));
    expect(dictionary).toContainEqual(expect.objectContaining({ hanzi: '有时', hsk_level: 2 }));
  });

  it('todas las lecturas del catálogo pasan los validadores', () => {
    const bad = validateCatalog().filter(entry => entry.issues.length > 0);

    expect(
      bad.map(entry => `${entry.slug}: ${entry.issues.map(issue => issue.kind).join(', ')}`),
    ).toEqual([]);
  });
});
