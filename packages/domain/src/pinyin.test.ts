import { normalizePinyin } from './pinyin';

describe('normalizePinyin', () => {
  it('quita las marcas de tono', () => {
    expect(normalizePinyin('hái')).toBe('hai');
    expect(normalizePinyin('huán')).toBe('huan');
    expect(normalizePinyin('dì')).toBe('di');
    expect(normalizePinyin('zhǎng')).toBe('zhang');
  });

  it('conserva la diéresis de ü, que no es un tono', () => {
    expect(normalizePinyin('lǜ')).toBe('lü');
    expect(normalizePinyin('nǚ')).toBe('nü');
  });

  it('pasa a minúsculas para que la lectura de apellido compare igual que la común', () => {
    expect(normalizePinyin('Huán')).toBe('huan');
    expect(normalizePinyin('Xing1')).toBe('xing');
  });

  it('quita los dígitos de tono que usa el formato numérico', () => {
    expect(normalizePinyin('Xing1 qī tiān')).toBe('xingqitian');
    expect(normalizePinyin('nǎ r5')).toBe('nar');
  });

  it('quita los separadores de sílaba', () => {
    expect(normalizePinyin('nǐ hǎo')).toBe('nihao');
    expect(normalizePinyin('yíhuìr')).toBe('yihuir');
    expect(normalizePinyin("xī'ān")).toBe('xian');
  });
});
