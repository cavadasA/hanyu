// Cada lectura del catálogo mide también comprensión inferencial: una pregunta
// cuya respuesta se deduce combinando frases, al final de las literales.
import { describe, expect, it } from 'vitest';
import { loadReadings, validateCatalog } from './build-readings.js';

describe('catálogo de lecturas: preguntas inferenciales', () => {
  it('con --complete, ninguna lectura tiene problemas en sus preguntas', () => {
    const kinds = ['no_inferential', 'inference_needs_two', 'inference_is_literal', 'rationale_missing', 'inference_not_last', 'missing_evidence', 'duplicate_options', 'answers_not_spread'];
    const problems = validateCatalog({ complete: true }).flatMap(entry =>
      entry.issues
        .filter(issue => kinds.includes(issue.kind))
        .map(issue => `${entry.slug}: ${issue.kind}${issue.question_index === undefined ? '' : ` (pregunta ${issue.question_index + 1})`}${issue.detail ? ` ${issue.detail}` : ''}`),
    );
    expect(problems).toEqual([]);
  });

  it('cada lectura conserva sus preguntas literales y añade exactamente una inferencial al final', () => {
    const shapes = loadReadings().map(reading => ({
      slug: reading.slug,
      kinds: reading.questions.map(question => question.kind ?? 'literal').join(','),
    }));
    expect(shapes.filter(shape => shape.kinds !== 'literal,literal,literal,inferential')).toEqual([]);
  });
});
