import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sourceHash } from '../../packages/domain/src/media/manifest.ts';
import { EXAM_VOICES, examAudioExpectations, examClipSpecs, examOwner, LINE_GAP_MS } from './exam-audio.js';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const structure = JSON.parse(readFileSync(join(rootDir, 'server/db/seeds/exam-structure.json'), 'utf8'));

const p = (zh, pinyin = 'pīnyīn') => ({ zh, pinyin });
const line = (zh, speaker) => ({ zh, pinyin: `${zh}-py`, speaker });
const instructions = {
  opening: p('听力考试现在开始。'),
  closing: p('听力考试结束。'),
  parts: {
    L1: { instruction: p('第一部分。'), start: p('现在开始第一题。') },
    L2: { instruction: p('第二部分。'), start: p('现在开始第六题。') },
    L3: { instruction: p('第三部分。'), start: p('现在开始第十六题。') },
  },
};
const form = {
  code: 'A',
  level: 2,
  groups: [
    { slug: 'a-l1', part: 'L1', items: [{ audio: [line('我喝茶。', 'F')], images: ['a', 'b', 'c'], answer: 0 }] },
    {
      slug: 'a-l2',
      part: 'L2',
      images: ['1', '2', '3', '4', '5', '6'],
      example: { stimulus: [line('你好。', 'M'), line('你好！', 'F')], answer: 0 },
      items: [{ audio: [line('他是谁？', 'M'), line('我朋友。', 'F')], answer: 1 }],
    },
    {
      slug: 'a-l3',
      part: 'L3',
      items: [
        {
          audio: [line('你去哪儿？', 'F'), line('去学校。', 'M')],
          question: line('男的去哪儿？', 'F'),
          options: [p('学校'), p('家'), p('商店')],
          answer: 0,
        },
      ],
    },
    { slug: 'a-r2', part: 'R2', bank: [], items: [] },
  ],
};

describe('examClipSpecs', () => {
  const specs = Object.fromEntries(examClipSpecs(form, instructions, structure).map(spec => [spec.key, spec]));

  it('cada línea suena con la voz de su speaker y las instrucciones con la tercera voz', () => {
    expect(specs['L2-q01'].segments).toEqual([
      { zh: '他是谁？', pinyin: '他是谁？-py', voice: EXAM_VOICES.M },
      { silence_ms: LINE_GAP_MS },
      { zh: '我朋友。', pinyin: '我朋友。-py', voice: EXAM_VOICES.F },
    ]);
    expect(specs.opening.segments).toEqual([{ ...instructions.opening, voice: EXAM_VOICES.instruction }]);
    expect(new Set(Object.values(EXAM_VOICES)).size).toBe(3);
    for (const voice of Object.values(EXAM_VOICES)) expect(voice).toMatch(/^zh-CN-\w+Neural$/);
  });

  it('en L3 la pregunta va tras el diálogo con la pausa medida en la muestra', () => {
    const segments = specs['L3-q01'].segments;
    expect(segments.at(-2)).toEqual({ silence_ms: structure.sections[0].parts[2].question_gap_ms });
    expect(segments.at(-1)).toMatchObject({ zh: '男的去哪儿？', voice: EXAM_VOICES.F });
  });

  it('el ejemplo de L2 tiene su clip; L1 sin ejemplo no', () => {
    expect(specs['L2-example']).toBeDefined();
    expect(specs['L1-example']).toBeUndefined();
  });
});

describe('examAudioExpectations', () => {
  it('espera los clips de la línea de tiempo, con el hash del texto que se oye', () => {
    const expectations = examAudioExpectations(form, instructions, structure);
    expect(expectations.expectedKeys).toEqual([
      'opening', 'L1-instruction', 'L1-start', 'L1-q01',
      'L2-instruction', 'L2-example', 'L2-start', 'L2-q01',
      'L3-instruction', 'L3-start', 'L3-q01', 'closing',
    ]);
    expect(expectations.textByKey['L2-q01']).toBe('他是谁？\n我朋友。');
    expect(expectations.sourceHashByKey['L2-q01']).toBe(
      sourceHash({ zh: '他是谁？\n我朋友。', pinyin: '他是谁？-py\n我朋友。-py' }),
    );
  });

  it('el dueño del audio de una forma es exam/hsk<nivel>/<código>', () => {
    expect(examOwner(2, 'A')).toBe('exam/hsk2/A');
  });
});
