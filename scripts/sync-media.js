// Sube a Storage los clips e imágenes del repositorio que aún no están. Idempotente por
// hash: el nombre del objeto es el sha256 del fichero, así que si ya existe es
// el mismo. Nunca borra: un objeto que el repositorio ya no usa no estorba, y
// una versión anterior de la app puede seguir pidiéndolo.
//
// Uso (CI): SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/sync-media.js [--dry-run]
// Sin dependencias de npm: la CI lo ejecuta sin `npm ci`.
import { readFileSync } from 'node:fs';
import { collectRepoMediaFiles } from './lib/media.js';

const BUCKET = 'media';
const PAGE = 1000;

function objectName(storagePath) {
  if (!storagePath.startsWith(`${BUCKET}/`)) {
    throw new Error(`Ruta de Storage fuera del bucket ${BUCKET}: ${storagePath}`);
  }
  return storagePath.slice(BUCKET.length + 1);
}

export function createStorageRestClient({ url, serviceKey, fetch = globalThis.fetch }) {
  const base = `${url.replace(/\/$/, '')}/storage/v1`;
  const auth = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

  async function call(path, init) {
    const response = await fetch(`${base}${path}`, init);
    if (!response.ok) {
      throw new Error(`Storage ${init.method} ${path}: ${response.status} ${await response.text()}`);
    }
    return response;
  }

  return {
    async ensureBucket() {
      const response = await fetch(`${base}/bucket/${BUCKET}`, { method: 'GET', headers: auth });
      if (response.ok) return;
      await call('/bucket', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      });
    },

    async list() {
      const names = new Set();
      for (let offset = 0; ; offset += PAGE) {
        const response = await call(`/object/list/${BUCKET}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ prefix: '', limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
        });
        const page = await response.json();
        for (const entry of page) names.add(entry.name);
        if (page.length < PAGE) return names;
      }
    },

    async upload(name, bytes, contentType) {
      await call(`/object/${BUCKET}/${name}`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': contentType,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-upsert': 'false',
        },
        body: bytes,
      });
    },
  };
}

export async function syncMedia({
  client,
  files = collectRepoMediaFiles(),
  readBytes = file => readFileSync(file),
  dryRun = false,
}) {
  if (!dryRun) await client.ensureBucket();
  const remote = await client.list();

  const wanted = new Map();
  for (const entry of files) {
    const name = objectName(entry.storagePath);
    if (!wanted.has(name)) wanted.set(name, entry);
  }

  const pending = [...wanted.keys()].filter(name => !remote.has(name)).sort();
  if (dryRun) return { pending, uploaded: [] };

  const uploaded = [];
  for (const name of pending) {
    const entry = wanted.get(name);
    await client.upload(name, readBytes(entry.file), entry.contentType);
    uploaded.push(name);
  }
  return { pending, uploaded };
}

if (process.argv[1] && process.argv[1].endsWith('sync-media.js')) {
  const url = process.env.SUPABASE_URL
    ?? (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : undefined);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Faltan SUPABASE_URL (o SUPABASE_PROJECT_ID) y SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const { pending, uploaded } = await syncMedia({
    client: createStorageRestClient({ url, serviceKey }),
    dryRun,
  });
  console.log(dryRun
    ? `${pending.length} ficheros pendientes de subir`
    : `${uploaded.length} ficheros subidos (${pending.length} pendientes)`);
}
