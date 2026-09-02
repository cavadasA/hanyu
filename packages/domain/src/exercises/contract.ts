// La respuesta de un ejercicio deja de ser `unknown`. Cada tipo declara su
// forma, y esa forma es la misma en el renderer, en el repositorio de datos y
// en el evaluador. Ésa es toda la corrección de los dos tipos que nunca podían
// acertar: cuando la forma es un tipo compartido, la discrepancia entre lo que
// la interfaz emite y lo que el evaluador espera deja de poder existir.

export type ExerciseKind =
  | 'fill_blank'
  | 'multiple_choice'
  | 'reorder'
  | 'dictation'
  | 'matching';

export type ExerciseAnswer =
  | { kind: 'fill_blank'; text: string }
  | { kind: 'multiple_choice'; option: string }
  | { kind: 'reorder'; tokens: string[] }
  | { kind: 'dictation'; text: string }
  | { kind: 'matching'; pairs: Record<string, string> };

export type ExerciseSolution =
  | { kind: 'fill_blank'; accept: string[] }
  | { kind: 'multiple_choice'; correct: string }
  | { kind: 'reorder'; order: string[] }
  | { kind: 'dictation'; hanzi: string; pinyin: string | null }
  | { kind: 'matching'; pairs: Record<string, string> };

export function emptyAnswer(kind: ExerciseKind): ExerciseAnswer {
  switch (kind) {
    case 'fill_blank':
      return { kind, text: '' };
    case 'multiple_choice':
      return { kind, option: '' };
    case 'reorder':
      return { kind, tokens: [] };
    case 'dictation':
      return { kind, text: '' };
    case 'matching':
      return { kind, pairs: {} };
  }
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }

  const text = value === null || value === undefined ? '' : String(value);
  return text ? [text] : [];
}

/**
 * Traduce lo que hay guardado en la base a una forma canónica. Es el único
 * sitio donde se tolera el desorden histórico del esquema: el prompt guarda
 * `words` en unas filas y `tokens` en otras, la respuesta vive unas veces en
 * `prompt.correct` y otras en la columna `answer`, y `matching` guarda el
 * literal inútil "matched" mientras los pares reales están en el prompt.
 */
export function toSolution(
  kind: ExerciseKind,
  prompt: any,
  storedAnswer: unknown,
): ExerciseSolution {
  switch (kind) {
    case 'fill_blank': {
      const accept = asStringList(prompt?.correct ?? prompt?.answer ?? storedAnswer);
      return { kind, accept };
    }

    case 'multiple_choice': {
      const correct = String(prompt?.correct ?? storedAnswer ?? '');
      return { kind, correct };
    }

    case 'reorder': {
      // correct_order es la fuente buena. La columna answer guarda la frase ya
      // unida, que no permite reconstruir la separación en piezas.
      const order = Array.isArray(prompt?.correct_order)
        ? prompt.correct_order.map(String)
        : asStringList(storedAnswer);
      return { kind, order };
    }

    case 'dictation': {
      const hanzi = String(prompt?.audio_text ?? storedAnswer ?? '');
      const pinyin = prompt?.accept_pinyin && prompt?.pinyin ? String(prompt.pinyin) : null;
      return { kind, hanzi, pinyin };
    }

    case 'matching': {
      const pairs: Record<string, string> = {};
      for (const pair of Array.isArray(prompt?.pairs) ? prompt.pairs : []) {
        const left = String(pair?.left ?? '');
        if (left) pairs[left] = String(pair?.right ?? '');
      }
      return { kind, pairs };
    }
  }
}
