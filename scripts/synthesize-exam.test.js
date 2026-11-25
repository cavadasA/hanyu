import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXAM_VOICES } from './lib/exam-audio.js';
import { EDGE_LICENSE, synthesizeExam } from './synthesize-audio.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const structure = JSON.parse(readFileSync(join(rootDir, 'server/db/seeds/exam-structure.json'), 'utf8'));

const PINYIN = {
  '开始。': 'kāishǐ.', '结束。': 'jiéshù.', '第一部分。': 'dì-yī bùfen.', '第二部分。': 'dì-èr bùfen.', '第三部分。': 'dì-sān bùfen.', '现在开始。': 'xiànzài kāishǐ.',
  '我喝茶。': 'wǒ hē chá.', '我喝水。': 'wǒ hē shuǐ.', '你去哪儿？': 'nǐ qù nǎr?', '去学校。': 'qù xuéxiào.',
  '男的去哪儿？': 'nán de qù nǎr?', '学校': 'xuéxiào', '家': 'jiā', '商店': 'shāngdiàn',
};
const p = zh => ({ zh, pinyin: PINYIN[zh] });
const instructions = {
  opening: p('开始。'),
  closing: p('结束。'),
  parts: Object.fromEntries([['L1', '第一部分。'], ['L2', '第二部分。'], ['L3', '第三部分。']].map(([part, zh]) => [part, { instruction: p(zh), start: p('现在开始。') }])),
};
const form = (said = '我喝茶。') => ({
  code: 'A',
  level: 2,
  groups: [
    { slug: 'a-l1', part: 'L1', items: [{ audio: [{ ...p(said), speaker: 'F' }], images: ['a', 'b', 'c'], answer: 0 }] },
    {
      slug: 'a-l3',
      part: 'L3',
      items: [{
        audio: [{ ...p('你去哪儿？'), speaker: 'F' }, { ...p('去学校。'), speaker: 'M' }],
        question: { ...p('男的去哪儿？'), speaker: 'F' },
        options: [p('学校'), p('家'), p('商店')],
        answer: 0,
      }],
    },
  ],
});

function fakeProvider() {
  const requests = [];
  return {
    requests,
    name: 'edge-tts',
    license: EDGE_LICENSE,
    provisional: true,
    async synthesize(request) {
      requests.push(request);
      return Buffer.from(`audio:${request.voice}:${request.text}`);
    },
  };
}

let contentDir;
let concatenated;
beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), 'hanyu-exam-synth-'));
  concatenated = {};
});
afterEach(() => rmSync(contentDir, { recursive: true, force: true }));

const run = (provider, extra = {}) => synthesizeExam({
  form: form(),
  instructions,
  structure,
  dictionary: [],
  provider,
  contentDir,
  concat: (parts, out) => {
    concatenated[out.split('/').pop()] = parts.map(part => (part.mp3 ? part.mp3.toString() : `silence:${part.silence_ms}`));
    writeFileSync(out, 'm4a');
  },
  durationOf: async () => 2500,
  ...extra,
});
const manifest = () => JSON.parse(readFileSync(join(contentDir, 'exam/hsk2/A/manifest.json'), 'utf8'));

describe('synthesizeExam', () => {
  it('genera un clip por entrada de la línea de tiempo en exam/hsk2/<forma>, provisional con edge', async () => {
    await run(fakeProvider());
    expect(manifest()).toMatchObject({ kind: 'neural', owner: 'exam/hsk2/A', license: EDGE_LICENSE, provisional: true });
    expect(manifest().clips.map(clip => clip.key)).toEqual([
      'opening', 'L1-instruction', 'L1-start', 'L1-q01', 'L2-instruction', 'L2-start',
      'L3-instruction', 'L3-start', 'L3-q01', 'closing',
    ]);
  });

  it('un diálogo de L3 se compone con la voz de cada speaker y la pausa antes de la pregunta', async () => {
    await run(fakeProvider());
    expect(concatenated['L3-q01.m4a']).toEqual([
      `audio:${EXAM_VOICES.F}:你去哪儿？`,
      'silence:400',
      `audio:${EXAM_VOICES.M}:去学校。`,
      `silence:${structure.sections[0].parts[2].question_gap_ms}`,
      `audio:${EXAM_VOICES.F}:男的去哪儿？`,
    ]);
    expect(manifest().clips.find(clip => clip.key === 'L3-q01').voice).toBe(`${EXAM_VOICES.F}+${EXAM_VOICES.M}`);
  });

  it('las instrucciones suenan con la tercera voz', async () => {
    const provider = fakeProvider();
    await run(provider);
    expect(provider.requests.find(request => request.text === '开始。').voice).toBe(EXAM_VOICES.instruction);
  });

  it('una segunda ejecución solo regenera el clip cuyo texto cambió', async () => {
    await run(fakeProvider());
    const provider = fakeProvider();
    await run(provider, { form: form('我喝水。') });
    expect(provider.requests.map(request => request.text)).toEqual(['我喝水。']);
  });
});
