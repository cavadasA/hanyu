import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provisionalOwners } from './lib/media.js';
import {
  AZURE_LICENSE,
  EDGE_LICENSE,
  azureProvider,
  polyphoneReport,
  synthesizeReading,
} from './synthesize-audio.js';

const dictionary = [
  { hanzi: '我', pinyin: 'wǒ' },
  { hanzi: '在', pinyin: 'zài' },
  { hanzi: '银行', pinyin: 'yínháng' },
  { hanzi: '不行', pinyin: 'bùxíng' },
  { hanzi: '工作', pinyin: 'gōngzuò' },
  { hanzi: '很', pinyin: 'hěn' },
  { hanzi: '好', pinyin: 'hǎo' },
  { hanzi: '你', pinyin: 'nǐ' },
];

const series = {
  code: 'oficina',
  narrator_voice: 'zh-CN-XiaoxiaoNeural',
  characters: [
    { name: '小林', role_es: 'x', voice: 'zh-CN-YunxiNeural' },
    { name: '小雪', role_es: 'y', voice: 'zh-CN-XiaoyiNeural' },
  ],
};

const story = () => ({
  slug: 'oficina-01-prueba',
  format: 'story',
  series: 'oficina',
  sentences: [
    { zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōngzuò.' },
    { zh: '我很好。', pinyin: 'Wǒ hěn hǎo.' },
  ],
});

const dialogue = () => ({
  slug: 'oficina-02-dialogo',
  format: 'dialogue',
  series: 'oficina',
  sentences: [
    { zh: '小林：你好！', pinyin: 'Xiǎolín: Nǐ hǎo!' },
    { zh: '小雪：我很好。', pinyin: 'Xiǎoxuě: Wǒ hěn hǎo.' },
  ],
});

function fakeProvider(name = 'edge-tts') {
  const requests = [];
  return {
    requests,
    name,
    license: name === 'edge-tts' ? EDGE_LICENSE : AZURE_LICENSE,
    provisional: name === 'edge-tts',
    async synthesize(request) {
      requests.push(request);
      return Buffer.from(`audio:${request.voice}:${request.text}`);
    },
  };
}

let contentDir;
beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), 'hanyu-synth-'));
});
afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true });
});

const run = (reading, provider, extra = {}) => synthesizeReading({
  reading,
  series,
  dictionary,
  provider,
  contentDir,
  toM4a: (mp3, out) => writeFileSync(out, mp3),
  durationOf: async () => 1200,
  ...extra,
});

const manifestOf = slug => JSON.parse(readFileSync(join(contentDir, 'readings', slug, 'manifest.json'), 'utf8'));

describe('synthesizeReading', () => {
  it('genera un clip por frase y un manifiesto provisional con edge', async () => {
    const provider = fakeProvider();
    const { calls } = await run(story(), provider);

    expect(calls).toBe(2);
    const manifest = manifestOf('oficina-01-prueba');
    expect(manifest).toMatchObject({
      kind: 'neural',
      owner: 'readings/oficina-01-prueba',
      produced_by: 'edge-tts:zh-CN-XiaoxiaoNeural',
      license: EDGE_LICENSE,
      provisional: true,
    });
    expect(manifest.clips.map(clip => clip.file)).toEqual(['00.m4a', '01.m4a']);
    expect(manifest.clips[0].duration_ms).toBe(1200);
  });

  it('una segunda ejecución sin cambios no llama al proveedor', async () => {
    await run(story(), fakeProvider());
    const provider = fakeProvider();

    expect((await run(story(), provider)).calls).toBe(0);
  });

  it('cambiar el pinyin de una frase regenera solo ese clip', async () => {
    await run(story(), fakeProvider());
    const before = manifestOf('oficina-01-prueba');
    const edited = story();
    edited.sentences[1].pinyin = 'Wǒ hěn hǎo!';
    const provider = fakeProvider();

    expect((await run(edited, provider)).calls).toBe(1);
    expect(provider.requests[0].text).toBe('我很好。');
    const after = manifestOf('oficina-01-prueba');
    expect(after.clips[0]).toEqual(before.clips[0]);
    expect(after.clips[1].source_hash).not.toBe(before.clips[1].source_hash);
  });

  it('en un diálogo habla la voz del personaje y no se pronuncia su nombre', async () => {
    const provider = fakeProvider();
    await run(dialogue(), provider);

    expect(provider.requests.map(request => [request.voice, request.text])).toEqual([
      ['zh-CN-YunxiNeural', '你好！'],
      ['zh-CN-XiaoyiNeural', '我很好。'],
    ]);
    expect(manifestOf('oficina-02-dialogo').produced_by).toBe('edge-tts:zh-CN-XiaoyiNeural+zh-CN-YunxiNeural');
  });

  it('cambiar de proveedor regenera todos los clips y quita la marca provisional', async () => {
    await run(story(), fakeProvider());
    const provider = fakeProvider('azure');

    expect((await run(story(), provider)).calls).toBe(2);
    const manifest = manifestOf('oficina-01-prueba');
    expect(manifest.license).toBe(AZURE_LICENSE);
    expect(manifest.provisional).toBeUndefined();
  });

  it('borra el clip de una frase que ya no existe', async () => {
    await run(story(), fakeProvider());
    const shorter = story();
    shorter.sentences.pop();
    await run(shorter, fakeProvider());

    expect(existsSync(join(contentDir, 'readings', 'oficina-01-prueba', '01.m4a'))).toBe(false);
    expect(manifestOf('oficina-01-prueba').clips).toHaveLength(1);
  });

  it('falla si el personaje que habla no declara voz', async () => {
    const noVoice = { ...series, characters: [{ name: '小林', role_es: 'x' }] };
    await expect(synthesizeReading({
      reading: dialogue(), series: noVoice, dictionary, provider: fakeProvider(), contentDir,
      toM4a: () => {}, durationOf: async () => 1,
    })).rejects.toThrow(/小林/);
  });
});

describe('azureProvider', () => {
  it('envía el SSML con los polífonos forzados y devuelve el audio', async () => {
    const sent = [];
    const fetch = async (url, init) => {
      sent.push({ url, init });
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('mp3').buffer };
    };
    const provider = azureProvider({ key: 'k', region: 'westeurope', fetch });
    const reading = story();
    await run(reading, provider);

    expect(sent).toHaveLength(2);
    expect(sent[0].url).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(sent[0].init.headers['Ocp-Apim-Subscription-Key']).toBe('k');
    expect(sent[0].init.headers['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3');
    expect(sent[0].init.body).toContain('<phoneme alphabet="sapi" ph="hang 2">行</phoneme>');
    expect(manifestOf(reading.slug).produced_by).toBe('azure:zh-CN-XiaoxiaoNeural');
  });

  it('sin clave no arranca', () => {
    expect(() => azureProvider({ key: '', region: 'westeurope' })).toThrow(/AZURE_SPEECH_KEY/);
  });
});

describe('informes', () => {
  it('POLIFONOS.md lista las frases con polífonos de las lecturas hechas con edge', async () => {
    await run(story(), fakeProvider());
    const { markdown, total } = polyphoneReport({
      readings: [story()], series: [series], dictionary, contentDir,
    });

    expect(total).toBe(1);
    expect(markdown).toContain('## oficina-01-prueba');
    expect(markdown).toContain('`00` 我在银行工作。');
    expect(markdown).toContain('行 = hang 2');
    expect(markdown).not.toContain('我很好。');
  });

  it('las lecturas hechas con Azure no entran en POLIFONOS.md', async () => {
    await run(story(), fakeProvider('azure'));

    expect(polyphoneReport({ readings: [story()], series: [series], dictionary, contentDir }).total).toBe(0);
  });

  it('provisionalOwners lista los dueños con audio provisional', async () => {
    await run(story(), fakeProvider());
    await run(dialogue(), fakeProvider('azure'));

    expect(provisionalOwners(contentDir)).toEqual(['readings/oficina-01-prueba']);
  });
});
