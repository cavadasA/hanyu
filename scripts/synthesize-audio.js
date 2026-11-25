// Genera el audio de las lecturas: un clip por frase con la voz del personaje
// que habla (diálogos) o la voz narradora de la serie, y el `manifest.json` que
// valida build-media. Sin --force solo regenera los clips que faltan o cuyo
// texto cambió (source_hash distinto), los de otra voz o los de otro proveedor.
//
//   node scripts/synthesize-audio.js <slug|--all> --provider edge|azure [--force]
//
// edge: provisional (edge-tts no acepta <phoneme>); deja en
// content/audio/POLIFONOS.md las frases con polífonos para revisarlas de oído.
// azure: SSML con los polífonos forzados desde el pinyin de la frase.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { sourceHash } from '../packages/domain/src/media/manifest.ts';
import { loadDictionary, loadReadings, loadSeries } from './build-readings.js';
import { defaultContentDir, findManifests } from './lib/media.js';
import { readingOwner } from './lib/media-owners.js';
import { clipKey, speakerOf, spokenText } from './lib/reading-audio.js';
import { polyphonesIn, sentenceToSsml } from './lib/ssml.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const EDGE_LICENSE = 'provisional: edge-tts, no apto para publicar';
export const AZURE_LICENSE = 'Azure AI Speech, uso comercial según contrato';

/** edge-tts por `uvx`: texto plano, sin SSML. Devuelve mp3. */
export function edgeProvider({ run = execFileSync } = {}) {
  return {
    name: 'edge-tts',
    license: EDGE_LICENSE,
    provisional: true,
    async synthesize({ text, voice }) {
      const dir = mkdtempSync(join(tmpdir(), 'hanyu-edge-'));
      try {
        const out = join(dir, 'clip.mp3');
        run('uvx', ['edge-tts', '--voice', voice, '--text', text, '--write-media', out], { stdio: 'pipe' });
        return readFileSync(out);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** API REST de Azure AI Speech con SSML. Devuelve mp3. */
export function azureProvider({ key, region, fetch = globalThis.fetch }) {
  if (!key || !region) throw new Error('Faltan AZURE_SPEECH_KEY y AZURE_SPEECH_REGION (.env.hanyu.local)');
  return {
    name: 'azure',
    license: AZURE_LICENSE,
    provisional: false,
    async synthesize({ ssml }) {
      const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'hanyu-build',
        },
        body: ssml,
      });
      if (!response.ok) throw new Error(`Azure Speech respondió ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

/** mp3 → m4a (AAC) con ffmpeg. */
export function ffmpegToM4a(mp3, out, { run = execFileSync } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hanyu-m4a-'));
  try {
    const input = join(dir, 'in.mp3');
    writeFileSync(input, mp3);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-c:a', 'aac', '-b:a', '48k', out], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function fileDurationMs(file) {
  const metadata = await parseFile(file, { duration: true });
  return Math.round((metadata.format.duration ?? 0) * 1000);
}

export function voiceFor(sentence, reading, series) {
  const speaker = speakerOf(sentence, reading, series);
  if (speaker) {
    const voice = series.characters.find(character => character.name === speaker)?.voice;
    if (!voice) throw new Error(`${reading.slug}: el personaje ${speaker} de la serie ${series.code} no declara voz`);
    return voice;
  }
  if (!series?.narrator_voice) throw new Error(`${reading.slug}: la serie ${reading.series} no declara narrator_voice`);
  return series.narrator_voice;
}

function readManifest(dir) {
  const path = join(dir, 'manifest.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function providerOf(manifest) {
  return manifest?.produced_by?.split(':')[0] ?? null;
}

/**
 * Sintetiza los clips de una lectura que falten o estén desfasados.
 * Devuelve cuántas llamadas hizo al proveedor.
 */
export async function synthesizeReading({
  reading,
  series,
  dictionary,
  provider,
  contentDir = defaultContentDir,
  force = false,
  toM4a = ffmpegToM4a,
  durationOf = fileDurationMs,
}) {
  const owner = readingOwner(reading.slug);
  const dir = join(contentDir, owner);
  mkdirSync(dir, { recursive: true });

  const previous = readManifest(dir);
  const reusable = !force && providerOf(previous) === provider.name
    ? new Map(previous.clips.map(clip => [clip.key, clip]))
    : new Map();

  let calls = 0;
  const clips = [];
  for (const [index, sentence] of reading.sentences.entries()) {
    const key = clipKey(index);
    const voice = voiceFor(sentence, reading, series);
    const hash = sourceHash(sentence);
    const old = reusable.get(key);
    if (old && old.source_hash === hash && old.voice === voice && existsSync(join(dir, old.file))) {
      clips.push(old);
      continue;
    }

    const speaker = speakerOf(sentence, reading, series);
    const text = spokenText(sentence, reading, series);
    const ssml = sentenceToSsml(sentence, voice, dictionary, { speaker });
    const mp3 = await provider.synthesize({ text, ssml, voice });
    calls += 1;

    const file = `${key}.m4a`;
    toM4a(mp3, join(dir, file));
    clips.push({ key, file, duration_ms: await durationOf(join(dir, file)), voice, source_hash: hash });
  }

  // Clips de frases que ya no existen.
  for (const clip of previous?.clips ?? []) {
    if (!clips.some(kept => kept.file === clip.file) && existsSync(join(dir, clip.file))) {
      unlinkSync(join(dir, clip.file));
    }
  }

  const voices = [...new Set(clips.map(clip => clip.voice))].sort();
  const manifest = {
    kind: 'neural',
    owner,
    produced_by: `${provider.name}:${voices.join('+')}`,
    license: provider.license,
    ...(provider.provisional ? { provisional: true } : {}),
    clips,
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { calls, manifest };
}

/**
 * Frases con polífonos de las lecturas cuyo audio no pudo forzarlos (edge-tts),
 * para revisarlas de oído. Se regenera entero en cada ejecución.
 */
export function polyphoneReport({ readings, series, dictionary, contentDir = defaultContentDir }) {
  const provisional = new Set(
    findManifests(contentDir).filter(({ manifest }) => providerOf(manifest) === 'edge-tts').map(({ owner }) => owner),
  );

  const lines = [
    '# Polífonos por revisar de oído',
    '',
    'Generado por `npm run synthesize-audio`. edge-tts no acepta `<phoneme>`, así que la voz',
    'elige la lectura de estos hanzi. Cada frase se escucha y se compara con su pinyin.',
    '',
  ];
  let total = 0;
  for (const reading of readings) {
    if (!provisional.has(readingOwner(reading.slug))) continue;
    const declared = series.find(entry => entry.code === reading.series);
    const rows = reading.sentences.flatMap((sentence, index) => {
      const found = polyphonesIn(sentence, dictionary, { speaker: speakerOf(sentence, reading, declared) });
      if (found.length === 0) return [];
      const marks = found.map(entry => `${entry.hanzi} = ${entry.ph}`).join(', ');
      return [`- [ ] \`${clipKey(index)}\` ${sentence.zh} — ${sentence.pinyin} — ${marks}`];
    });
    if (rows.length === 0) continue;
    total += rows.length;
    lines.push(`## ${reading.slug}`, '', ...rows, '');
  }
  if (total === 0) lines.push('Ninguna.', '');
  return { markdown: lines.join('\n'), total };
}

function loadLocalEnv() {
  const path = join(rootDir, '.env.hanyu.local');
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
      .filter(Boolean)
      .map(([, name, value]) => [name, value.replace(/^['"]|['"]$/g, '')]),
  );
}

function argValue(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

if (process.argv[1] && process.argv[1].endsWith('synthesize-audio.js')) {
  const providerName = argValue('--provider');
  const target = process.argv.slice(2).find(arg => !arg.startsWith('--') && arg !== providerName);
  const all = process.argv.includes('--all');
  if (!['edge', 'azure'].includes(providerName) || (!all && !target)) {
    console.error('Uso: synthesize-audio.js <slug|--all> --provider edge|azure [--force]');
    process.exit(2);
  }

  const env = { ...loadLocalEnv(), ...process.env };
  const provider = providerName === 'edge'
    ? edgeProvider()
    : azureProvider({ key: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION });
  const series = loadSeries();
  const dictionary = loadDictionary();
  const readings = loadReadings();
  const selected = all ? readings : readings.filter(reading => reading.slug === target);
  if (selected.length === 0) {
    console.error(`No existe la lectura ${target}`);
    process.exit(1);
  }

  let calls = 0;
  for (const reading of selected) {
    const result = await synthesizeReading({
      reading,
      series: series.find(entry => entry.code === reading.series),
      dictionary,
      provider,
      force: process.argv.includes('--force'),
    });
    calls += result.calls;
    console.log(`${reading.slug}: ${result.calls} clips nuevos de ${reading.sentences.length}`);
  }

  const report = polyphoneReport({ readings, series, dictionary });
  writeFileSync(join(defaultContentDir, 'POLIFONOS.md'), report.markdown);
  console.log(`${calls} clips sintetizados; ${report.total} frases con polífonos por revisar de oído`);
}
