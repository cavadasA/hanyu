// Pinyin como lista de letras con su tono. La alineación de frases y la
// comparación de acepciones trabajan sobre esta forma, que no depende de cómo
// se escribió la marca de tono (compuesta o descompuesta) ni de mayúsculas,
// espacios o apóstrofos.

export interface PinyinLetter {
  /** Letra base en minúsculas; la ü es «v». */
  base: string;
  /** 1–4, o 0 si la letra no lleva marca. */
  tone: number;
}

const TONE_MARKS: Record<string, number> = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };
const MARK_OF_TONE = ['', '̄', '́', '̌', '̀'];
const DIAERESIS = '̈';

export function pinyinLetters(text: string): PinyinLetter[] {
  const letters: PinyinLetter[] = [];
  for (const ch of text.toLowerCase().normalize('NFD')) {
    const last = letters[letters.length - 1];
    if (TONE_MARKS[ch] && last) last.tone = TONE_MARKS[ch];
    else if (ch === DIAERESIS && last) last.base = 'v';
    else if (/[a-z]/.test(ch)) letters.push({ base: ch, tone: 0 });
  }
  return letters;
}

/** Vuelve a escribir las letras como pinyin con marcas de tono, en NFC. */
export function renderPinyin(letters: readonly PinyinLetter[]): string {
  return letters
    .map(letter => (letter.base === 'v' ? `u${DIAERESIS}` : letter.base) + MARK_OF_TONE[letter.tone])
    .join('')
    .normalize('NFC');
}
