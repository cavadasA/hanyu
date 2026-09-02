const TONE_MARKS = /[̀́̄̌]/g;
const TONE_DIGITS = /[0-5]/g;
const SYLLABLE_SEPARATORS = /[\s'’·-]/g;

export function normalizePinyin(input: string): string {
  return input
    .normalize('NFD')
    .replace(TONE_MARKS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(TONE_DIGITS, '')
    .replace(SYLLABLE_SEPARATORS, '');
}
