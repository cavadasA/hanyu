// Valida los manifiestos de audio y emite `server/db/seeds/media-index.json`:
// { [dueño]: { [clave]: { path: 'media/<sha256>.<ext>', duration_ms } } }.
// Es lo único que consumen el seed y el simulacro. La duración se lee del
// fichero, no del manifiesto: el manifiesto la guarda para el cliente, la build
// la comprueba.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import { validateAudioManifest } from '../packages/domain/src/media/manifest.ts';
import {
  defaultContentDir,
  defaultIndexFile,
  fileSha256,
  findManifests,
  storagePathFor,
} from './lib/media.js';
import { defaultExpectationsFor } from './lib/media-owners.js';
import { existsSync } from 'node:fs';

async function durationMs(file) {
  const metadata = await parseFile(file, { duration: true });
  return Math.round((metadata.format.duration ?? 0) * 1000);
}

export async function buildMediaIndex({
  contentDir = defaultContentDir,
  expectationsFor = defaultExpectationsFor(),
} = {}) {
  const index = {};
  const issues = [];

  for (const { owner, dir, manifest } of findManifests(contentDir)) {
    const expectations = expectationsFor(owner);
    if (!expectations) {
      issues.push({ owner, kind: 'owner_unknown' });
      continue;
    }
    if (manifest.owner !== owner) {
      issues.push({ owner, kind: 'owner_mismatch', key: manifest.owner });
      continue;
    }

    const present = file => existsSync(join(dir, file));
    const clips = [];
    for (const clip of manifest.clips) {
      clips.push(present(clip.file)
        ? { ...clip, duration_ms: await durationMs(join(dir, clip.file)) }
        : clip);
    }

    const found = validateAudioManifest({ ...manifest, clips }, { ...expectations, fileExists: present });
    issues.push(...found.map(issue => ({ owner, ...issue })));
    if (found.length > 0) continue;

    index[owner] = Object.fromEntries(clips.map(clip => [clip.key, {
      path: storagePathFor(fileSha256(join(dir, clip.file)), clip.file),
      duration_ms: clip.duration_ms,
    }]));
  }

  return { index, issues };
}

function argValue(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

if (process.argv[1] && process.argv[1].endsWith('build-media.js')) {
  const contentDir = argValue('--content') ?? defaultContentDir;
  const out = argValue('--out') ?? defaultIndexFile;
  const { index, issues } = await buildMediaIndex({ contentDir });

  for (const issue of issues) {
    console.error(`${issue.owner}: ${issue.kind}${issue.key ? ` (${issue.key})` : ''}`);
  }
  if (issues.length > 0) {
    console.error(`\n${issues.length} problemas de audio`);
    process.exit(1);
  }

  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  const clips = Object.values(index).reduce((total, keys) => total + Object.keys(keys).length, 0);
  console.log(`${Object.keys(index).length} dueños, ${clips} clips → ${out}`);
}
