//
// Una unidad de estudio no hay que escribirla: el sílabo ya la trae. Cada punto
// de gramática enumera las palabras que introduce, y cruzarlas con el corpus da
// la unidad completa. Los fragmentos que no son palabras se conservan como
// patrones para no perder lo que la unidad enseña.

const DESCRIPTION_PREFIX = /^[^：:]*[：:]/;
const SENSE_SUFFIX = /[0-9]$/;

export function splitItem(item) {
  return String(item)
    .replace(DESCRIPTION_PREFIX, '')
    .split(/[、，,]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .map((fragment) => fragment.replace(SENSE_SUFFIX, ''));
}

export function deriveUnits(grammar, words) {
  const byHanzi = new Map();
  for (const word of words) {
    if (!byHanzi.has(word.hanzi)) {
      byHanzi.set(word.hanzi, word.id);
    }
  }

  return grammar
    .map((point) => {
      const wordIds = [];
      const patterns = [];

      for (const item of point.items ?? []) {
        for (const fragment of splitItem(item)) {
          const id = byHanzi.get(fragment);
          if (id !== undefined) {
            if (!wordIds.includes(id)) wordIds.push(id);
          } else {
            patterns.push(fragment);
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
