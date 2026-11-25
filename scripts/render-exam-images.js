// Imágenes de una forma del simulacro: los dibujos propios de content/images/exam/svg/
// que usa la forma, convertidos a .webp de 800 px (rsvg-convert + cwebp), y su manifiesto
// con lo que muestra cada uno (catalog.json), su fuente y su licencia.
//
//   node scripts/render-exam-images.js hsk2/A
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examOwner } from './lib/exam-audio.js';
import { loadExamForm } from './lib/exam.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const svgDir = join(rootDir, 'content', 'images', 'exam', 'svg');
const imagesDir = join(rootDir, 'content', 'images');
export const OWN_LICENSE = 'Dibujo propio del proyecto Hanyu, sin material de terceros';

export function imageKeysOf(form) {
  const keys = new Set();
  for (const group of form.groups) {
    for (const key of group.images ?? []) keys.add(key);
    for (const key of group.example?.images ?? []) keys.add(key);
    for (const item of group.items) for (const key of item.images ?? []) keys.add(key);
  }
  return [...keys].sort();
}

export function imageManifestFor(form, catalog, keys = imageKeysOf(form)) {
  return {
    owner: examOwner(form.level, form.code),
    images: keys.map(key => {
      if (!catalog[key]) throw new Error(`${key}: el dibujo no está en catalog.json`);
      return { key, file: `${key}.webp`, depicts_es: catalog[key], source: 'svg-propio', license: OWN_LICENSE };
    }),
  };
}

function renderWebp(svgFile, out) {
  const dir = mkdtempSync(join(tmpdir(), 'hanyu-img-'));
  try {
    const png = join(dir, 'image.png');
    execFileSync('rsvg-convert', ['-w', '800', '-h', '800', svgFile, '-o', png]);
    execFileSync('cwebp', ['-quiet', '-q', '80', png, '-o', out]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('render-exam-images.js')) {
  const match = /^hsk(\d)\/([A-Z])$/.exec(process.argv[2] ?? '');
  if (!match) {
    console.error('Uso: render-exam-images.js hsk2/<forma>');
    process.exit(2);
  }
  const form = loadExamForm(Number(match[1]), match[2]);
  const catalog = JSON.parse(readFileSync(join(svgDir, 'catalog.json'), 'utf8'));
  const manifest = imageManifestFor(form, catalog);
  const outDir = join(imagesDir, manifest.owner);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const image of manifest.images) renderWebp(join(svgDir, `${image.key}.svg`), join(outDir, image.file));
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${manifest.images.length} imágenes → ${outDir}`);
}
