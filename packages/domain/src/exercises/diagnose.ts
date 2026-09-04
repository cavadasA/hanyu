import type { EvaluationDetail } from './evaluate.ts';

const ORDINAL = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta'];

export function diagnose(detail: EvaluationDetail): string {
  switch (detail.kind) {
    case 'reorder': {
      const index = detail.first_wrong_index ?? 0;
      const position = ORDINAL[index] ?? `posición ${index + 1}`;
      return `El orden se tuerce en la ${position} pieza.`;
    }
    case 'matching': {
      const pairs = detail.wrong_pairs ?? [
        ...(detail.wrong ?? []),
        ...(detail.missing ?? []),
      ];
      const count = pairs.length;
      return `${count} ${count === 1 ? 'pareja' : 'parejas'} sin emparejar bien${count ? `: ${pairs.join('、')}` : ''}.`;
    }
    case 'dictation':
      if (detail.syllables_match && !detail.tones_match) {
        return 'Las sílabas están bien; falla el tono.';
      }
      return 'La sílaba no es la que suena.';
    default:
      return 'No es la respuesta correcta.';
  }
}
