import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExamForm, ExamGroup, ExamLine, ExamStructure, Printed } from './types.ts';
import { validateExamForm, validateExamGroup, type ExamValidationContext } from './validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const structure = JSON.parse(
  readFileSync(resolve(root, 'server/db/seeds/exam-structure.json'), 'utf8'),
) as ExamStructure;

const WORDS_1_2 = [
  '我', '你', '他', '她', '是', '好', '吗', '呢', '的', '了', '不', '很', '在', '去', '喝', '茶',
  '学生', '老师', '你好', '写字', '说话', '时间', '妈妈', '吃饭', '什么', '这', '那', '哪儿',
  '水', '想', '有', '没有', '家', '朋友', '学校', '今天', '明天', '一', '个', '书', '看',
];

const ctx: ExamValidationContext = {
  dictionary: [
    ...WORDS_1_2.map(hanzi => ({ hanzi, hsk_level: 1 })),
    { hanzi: '经验', hsk_level: 3 },
  ],
  handwriting: new Set(['学', '好', '你', '我', '是', '水', '茶', '有', '家', '书']),
  decomposition: {
    你: { decomposition: '⿰亻尔', matches: [[0], [0], [1], [1], [1], [1], [1]] },
    字: { decomposition: '⿱宀子', matches: [[0], [0], [0], [1], [1], [1]] },
    说: { decomposition: '⿰讠兑', matches: [[0], [0], [1], [1], [1], [1], [1], [1], [1]] },
    时: { decomposition: '⿰日寸', matches: [[0], [0], [0], [0], [1], [1], [1]] },
    妈: { decomposition: '⿰女马', matches: [[0], [0], [0], [1], [1], [1]] },
    吃: { decomposition: '⿰口乞', matches: [[0], [0], [0], [1], [1], [1]] },
    学: { decomposition: '⿱⺍冖子', matches: [[0], [0], [0], [1], [1], [2], [2], [2]] },
    朋: { decomposition: '⿰月月', matches: [[0], [0], [0], [0], [1], [1], [1], [1]] },
  },
  structure,
  images: new Set(Array.from({ length: 40 }, (_, index) => `img-${index}`)),
};

const p = (zh: string, pinyin = 'pīnyīn'): Printed => ({ zh, pinyin });
const line = (zh: string, speaker: 'F' | 'M' = 'F'): ExamLine => ({ zh, pinyin: 'pīnyīn', speaker });
const images = (from: number, count: number) => Array.from({ length: count }, (_, index) => `img-${from + index}`);

function formA(): ExamForm {
  const groups: Array<ExamGroup & { slug: string }> = [
    {
      slug: 'a-l1',
      part: 'L1',
      items: ([0, 1, 2, 0, 1] as const).map((answer, index) => ({
        audio: [line('我是学生。')],
        images: images(index * 3, 3) as [string, string, string],
        answer,
      })),
    },
    {
      slug: 'a-l2-1',
      part: 'L2',
      images: images(15, 6),
      example: { stimulus: [line('你喝茶吗？', 'M'), line('我不喝茶。')], answer: 0 },
      items: [1, 2, 3, 4, 5].map(answer => ({ audio: [line('你去哪儿？', 'M'), line('我去学校。')], answer })),
    },
    {
      slug: 'a-l2-2',
      part: 'L2',
      images: images(21, 5),
      items: [0, 1, 2, 3, 4].map(answer => ({ audio: [line('他是老师吗？', 'M'), line('是。')], answer })),
    },
    {
      slug: 'a-l3',
      part: 'L3',
      items: ([0, 1, 2, 0, 1, 2, 0, 1, 2, 1] as const).map(answer => ({
        audio: [line('你明天去学校吗？', 'M'), line('不去，我在家。')],
        question: line('她明天在哪儿？', 'M'),
        options: [p('家'), p('学校'), p('朋友家')],
        answer,
      })),
    },
    {
      slug: 'a-r1',
      part: 'R1',
      images: images(26, 6),
      example: { stimulus: p('我在看书。'), answer: 0 },
      items: [1, 2, 3, 4, 5].map(answer => ({ text: p('她想喝水。'), answer })),
    },
    {
      slug: 'a-r2',
      part: 'R2',
      bank: [p('茶'), p('书'), p('水'), p('学校'), p('朋友'), p('老师')],
      example: { text: p('我想喝（ ）。'), answer: 0 },
      items: [1, 2, 3, 4, 5].map(answer => ({ text: p('这是我的（ ）。'), answer })),
    },
    {
      slug: 'a-r3-1',
      part: 'R3',
      bank: [p('我很好。'), p('不是。'), p('在家。'), p('没有。'), p('好的。'), p('明天。')],
      example: { text: p('你好吗？'), answer: 0 },
      items: [1, 2, 3, 4, 5].map(answer => ({ text: p('他是老师吗？'), answer })),
    },
    {
      slug: 'a-r3-2',
      part: 'R3',
      bank: [p('有。'), p('很好。'), p('在学校。'), p('是我。'), p('不想。')],
      items: [0, 1, 2, 3, 4].map(answer => ({ text: p('你有书吗？'), answer })),
    },
    {
      slug: 'a-r4',
      part: 'R4',
      items: ([0, 1, 2, 0, 1] as const).map(answer => ({
        passage: p('今天我不去学校，我在家看书。'),
        question: p('★ 他今天：'),
        options: [p('在家'), p('去学校'), p('喝茶')],
        answer,
      })),
    },
    {
      slug: 'a-w1',
      part: 'W1',
      bank: ['亻', '子', '讠', '日', '女', '口'],
      example: { word: p('你好'), target_index: 0, answer: 0 },
      items: [
        { word: p('写字'), target_index: 1, answer: 1 },
        { word: p('说话'), target_index: 0, answer: 2 },
        { word: p('时间'), target_index: 0, answer: 3 },
        { word: p('妈妈'), target_index: 0, answer: 4 },
        { word: p('吃饭'), target_index: 0, answer: 5 },
      ],
    },
    {
      slug: 'a-w2',
      part: 'W2',
      items: [
        { sentence: p('我是（ ）生。'), answer: '学' },
        { sentence: p('你（ ）吗？'), answer: '好' },
        { sentence: p('我想喝（ ）。'), answer: '水' },
        { sentence: p('我（ ）一个朋友。'), answer: '有' },
        { sentence: p('这是我的（ ）。'), answer: '书' },
      ],
    },
  ];
  return { code: 'A', level: 2, groups };
}

const group = <P extends ExamGroup['part']>(form: ExamForm, part: P, index = 0) =>
  form.groups.filter(entry => entry.part === part)[index] as ExamGroup & { part: P; slug: string };
const kinds = (issues: Array<{ kind: string }>) => issues.map(issue => issue.kind);

describe('validateExamGroup', () => {
  it('L1 con 2 imágenes en una pregunta → wrong_count', () => {
    const l1 = group(formA(), 'L1');
    (l1.items[0] as { images: string[] }).images = ['img-0', 'img-1'];
    expect(kinds(validateExamGroup(l1, ctx))).toContain('wrong_count');
  });

  it('grupo 1 de L2 con 5 imágenes cuando group_shapes pide 6 → wrong_count', () => {
    const l2 = group(formA(), 'L2', 0);
    l2.images = l2.images.slice(0, 5);
    expect(kinds(validateExamGroup(l2, ctx))).toContain('wrong_count');
  });

  it('R2 con dos frases que responden con la palabra 3 → answer_reused', () => {
    const r2 = group(formA(), 'R2');
    r2.items[0].answer = 3;
    expect(validateExamGroup(r2, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'answer_reused', question_index: 2 }),
    );
  });

  it('R2 sin （ ） → blank_missing', () => {
    const r2 = group(formA(), 'R2');
    r2.items[1].text = p('这是我的书。');
    expect(validateExamGroup(r2, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'blank_missing', question_index: 1 }),
    );
  });

  it('L3 con una palabra HSK 3 → unknown_vocabulary', () => {
    const l3 = group(formA(), 'L3');
    l3.items[4].audio = [line('你有经验吗？', 'M'), line('没有。')];
    expect(validateExamGroup(l3, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'unknown_vocabulary', question_index: 4, detail: '经' }),
    );
  });

  it('W1 con 学 y componente 日 → component_not_in_character', () => {
    const w1 = group(formA(), 'W1');
    w1.items[0] = { word: p('学生'), target_index: 0, answer: 3 };
    expect(validateExamGroup(w1, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'component_not_in_character', question_index: 0 }),
    );
  });

  it('W1 cuyo componente aparece dos veces en el carácter → component_ambiguous', () => {
    const w1 = group(formA(), 'W1');
    w1.bank[4] = '月';
    w1.items[3] = { word: p('朋友'), target_index: 0, answer: 4 };
    const dictionary = [...ctx.dictionary, { hanzi: '朋友', hsk_level: 1 }];
    expect(validateExamGroup(w1, { ...ctx, dictionary })).toContainEqual(
      expect.objectContaining({ kind: 'component_ambiguous', question_index: 3 }),
    );
  });

  it("W2 con answer: '学习' → handwrite_not_single", () => {
    const w2 = group(formA(), 'W2');
    w2.items[0].answer = '学习';
    expect(kinds(validateExamGroup(w2, ctx))).toContain('handwrite_not_single');
  });

  it('W2 con un carácter fuera de handwriting → handwrite_not_allowed', () => {
    const w2 = group(formA(), 'W2');
    w2.items[2] = { sentence: p('我们（ ）茶。'), answer: '喝' };
    expect(validateExamGroup(w2, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'handwrite_not_allowed', question_index: 2, detail: '喝' }),
    );
  });

  it('texto impreso sin pinyin → missing_pinyin', () => {
    const r4 = group(formA(), 'R4');
    r4.items[0].options[1] = p('去学校', ' ');
    expect(kinds(validateExamGroup(r4, ctx))).toContain('missing_pinyin');
  });

  it('imagen sin manifiesto → image_unknown', () => {
    const r1 = group(formA(), 'R1');
    r1.images[2] = 'img-999';
    expect(validateExamGroup(r1, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'image_unknown', detail: 'img-999' }),
    );
  });

  it('respuesta fuera del banco → answer_out_of_range', () => {
    const r3 = group(formA(), 'R3', 1);
    r3.items[4].answer = 5;
    expect(kinds(validateExamGroup(r3, ctx))).toContain('answer_out_of_range');
  });
});

describe('validateExamForm', () => {
  it('forma con 4 de 5 respuestas A en R4 → answers_unbalanced', () => {
    const form = formA();
    const r4 = group(form, 'R4');
    ([0, 0, 0, 0, 1] as const).forEach((answer, index) => {
      r4.items[index].answer = answer;
    });
    expect(validateExamForm(form, ctx)).toContainEqual(
      expect.objectContaining({ kind: 'answers_unbalanced', group: 'a-r4' }),
    );
  });

  it('forma a la que le falta una pregunta de L3 → wrong_count', () => {
    const form = formA();
    group(form, 'L3').items.pop();
    expect(kinds(validateExamForm(form, ctx))).toContain('wrong_count');
  });

  it('forma A completa → []', () => {
    expect(validateExamForm(formA(), ctx)).toEqual([]);
  });
});
