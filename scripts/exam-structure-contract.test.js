// Contrato de server/db/seeds/exam-structure.json: la estructura del HSK 2
// con formato 3.0, transcrita de la muestra oficial (docs/hsk/hsk2-3.0-estructura.md).
// Todo lo que viene después (validadores, línea de tiempo de 听力, resultado)
// lee estos números; si el fichero se aparta de la muestra, falla aquí.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const exam = JSON.parse(
  readFileSync(join(rootDir, 'server', 'db', 'seeds', 'exam-structure.json'), 'utf8'),
);

const ANSWER_KINDS = new Set(['image', 'text', 'bank', 'handwrite']);
const section = (code) => exam.sections.find((entry) => entry.code === code);
const questions = (code) =>
  section(code).parts.reduce((count, part) => count + part.question_count, 0);

describe('estructura del examen HSK 2 (formato 3.0)', () => {
  it('tiene las tres secciones de la portada de la muestra, con 25, 25 y 10 preguntas', () => {
    expect(exam.sections.map((entry) => entry.code)).toEqual(['listening', 'reading', 'writing']);
    expect(questions('listening')).toBe(25);
    expect(questions('reading')).toBe(25);
    expect(questions('writing')).toBe(10);
  });

  it('reparte las partes como la muestra: 5+10+10, 5+5+10+5 y 5+5', () => {
    const counts = (code) => section(code).parts.map((part) => part.question_count);
    expect(counts('listening')).toEqual([5, 10, 10]);
    expect(counts('reading')).toEqual([5, 5, 10, 5]);
    expect(counts('writing')).toEqual([5, 5]);
  });

  it('suma los tiempos de la portada: 17 + 3 + 25 + 10 + 5 = 60 minutos', () => {
    const minutes = exam.sections.reduce((count, entry) => count + entry.minutes, 0);
    expect(minutes + exam.answer_sheet_minutes + exam.personal_info_minutes).toBe(
      exam.total_minutes,
    );
    expect(exam.total_minutes).toBe(60);
  });

  it('no publica escala oficial mientras CTI no la dé', () => {
    expect(exam.official_scale).toBeNull();
  });

  it('cada grupo tiene opciones de sobra para sus preguntas', () => {
    for (const part of exam.sections.flatMap((entry) => entry.parts)) {
      expect(part.group_shapes.length).toBeGreaterThan(0);
      for (const shape of part.group_shapes) {
        expect(shape.options - shape.example_uses).toBeGreaterThanOrEqual(shape.questions);
      }
      const grouped = part.group_shapes.reduce((count, shape) => count + shape.questions, 0);
      expect(grouped).toBe(part.question_count);
    }
  });

  it('ninguna parte se responde con ✓/✗, y ninguna conserva our_type', () => {
    for (const part of exam.sections.flatMap((entry) => entry.parts)) {
      expect(ANSWER_KINDS.has(part.answer_kind)).toBe(true);
      expect(part).not.toHaveProperty('our_type');
    }
  });

  it('cada parte de 听力 declara cuántas veces suena y las pausas medidas', () => {
    for (const part of section('listening').parts) {
      expect(part.plays).toBe(2);
      expect(part.pause_between_plays_ms).toBeGreaterThan(0);
      expect(part.pause_after_item_ms).toBeGreaterThan(part.pause_between_plays_ms);
      expect(part.instruction_ms).toBeGreaterThan(0);
    }
  });
});
