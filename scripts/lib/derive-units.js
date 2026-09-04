//
// Una unidad de estudio no hay que escribirla: el sílabo ya la trae. Cada punto
// de gramática enumera las palabras que introduce, y cruzarlas con el corpus da
// la unidad completa. Los fragmentos que no son palabras se conservan como
// patrones para no perder lo que la unidad enseña.

const DESCRIPTION_PREFIX = /^[^：:]*[：:]/;
const SENSE_SUFFIX = /([0-9])$/;

function splitItemRefs(item) {
  return String(item)
    .replace(DESCRIPTION_PREFIX, '')
    .split(/[、，,]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .map((fragment) => {
      const match = fragment.match(SENSE_SUFFIX);
      return {
        value: match ? fragment.slice(0, -1) : fragment,
        sense_index: match ? Number(match[1]) : null,
      };
    });
}

function selectWordCandidate(candidates, senseIndex, unitLevel) {
  if (candidates.length === 0) return undefined;

  if (senseIndex === null) {
    return candidates[0];
  }

  const exact = candidates.find((word) => word.sense_index === senseIndex);
  if (exact) return exact;
  if (candidates.length === 1) return candidates[0];

  return candidates.reduce((closest, candidate) => {
    const closestDistance = Math.abs(Number(closest.hsk_level ?? unitLevel) - unitLevel);
    const candidateDistance = Math.abs(Number(candidate.hsk_level ?? unitLevel) - unitLevel);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

export function splitItem(item) {
  return splitItemRefs(item).map((fragment) => fragment.value);
}

export function deriveUnits(grammar, words) {
  const byHanzi = new Map();
  for (const word of words) {
    const candidates = byHanzi.get(word.hanzi) ?? [];
    candidates.push(word);
    byHanzi.set(word.hanzi, candidates);
  }

  return grammar
    .map((point) => {
      const wordIds = [];
      const patterns = [];

      for (const item of point.items ?? []) {
        for (const fragment of splitItemRefs(item)) {
          const candidates = byHanzi.get(fragment.value) ?? [];
          const candidate = selectWordCandidate(candidates, fragment.sense_index, point.hsk_level);
          if (candidate) {
            if (!wordIds.includes(candidate.id)) wordIds.push(candidate.id);
          } else {
            patterns.push(fragment.value);
          }
        }
      }

      return {
        code: point.code,
        hsk_level: point.hsk_level,
        title: point.detail ?? point.title,
        group: point.group ?? null,
        category: point.category ?? null,
        word_ids: wordIds,
        patterns,
      };
    })
    .filter((unit) => unit.word_ids.length > 0 || unit.patterns.length > 0);
}
