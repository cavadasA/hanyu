import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sourceHash } from '../packages/domain/src/media/manifest.ts';
import { buildMediaIndex } from './build-media.js';
import { collectMediaFiles, defaultIndexFile } from './lib/media.js';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const silence = join(scriptsDir, 'fixtures', 'media', 'silence-2s.m4a');
const silenceSha = createHash('sha256').update(readFileSync(silence)).digest('hex');

// Dos segundos de audio casan con una frase de 6 caracteres (1080–6900 ms).
const texts = {
  '00': { zh: '我觉得很好。', pinyin: 'Wǒ juéde hěn hǎo.' },
  '01': { zh: '他也很好啊。', pinyin: 'Tā yě hěn hǎo a.' },
};

function expectationsFor(owner) {
  if (owner !== 'readings/prueba') return null;
  return {
    expectedKeys: Object.keys(texts),
    textByKey: Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, text.zh])),
    sourceHashByKey: Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, sourceHash(text)])),
  };
}

function fixture({ keys = ['00', '01'], owner = 'readings/prueba', duration_ms = 2000 } = {}) {
  const contentDir = mkdtempSync(join(tmpdir(), 'hanyu-media-'));
  const dir = join(contentDir, ...owner.split('/'));
  mkdirSync(dir, { recursive: true });
  for (const key of keys) copyFileSync(silence, join(dir, `${key}.m4a`));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    kind: 'neural',
    owner,
    produced_by: 'edge-tts:zh-CN-XiaoxiaoNeural',
    license: 'provisional: edge-tts, no apto para publicar',
    provisional: true,
    clips: keys.map(key => ({
      key,
      file: `${key}.m4a`,
      duration_ms,
      voice: 'zh-CN-XiaoxiaoNeural',
      source_hash: texts[key] ? sourceHash(texts[key]) : 'x',
    })),
  }));
  return contentDir;
}

describe('build-media', () => {
  it('emite el índice por dueño y clave, con el fichero direccionado por su hash', async () => {
    const { index, issues } = await buildMediaIndex({ contentDir: fixture(), expectationsFor });

    expect(issues).toEqual([]);
    expect(Object.keys(index)).toEqual(['readings/prueba']);
    expect(index['readings/prueba']['00'].path).toBe(`media/${silenceSha}.m4a`);
  });

  it('la duración sale del fichero, no del manifiesto', async () => {
    const { index, issues } = await buildMediaIndex({
      contentDir: fixture({ duration_ms: 99_999 }),
      expectationsFor,
    });

    expect(issues).toEqual([]);
    expect(index['readings/prueba']['01'].duration_ms).toBeGreaterThan(1900);
    expect(index['readings/prueba']['01'].duration_ms).toBeLessThan(2200);
  });

  it('nombra el dueño y la clave de cada problema', async () => {
    const { issues } = await buildMediaIndex({ contentDir: fixture({ keys: ['00'] }), expectationsFor });

    expect(issues).toEqual([{ owner: 'readings/prueba', kind: 'clip_missing', key: '01' }]);
  });

  it('un manifiesto cuyo dueño nadie reclama es un problema', async () => {
    const { issues } = await buildMediaIndex({
      contentDir: fixture({ owner: 'readings/otra' }),
      expectationsFor,
    });

    expect(issues).toEqual([{ owner: 'readings/otra', kind: 'owner_unknown' }]);
  });

  it('collectMediaFiles da la ruta de Storage de cada clip sin leer duraciones', () => {
    const files = collectMediaFiles(fixture());

    expect(files.map(file => file.storagePath)).toEqual([
      `media/${silenceSha}.m4a`,
      `media/${silenceSha}.m4a`,
    ]);
    expect(files[0]).toMatchObject({ owner: 'readings/prueba', key: '00', contentType: 'audio/mp4' });
  });

  it('el CLI falla con un manifiesto roto', () => {
    const run = spawnSync(process.execPath, [
      join(scriptsDir, 'build-media.js'),
      '--content', fixture({ owner: 'readings/otra' }),
      '--out', join(mkdtempSync(join(tmpdir(), 'hanyu-index-')), 'media-index.json'),
    ], { encoding: 'utf8' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('owner_unknown');
  });

  it('el media-index.json del repositorio está al día y todo el audio valida', async () => {
    const { index, issues } = await buildMediaIndex();

    expect(issues).toEqual([]);
    expect(JSON.parse(readFileSync(defaultIndexFile, 'utf8'))).toEqual(index);
  });
});
