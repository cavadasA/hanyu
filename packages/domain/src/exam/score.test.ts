import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExamStructure } from './types.ts';
import { scoreExam } from './score.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const structure = JSON.parse(
  readFileSync(resolve(root, 'server/db/seeds/exam-structure.json'), 'utf8'),
) as ExamStructure;

describe('scoreExam', () => {
  it('todo bien: 100 % en cada sección y en total, sin escala oficial', () => {
    expect(scoreExam({ listening: 25, reading: 25, writing: 10 }, structure)).toEqual({
      sections: {
        listening: { correct: 25, total: 25, percent: 100 },
        reading: { correct: 25, total: 25, percent: 100 },
        writing: { correct: 10, total: 10, percent: 100 },
      },
      total_percent: 100,
      official: null,
    });
  });

  it('(20, 15, 5): 80, 60 y 50 %, y el total es round(40/60·100) = 67', () => {
    const result = scoreExam({ listening: 20, reading: 15, writing: 5 }, structure);
    expect(result.sections.listening.percent).toBe(80);
    expect(result.sections.reading.percent).toBe(60);
    expect(result.sections.writing.percent).toBe(50);
    expect(result.total_percent).toBe(67);
    expect(result.official).toBeNull();
  });

  it('nada bien: 0 % y nunca un denominador menor', () => {
    const result = scoreExam({ listening: 0, reading: 0, writing: 0 }, structure);
    expect(result.total_percent).toBe(0);
    expect(result.sections.reading.total).toBe(25);
  });

  it('cuando llegue la escala oficial se enchufa sin tocar código (cálculo lineal por sección)', () => {
    const scaled = { ...structure, official_scale: { per_section_max: 100, pass: 120 } };
    expect(scoreExam({ listening: 20, reading: 15, writing: 5 }, scaled).official).toEqual({
      score: 190,
      max: 300,
      passed: true,
    });
  });

  it('con la escala oficial, por debajo del aprobado → passed: false', () => {
    const scaled = { ...structure, official_scale: { per_section_max: 100, pass: 200 } };
    expect(scoreExam({ listening: 20, reading: 15, writing: 5 }, scaled).official).toEqual({
      score: 190,
      max: 300,
      passed: false,
    });
  });

  it('rechaza más aciertos que preguntas', () => {
    expect(() => scoreExam({ listening: 26, reading: 0, writing: 0 }, structure)).toThrow(/listening/);
  });
});
