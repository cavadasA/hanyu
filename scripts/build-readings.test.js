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

  it('todas las lecturas del catálogo pasan los validadores', () => {
    const bad = validateCatalog().filter(entry => entry.issues.length > 0);

    expect(
      bad.map(entry => `${entry.slug}: ${entry.issues.map(issue => issue.kind).join(', ')}`),
    ).toEqual([]);
  });
});
