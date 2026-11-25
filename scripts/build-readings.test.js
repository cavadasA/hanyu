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
  readingAudio,
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
    // Texto propio y sin más nombres que el del personaje: las lecturas reales
    // cambian y nombran a otros personajes de su serie.
    sentences: [
      `${name}今天去商店。`,
      '我们学校旁边有一个小商店，东西不贵。',
      '商店的先生很好，他认识我们。',
      '奶茶比绿茶贵两块钱。',
      '我们坐在商店门口喝茶，说了很长时间。',
      '我买了一些水果和一个面包。',
      '先生说他们的红茶也很好喝。',
      '我们下次还想来这个商店买东西。',
    ].map(zh => ({ zh, pinyin: 'pinyin', es: 'es' })),
    target_words: ['商店', '奶茶'],
    target_grammar: [],
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
      'tienda-04-broken-bag',
      'tienda-05-new-bag',
      'tienda-06-thank-you',
    ]);
    expect(readings.map(reading => reading.series_index)).toEqual([1, 2, 3, 4, 5, 6]);
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

describe('audio por frase', () => {
  const reading = sentences => ({
    slug: 'casa-01-prueba',
    sentences: Array.from({ length: sentences }, (_, i) => ({ zh: `句${i}`, pinyin: 'jù', es: '' })),
  });
  const entry = clips => Object.fromEntries(Array.from({ length: clips }, (_, i) => [
    String(i).padStart(2, '0'),
    { path: `media/${i}.m4a`, duration_ms: 1000 + i },
  ]));

  it('una lectura con manifiesto neural válido tiene un clip por frase', () => {
    const audio = readingAudio(reading(3), { manifest: { kind: 'neural' }, indexEntry: entry(3) });

    expect(audio.audio_kind).toBe('neural');
    expect(audio.issues).toEqual([]);
    expect(audio.sentence_audio).toEqual([
      { path: 'media/0.m4a', duration_ms: 1000 },
      { path: 'media/1.m4a', duration_ms: 1001 },
      { path: 'media/2.m4a', duration_ms: 1002 },
    ]);
  });

  it('8 frases y 7 clips: clip_missing en la frase de índice 7', () => {
    const audio = readingAudio(reading(8), { manifest: { kind: 'neural' }, indexEntry: entry(7) });

    expect(audio.issues).toEqual([{ kind: 'clip_missing', sentence_index: 7 }]);
  });

  it('un manifiesto que no entró en media-index.json falla en todas sus frases', () => {
    const audio = readingAudio(reading(2), { manifest: { kind: 'human' }, indexEntry: undefined });

    expect(audio.issues.map(issue => issue.sentence_index)).toEqual([0, 1]);
  });

  it('sin manifiesto, la lectura es tts y no tiene clips', () => {
    const audio = readingAudio(reading(2), { manifest: null, indexEntry: undefined });

    expect(audio).toEqual({ audio_kind: 'tts', sentence_audio: [null, null], issues: [] });
  });

  it('validateCatalog añade los problemas de audio a los de la lectura', () => {
    const { readingsDir, seriesFile } = fixtureCatalog({ series: ['tienda'], readingSeries: 'tienda' });
    const audioDir = mkdtempSync(join(tmpdir(), 'hanyu-audio-'));
    const owner = join(audioDir, 'readings', 'market-03-buying-fruit');
    mkdirSync(owner, { recursive: true });
    writeFileSync(join(owner, 'manifest.json'), JSON.stringify({ kind: 'neural', owner: 'readings/market-03-buying-fruit', clips: [] }));
    const mediaIndexFile = join(audioDir, 'media-index.json');
    writeFileSync(mediaIndexFile, '{}');

    const [result] = validateCatalog({ readingsDir, seriesFile, audioDir, mediaIndexFile });

    expect(result.issues).toContainEqual({ kind: 'clip_missing', sentence_index: 0 });
  });
});
