import { partOfSpeechLabel } from './partOfSpeech';

describe('partOfSpeechLabel', () => {
  it.each([
    ['noun', 'sustantivo'],
    ['pronoun', 'pronombre'],
    ['measure word', 'clasificador'],
    ['Verb', 'verbo'],
  ])('traduce %s', (pos, label) => {
    expect(partOfSpeechLabel(pos)).toBe(label);
  });

  it('deja tal cual lo que no conoce, como las categorías ya escritas en chino', () => {
    expect(partOfSpeechLabel('数量')).toBe('数量');
  });
});
