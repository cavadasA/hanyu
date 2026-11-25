import { describe, expect, it } from 'vitest';
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
});
