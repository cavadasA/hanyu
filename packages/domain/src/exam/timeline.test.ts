import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExamGroup, ExamLine, ExamStructure, Printed } from './types.ts';
import { buildListeningTimeline, listeningClipKeys } from './timeline.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const structure = JSON.parse(
  readFileSync(resolve(root, 'server/db/seeds/exam-structure.json'), 'utf8'),
) as ExamStructure;

const line: ExamLine = { zh: '我是学生。', pinyin: 'wǒ shì xuésheng.', speaker: 'F' };
const p: Printed = { zh: '书', pinyin: 'shū' };
const three = ['a', 'b', 'c'] as [string, string, string];

const groups: ExamGroup[] = [
  {
    part: 'L1',
    example: { audio: [line], images: three, answer: 0 },
    items: Array.from({ length: 5 }, () => ({ audio: [line], images: three, answer: 0 as const })),
  },
  {
    part: 'L2',
    images: ['1', '2', '3', '4', '5', '6'],
    example: { stimulus: [line, line], answer: 0 },
    items: [1, 2, 3, 4, 5].map(answer => ({ audio: [line, line], answer })),
  },
  { part: 'L2', images: ['1', '2', '3', '4', '5'], items: [0, 1, 2, 3, 4].map(answer => ({ audio: [line, line], answer })) },
  {
    part: 'L3',
    example: { audio: [line, line], question: line, options: [p, p, p], answer: 0 },
    items: Array.from({ length: 10 }, () => ({ audio: [line, line], question: line, options: [p, p, p] as [Printed, Printed, Printed], answer: 0 as const })),
  },
  // Las partes de lectura no entran en la línea de tiempo.
  { part: 'R2', bank: [p, p, p, p, p, p], items: [] },
];

const allClips = (ms: number) => Object.fromEntries(listeningClipKeys(groups).map(key => [key, ms]));

describe('buildListeningTimeline', () => {
  it('L1 con plays: 2 produce 2 entradas por pregunta con el mismo clip', () => {
    const timeline = buildListeningTimeline(groups, structure, allClips(3000));
    const third = timeline.filter(entry => entry.part === 'L1' && entry.kind === 'item' && entry.question_index === 2);
    expect(third.map(entry => entry.play)).toEqual([1, 2]);
    expect(new Set(third.map(entry => entry.clip))).toEqual(new Set(['L1-q03']));
  });

  it('la primera entrada de L2 es su instrucción', () => {
    const timeline = buildListeningTimeline(groups, structure, allClips(3000));
    expect(timeline.find(entry => entry.part === 'L2')).toMatchObject({ kind: 'instruction', clip: 'L2-instruction' });
  });

  it('las dos reproducciones de un ítem van separadas por la pausa medida, y el ítem siguiente tras la pausa larga', () => {
    const timeline = buildListeningTimeline(groups, structure, allClips(3000));
    const l1 = timeline.filter(entry => entry.part === 'L1' && entry.kind === 'item');
    expect(l1[1].at_ms - l1[0].at_ms).toBe(3000 + 2200);
    expect(l1[2].at_ms - l1[1].at_ms).toBe(3000 + 8300);
  });

  it('cubre las 25 preguntas en orden, el grupo 2 de L2 sigue numerando desde 6', () => {
    const timeline = buildListeningTimeline(groups, structure, allClips(3000));
    const items = timeline.filter(entry => entry.kind === 'item' && entry.play === 1);
    expect(items).toHaveLength(25);
    expect(items.filter(entry => entry.part === 'L2').map(entry => entry.clip)).toContain('L2-q06');
    const times = timeline.map(entry => entry.at_ms);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('una forma que pasa de 18 minutos lanza', () => {
    expect(() => buildListeningTimeline(groups, structure, allClips(30000))).toThrow(/18 min/);
  });

  it('un clip sin duración lanza en vez de inventarla', () => {
    const clips = allClips(3000);
    delete clips['L3-q07'];
    expect(() => buildListeningTimeline(groups, structure, clips)).toThrow(/L3-q07/);
  });
});
