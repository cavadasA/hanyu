import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadDictionary,
  loadReadings,
  loadSeries,
  validateCatalog,
  validateCatalogStructure,
} from './build-readings.js';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const seedDir = join(scriptsDir, '..', 'server', 'db', 'seeds');

/** Un catálogo mínimo en disco: una lectura real puesta en la serie que se pida. */
function fixtureCatalog({ series, readingSeries, planned = 1, name = '小林' }) {
  const dir = mkdtempSync(join(tmpdir(), 'hanyu-readings-'));
  const readingsDir = join(dir, 'readings');
  mkdirSync(readingsDir);
  const base = JSON.parse(
    readFileSync(join(seedDir, 'readings', 'market-03-buying-fruit.json'), 'utf8'),
  );
  const reading = {
    ...base,
    series: readingSeries,
    series_index: 1,
    sentences: [
      { zh: `${name}今天去商店。`, pinyin: 'Xiǎolín jīntiān qù shāngdiàn.', es: 'Xiaolin va hoy a la tienda.' },
      ...base.sentences.slice(1),
    ],
  };
  writeFileSync(join(readingsDir, `${base.slug}.json`), JSON.stringify(reading));
  const seriesFile = join(dir, 'reading-series.json');
  writeFileSync(seriesFile, JSON.stringify(series.map(code => ({
    code,
    title: '小林买东西',
    topic: 'compras',
    planned_episodes: planned,
    characters: [{ name: code === 'tienda' ? '小林' : '小美', role_es: 'x' }],
  }))));
  return { readingsDir, seriesFile };
}

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

  it('cada lectura pertenece a una serie declarada, con su tema y algún personaje', () => {
    expect(validateCatalogStructure().map(issue => `${issue.kind}: ${issue.detail}`)).toEqual([]);
  });

  it('las series declaradas suman las 48 lecturas del plan y cubren los nueve temas', () => {
    const series = loadSeries();

    expect(series.reduce((total, entry) => total + entry.planned_episodes, 0)).toBe(48);
    expect(new Set(series.map(entry => entry.topic)).size).toBe(9);
  });

  it('acepta el nombre de un personaje sólo en las lecturas de su serie', () => {
    const own = fixtureCatalog({ series: ['tienda', 'escuela'], readingSeries: 'tienda' });
    const other = fixtureCatalog({ series: ['tienda', 'escuela'], readingSeries: 'escuela' });

    expect(validateCatalog(own)[0].issues).toEqual([]);
    expect(validateCatalog(other)[0].issues).toContainEqual(
      expect.objectContaining({ kind: 'unknown_vocabulary', detail: '林' }),
    );
  });

  it('con --complete, una serie a medias rompe la build', () => {
    const { readingsDir, seriesFile } = fixtureCatalog({
      series: ['tienda'],
      readingSeries: 'tienda',
      planned: 3,
    });
    const run = complete => spawnSync(process.execPath, [
      join(scriptsDir, 'build-readings.js'),
      '--readings', readingsDir,
      '--series', seriesFile,
      ...(complete ? ['--complete'] : []),
    ], { encoding: 'utf8' });

    const partial = run(false);
    const strict = run(true);

    expect(partial.status, partial.stderr).toBe(0);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain('series_gap');
  });
});
