import { selectSenseSource } from './sense-overrides.js';

describe('selectSenseSource', () => {
  const first = { pinyin: 'pīnyīn' };
  const second = { pinyin: 'second' };

  it('no reutiliza otra fila cuando falta el sentido y no hay override', () => {
    expect(selectSenseSource([first], 2, null)).toBeNull();
  });

  it('usa la primera fila solo como soporte de un override explícito', () => {
    expect(selectSenseSource([first], 2, { meaning_en: 'curated' })).toBe(first);
  });

  it('elige directamente la fila que corresponde al sentido', () => {
    expect(selectSenseSource([first, second], 2, null)).toBe(second);
  });
});
