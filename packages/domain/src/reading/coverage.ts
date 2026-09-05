export interface CoverageToken {
  word_id: number | null;
  type: 'word' | 'unknown' | 'punctuation';
  form?: string;
}

export interface Coverage {
  ratio: number;
  known_count: number;
  unknown_count: number;
}

export function coverageOf(tokens: readonly CoverageToken[], known: ReadonlySet<number>): Coverage {
  const forms = new Set<number>();
  const unknownForms = new Set<string>();

  for (const token of tokens) {
    if (token.type === 'punctuation') continue;

    if (token.word_id === null) {
      unknownForms.add(token.form ?? token.type);
      continue;
    }

    forms.add(token.word_id);
  }

  const total = forms.size + unknownForms.size;
  if (total === 0) {
    return { ratio: 0, known_count: 0, unknown_count: 0 };
  }

  let knownCount = 0;
  for (const id of forms) {
    if (known.has(id)) knownCount += 1;
  }

  return {
    ratio: knownCount / total,
    known_count: knownCount,
    unknown_count: total - knownCount,
  };
}
