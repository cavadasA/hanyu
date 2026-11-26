import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectImageFiles, collectRepoMediaFiles } from './lib/media.js';
import { createStorageRestClient, syncMedia } from './sync-media.js';

function fakeStorage(initial = []) {
  const objects = new Map(initial.map(name => [name, 'remoto']));
  const uploads = [];
  return {
    objects,
    uploads,
    bucketEnsured: 0,
    async ensureBucket() { this.bucketEnsured += 1; },
    async list() { return new Set(objects.keys()); },
    async upload(name, bytes, contentType) {
      uploads.push({ name, contentType });
      objects.set(name, bytes);
    },
  };
}

const files = [
  { storagePath: 'media/aaa.m4a', file: '/x/00.m4a', contentType: 'audio/mp4' },
  { storagePath: 'media/bbb.m4a', file: '/x/01.m4a', contentType: 'audio/mp4' },
  // El mismo clip en dos lecturas: un solo objeto.
  { storagePath: 'media/aaa.m4a', file: '/y/00.m4a', contentType: 'audio/mp4' },
];
const readBytes = file => Buffer.from(file);

describe('sync-media', () => {
  it('sube lo que falta y una segunda ejecución no sube nada', async () => {
    const storage = fakeStorage();

    const first = await syncMedia({ client: storage, files, readBytes });
    const second = await syncMedia({ client: storage, files, readBytes });

    expect(first.uploaded).toEqual(['aaa.m4a', 'bbb.m4a']);
    expect(second.uploaded).toEqual([]);
    expect(storage.uploads).toHaveLength(2);
  });

  it('nunca borra lo que hay en Storage y no está en el repositorio', async () => {
    const storage = fakeStorage(['viejo.m4a']);

    await syncMedia({ client: storage, files, readBytes });

    expect(storage.objects.has('viejo.m4a')).toBe(true);
  });

  it('--dry-run cuenta los pendientes sin subir', async () => {
    const storage = fakeStorage(['aaa.m4a']);

    const result = await syncMedia({ client: storage, files, readBytes, dryRun: true });

    expect(result.pending).toEqual(['bbb.m4a']);
    expect(storage.uploads).toEqual([]);
  });

  it('el cliente REST pagina el listado y sube sin sobrescribir', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/object/list/media')) {
        const { offset } = JSON.parse(init.body);
        const page = offset === 0 ? Array.from({ length: 1000 }, (_, i) => ({ name: `${i}.m4a` })) : [{ name: 'último.m4a' }];
        return new Response(JSON.stringify(page), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };
    const client = createStorageRestClient({ url: 'https://p.supabase.co', serviceKey: 'k', fetch });

    const names = await client.list();
    await client.upload('aaa.m4a', Buffer.from('x'), 'audio/mp4');

    expect(names.size).toBe(1001);
    const upload = calls.at(-1);
    expect(upload.url).toBe('https://p.supabase.co/storage/v1/object/media/aaa.m4a');
    expect(upload.init.headers['x-upsert']).toBe('false');
    expect(upload.init.headers['cache-control']).toContain('immutable');
  });

  it('collectImageFiles da la ruta de Storage de cada imagen declarada que existe', () => {
    const imagesDir = mkdtempSync(join(tmpdir(), 'hanyu-images-'));
    const dir = join(imagesDir, 'exam', 'hsk2', 'A');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'apple.webp'), 'manzana');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      owner: 'exam/hsk2/A',
      images: [{ key: 'apple', file: 'apple.webp' }, { key: 'ball', file: 'ball.webp' }],
    }));
    const sha = createHash('sha256').update('manzana').digest('hex');

    expect(collectImageFiles(imagesDir)).toEqual([{
      owner: 'exam/hsk2/A',
      key: 'apple',
      file: join(dir, 'apple.webp'),
      storagePath: `media/${sha}.webp`,
      contentType: 'image/webp',
    }]);
  });

  it('el conjunto por defecto incluye cada imagen que sirven las formas del simulacro', () => {
    const forms = JSON.parse(readFileSync(new URL('../server/db/seeds/exam-forms.json', import.meta.url), 'utf8'));
    const served = new Set(forms.flatMap(form => Object.values(form.media.images).map(image => image.path)));
    const synced = new Set(collectRepoMediaFiles().map(file => file.storagePath));

    expect(served.size).toBeGreaterThan(0);
    expect([...served].filter(path => !synced.has(path))).toEqual([]);
  });
});
