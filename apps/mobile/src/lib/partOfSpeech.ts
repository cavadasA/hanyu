// El corpus guarda la categoría gramatical en inglés («noun», «measure word»…).
// La interfaz va en español: se traduce al enseñarla, sin tocar los datos.
const PART_OF_SPEECH_ES: Record<string, string> = {
  noun: 'sustantivo',
  verb: 'verbo',
  adjective: 'adjetivo',
  adverb: 'adverbio',
  pronoun: 'pronombre',
  'measure word': 'clasificador',
  numeral: 'numeral',
  conjunction: 'conjunción',
  particle: 'partícula',
  preposition: 'preposición',
  suffix: 'sufijo',
  prefix: 'prefijo',
  interjection: 'interjección',
};

export function partOfSpeechLabel(pos: string): string {
  return PART_OF_SPEECH_ES[pos.trim().toLowerCase()] ?? pos;
}
