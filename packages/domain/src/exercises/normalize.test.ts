import { normalizeHanzi, normalizePinyinInput, normalizeText } from './normalize';

describe('normalizeText', () => {
  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(normalizeText('  Student ')).toBe('student');
    expect(normalizeText('to  pay   back')).toBe('to pay back');
  });

  it('ignora la puntuación final', () => {
    expect(normalizeText('student.')).toBe('student');
    expect(normalizeText('¿estudiante?')).toBe('estudiante');
  });

  it('conserva los espacios interiores, que sí distinguen significado', () => {
    expect(normalizeText('to pay back')).not.toBe(normalizeText('topayback'));
  });
});

describe('normalizeHanzi', () => {
  it('quita espacios y puntuación china y latina', () => {
    expect(normalizeHanzi('你好。')).toBe('你好');
    expect(normalizeHanzi('我 喜欢 喝茶')).toBe('我喜欢喝茶');
    expect(normalizeHanzi('他说：“好！”')).toBe('他说好');
  });

  it('deja igual un texto ya limpio', () => {
    expect(normalizeHanzi('我喜欢喝茶')).toBe('我喜欢喝茶');
  });
});

describe('normalizePinyinInput', () => {
  it('acepta las cuatro formas de teclear la misma lectura', () => {
    const expected = normalizePinyinInput('nǐ hǎo');

    expect(normalizePinyinInput('ni hao')).toBe(expected);
    expect(normalizePinyinInput('ni3 hao3')).toBe(expected);
    expect(normalizePinyinInput('nihao')).toBe(expected);
    expect(normalizePinyinInput('Nǐ Hǎo')).toBe(expected);
  });

  it('acepta v como sustituto de ü, que es como se teclea', () => {
    expect(normalizePinyinInput('lv')).toBe(normalizePinyinInput('lǜ'));
    expect(normalizePinyinInput('nv')).toBe(normalizePinyinInput('nǚ'));
  });

  it('ignora la puntuación', () => {
    expect(normalizePinyinInput('nǐ hǎo!')).toBe(normalizePinyinInput('ni hao'));
  });
});
