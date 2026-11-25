import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildExam, characterImages, questionSignatures } from './build-exam.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const decomposition = JSON.parse(readFileSync(join(rootDir, 'server/db/seeds/hanzi-decomposition.json'), 'utf8'));

const p = (zh, pinyin = 'pīnyīn') => ({ zh, pinyin });
const line = (zh, speaker = 'F') => ({ ...p(zh), speaker });

let examDir;
let imagesDir;
beforeEach(() => {
  examDir = mkdtempSync(join(tmpdir(), 'hanyu-build-exam-'));
  imagesDir = mkdtempSync(join(tmpdir(), 'hanyu-build-exam-img-'));
  writeFileSync(join(examDir, 'instructions.json'), '{}');
});
afterEach(() => {
  rmSync(examDir, { recursive: true, force: true });
  rmSync(imagesDir, { recursive: true, force: true });
});

function writeForm(code, groups) {
  const dir = join(examDir, 'hsk2', code);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(examDir, 'hsk2', 'instructions.json'), JSON.stringify({
    opening: p('开始'), closing: p('结束'),
    parts: Object.fromEntries(['L1', 'L2', 'L3'].map(part => [part, { instruction: p('部分'), start: p('开始') }])),
  }));
  groups.forEach((group, index) => {
    writeFileSync(join(dir, `${group.part}-${String(index + 1).padStart(2, '0')}.json`), JSON.stringify(group));
  });
}

function writeImages(code, images) {
  const dir = join(imagesDir, 'exam', 'hsk2', code);
  mkdirSync(dir, { recursive: true });
  for (const image of images) writeFileSync(join(dir, image.file), Buffer.alloc(image.bytes ?? 1000));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    owner: `exam/hsk2/${code}`,
    images: images.map(({ bytes, ...image }) => image),
  }));
}

const r4 = slug => ({
  slug,
  part: 'R4',
  items: [{ passage: p('我在家看书。'), question: p('★ 他在：'), options: [p('家'), p('学校'), p('商店')], answer: 0 }],
});
const run = () => buildExam({ examDir, imagesDir, mediaIndex: {} });

describe('buildExam', () => {
  it('una imagen sin licencia en el manifiesto de la forma → license_missing con la forma', async () => {
    writeForm('A', [r4('a-r4')]);
    writeImages('A', [{ key: 'x', file: 'x.webp', depicts_es: 'una casa', source: 'svg-propio', license: '' }]);
    const { issues } = await run();
    expect(issues).toContainEqual(expect.objectContaining({ form: 'A', kind: 'license_missing', key: 'x' }));
  });

  it('la misma pregunta en dos formas → question_repeated', async () => {
    writeForm('A', [r4('a-r4')]);
    writeForm('B', [r4('b-r4')]);
    const { issues } = await run();
    expect(issues).toContainEqual(expect.objectContaining({ form: 'B', kind: 'question_repeated', group: 'b-r4' }));
  });

  it('una forma sin audio en media-index → audio_missing, sin línea de tiempo inventada', async () => {
    writeForm('A', [r4('a-r4')]);
    const { issues } = await run();
    expect(issues).toContainEqual(expect.objectContaining({ form: 'A', kind: 'audio_missing' }));
  });

  it('las formas incompletas no pasan: los recuentos de la estructura se exigen', async () => {
    writeForm('A', [r4('a-r4')]);
    const { issues } = await run();
    expect(issues.filter(issue => issue.kind === 'wrong_count').length).toBeGreaterThan(0);
  });

  it('el repositorio, tal como está, construye sin issues', async () => {
    const { issues } = await buildExam();
    expect(issues).toEqual([]);
  });

  it('hay 3 formas (A, B y C) de 60 preguntas cada una: 180, ninguna repetida', async () => {
    const { forms, issues } = await buildExam();
    expect(forms.map(form => form.code)).toEqual(['A', 'B', 'C']);
    for (const form of forms) {
      expect(form.content.groups.reduce((count, group) => count + group.items.length, 0)).toBe(60);
    }
    expect(issues.filter(issue => issue.kind === 'question_repeated')).toEqual([]);
  });
});

describe('questionSignatures', () => {
  it('firma cada pregunta por lo que se oye o se lee, no por sus opciones', () => {
    const l3 = {
      slug: 'a-l3',
      part: 'L3',
      items: [{ audio: [line('你去哪儿？'), line('去学校。', 'M')], question: line('他去哪儿？'), options: [p('a'), p('b'), p('c')], answer: 0 }],
    };
    expect(questionSignatures(l3)).toEqual(['L3|你去哪儿？/去学校。/他去哪儿？']);
  });
});

describe('characterImages', () => {
  it('dibuja cada pregunta de 书写 1 sin los trazos del componente que falta', () => {
    const w1 = {
      slug: 'a-w1',
      part: 'W1',
      bank: ['亻', '子', '讠', '日', '女', '口'],
      example: { word: p('你好'), target_index: 0, answer: 0 },
      items: [{ word: p('写字'), target_index: 1, answer: 1 }],
    };
    const images = characterImages({ groups: [w1] }, decomposition);
    expect(Object.keys(images)).toEqual(['a-w1:example', 'a-w1:0']);
    const zi = decomposition['字'];
    const ziChild = zi.strokes.filter((_, index) => zi.matches[index][0] === 1);
    for (const stroke of ziChild) expect(images['a-w1:0']).not.toContain(stroke);
    expect(images['a-w1:0']).toContain(zi.strokes[0]);
  });
});
