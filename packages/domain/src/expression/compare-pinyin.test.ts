// packages/domain/src/expression/compare-pinyin.test.ts
import { comparePinyin, parsePinyinSyllables } from './compare-pinyin';

describe('parsePinyinSyllables', () => {
  it('lee pinyin con números', () => {
    expect(parsePinyinSyllables('xue2 sheng5')).toEqual(['xue2', 'sheng5']);
  });

  it('lee pinyin con diacríticos y parte las palabras en sílabas', () => {
    expect(parsePinyinSyllables('wǒ shì xuésheng')).toEqual(['wo3', 'shi4', 'xue2', 'sheng5']);
    expect(parsePinyinSyllables('chūzūchē')).toEqual(['chu1', 'zu1', 'che1']);
  });

  it('respeta el apóstrofo como frontera de sílaba', () => {
    expect(parsePinyinSyllables("Tiān'ānmén")).toEqual(['tian1', 'an1', 'men2']);
  });

  it('trata la ü y sus grafías como una sola letra', () => {
    expect(parsePinyinSyllables('nǚ lv4 nu:3')).toEqual(['nv3', 'lv4', 'nv3']);
  });

  it('toma el 0 de algunos conversores como tono neutro', () => {
    expect(parsePinyinSyllables('ba4 ba0')).toEqual(['ba4', 'ba5']);
  });

  it('no cuenta la r final del erhua como sílaba', () => {
    // El reconocedor a menudo escribe 一点 por 一点儿; el erhua no se puntúa.
    expect(parsePinyinSyllables('yìdiǎnr')).toEqual(['yi4', 'dian3']);
  });

  it('rechaza lo que no es pinyin', () => {
    expect(() => parsePinyinSyllables('hello')).toThrow(/pinyin/);
  });
});

describe('comparePinyin', () => {
  it('da por buena una sílaba homófona: se compara el pinyin, no el hanzi', () => {
    // El reconocedor puede devolver 事 donde se dijo 是: misma sílaba, mismo tono.
    const result = comparePinyin('shi4', 'shi4');

    expect(result.syllables).toEqual([{ expected: 'shi4', heard: 'shi4', ok: true }]);
    expect(result.intelligible).toBe(true);
  });

  it('no da por buena la misma sílaba con otro tono', () => {
    const result = comparePinyin('ma3', 'ma1');

    expect(result.syllables).toEqual([{ expected: 'ma3', heard: 'ma1', ok: false }]);
    expect(result.intelligible).toBe(false);
  });

  it('tolera cualquier tono donde el diccionario marca tono neutro', () => {
    const result = comparePinyin('xue2 sheng5', 'xue2 sheng1');

    expect(result.syllables.map((s) => s.ok)).toEqual([true, true]);
    expect(result.intelligible).toBe(true);
  });

  it('no tolera un tono neutro oído donde el diccionario marca tono pleno', () => {
    expect(comparePinyin('ma1', 'ma5').syllables[0].ok).toBe(false);
  });

  it('una frase de cinco sílabas con cuatro bien se entiende', () => {
    expect(comparePinyin('wo3 xiang3 qu4 xue2 xiao4', 'wo3 xiang1 qu4 xue2 xiao4').intelligible).toBe(true);
  });

  it('una frase de cinco sílabas con tres bien no se entiende', () => {
    expect(comparePinyin('wo3 xiang3 qu4 xue2 xiao4', 'wo3 xiang1 qu4 xue1 xiao4').intelligible).toBe(false);
  });

  it('exige todas las sílabas tónicas de la palabra objetivo aunque la frase pase del 80 %', () => {
    const result = comparePinyin('wo3 xiang3 qu4 xue2 xiao4', 'wo3 xiang3 qu4 xue1 xiao4', {
      targetWord: 'xuéxiào',
    });

    expect(result.intelligible).toBe(false);
  });

  it('no exige el tono de la sílaba neutra de la palabra objetivo', () => {
    const result = comparePinyin('ta1 shi4 wo3 ba4 ba5', 'ta1 shi4 wo3 ba4 ba1', { targetWord: 'bàba' });

    expect(result.intelligible).toBe(true);
  });

  it('falla si la palabra objetivo no está en la frase esperada', () => {
    expect(() => comparePinyin('wo3 hao3', 'wo3 hao3', { targetWord: 'nǐ' })).toThrow(/objetivo/);
  });

  it('compara texto con diacríticos contra la salida numérica del conversor', () => {
    const result = comparePinyin('wǒ shì xuésheng', 'wo3 shi4 xue2 sheng5');

    expect(result.intelligible).toBe(true);
  });

  it('alinea por sílaba: una sílaba que no se oyó no desplaza a las demás', () => {
    const result = comparePinyin('wo3 shi4 xue2 sheng5', 'wo3 xue2 sheng5');

    expect(result.syllables).toEqual([
      { expected: 'wo3', heard: 'wo3', ok: true },
      { expected: 'shi4', heard: null, ok: false },
      { expected: 'xue2', heard: 'xue2', ok: true },
      { expected: 'sheng5', heard: 'sheng5', ok: true },
    ]);
  });

  it('empareja una sílaba mal dicha con lo que se oyó en su hueco', () => {
    const result = comparePinyin('wo3 si4 ge4', 'wo3 shi4 ge4');

    expect(result.syllables[1]).toEqual({ expected: 'si4', heard: 'shi4', ok: false });
  });

  it('acepta el cambio de tono de 不 y 一', () => {
    // El corpus marca 不客气 como «bú kèqi»; el conversor puede dar bu4.
    expect(comparePinyin('bú kèqi', 'bu4 ke4 qi5').intelligible).toBe(true);
    expect(comparePinyin('yí gè', 'yi1 ge4').syllables[0].ok).toBe(true);
  });

  it('sin nada oído no se entiende', () => {
    const result = comparePinyin('ni3 hao3', '');

    expect(result.syllables).toEqual([
      { expected: 'ni3', heard: null, ok: false },
      { expected: 'hao3', heard: null, ok: false },
    ]);
    expect(result.intelligible).toBe(false);
  });
});
