import { activeEntryAt, EXAM_MINUTES, listeningEndMs, mediaUrls, questionNumbers } from './examModel';

const structure = require('../../../../server/db/seeds/exam-structure.json');

const form: any = {
  level: 2,
  code: 'A',
  content: {
    groups: [
      { slug: 'a-l1', part: 'L1', items: [{}, {}] },
      { slug: 'a-r2', part: 'R2', bank: [], items: [{}, {}, {}] },
      { slug: 'a-w2', part: 'W2', items: [{}] },
    ],
  },
  timeline: [
    { at_ms: 0, kind: 'instruction', part: 'L1', question_index: -1, clip: 'opening', play: 1 },
    { at_ms: 5000, kind: 'item', part: 'L1', question_index: 0, clip: 'L1-q01', play: 1 },
    { at_ms: 9000, kind: 'item', part: 'L1', question_index: 1, clip: 'L1-q02', play: 1 },
  ],
  media: {
    audio: {
      opening: { url: 'https://x/a.m4a', duration_ms: 4000 },
      'L1-q01': { url: 'https://x/b.m4a', duration_ms: 3000 },
      'L1-q02': { url: 'https://x/c.m4a', duration_ms: 2500 },
    },
    images: { i1: { url: 'https://x/i1.webp' } },
    characters: {},
  },
};

describe('examModel', () => {
  it('numera las preguntas de la forma en orden, como en la hoja de respuestas', () => {
    expect(questionNumbers(form)).toEqual({ 'a-l1:0': 1, 'a-l1:1': 2, 'a-r2:0': 3, 'a-r2:1': 4, 'a-r2:2': 5, 'a-w2:0': 6 });
  });

  it('la entrada activa de 听力 la decide el reloj', () => {
    expect(activeEntryAt(form.timeline, 0)).toBe(0);
    expect(activeEntryAt(form.timeline, 4999)).toBe(0);
    expect(activeEntryAt(form.timeline, 9000)).toBe(2);
    expect(activeEntryAt(form.timeline, -1)).toBe(-1);
  });

  it('听力 acaba cuando termina el último clip', () => {
    expect(listeningEndMs(form)).toBe(11500);
  });

  it('descarga cada medio una vez: audio e imágenes', () => {
    expect(mediaUrls(form).sort()).toEqual(['https://x/a.m4a', 'https://x/b.m4a', 'https://x/c.m4a', 'https://x/i1.webp']);
  });

  it('los minutos de cada fase son los de exam-structure.json', () => {
    expect(EXAM_MINUTES.answer_sheet).toBe(structure.answer_sheet_minutes);
    expect(EXAM_MINUTES.reading).toBe(structure.sections.find((s: any) => s.code === 'reading').minutes);
    expect(EXAM_MINUTES.writing).toBe(structure.sections.find((s: any) => s.code === 'writing').minutes);
  });
});
