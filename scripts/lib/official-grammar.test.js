import { parseGrammarOutline, loadOfficialGrammar } from './official-grammar.js';

const SAMPLE = `新版HSK考试大纲 · 语法 — HSK 2
========================================
1. 语素
  1.1 后缀
    - 面

2. 词类
  2.2 动词
    2.2.1 动词重叠
      - AA、A一A、A了A、ABAB
    2.2.2 能愿动词
      - 可能
  2.10 助词
    2.10.1 结构助词
      - 得、地

3. 短语
  3.2 功能类型
    3.2.1 名词性短语
      -
`;

describe('parseGrammarOutline', () => {
  const points = parseGrammarOutline(SAMPLE, 2);

  it('crea un punto por epígrafe con viñetas', () => {
    expect(points.map((p) => p.code)).toEqual([
      '1.1', '2.2.1', '2.2.2', '2.10.1', '3.2.1',
    ]);
  });

  it('conserva la jerarquía como grupo, categoría y detalle', () => {
    const reduplication = points.find((p) => p.code === '2.2.1');

    expect(reduplication.group).toBe('词类');
    expect(reduplication.category).toBe('动词');
    expect(reduplication.detail).toBe('动词重叠');
    expect(reduplication.items).toEqual(['AA、A一A、A了A、ABAB']);
  });

  it('usa el detalle como título y el nivel como dato', () => {
    const particles = points.find((p) => p.code === '2.10.1');

    expect(particles.title).toBe('结构助词');
    expect(particles.hsk_level).toBe(2);
    expect(particles.items).toEqual(['得、地']);
  });

  it('conserva los epígrafes sin ítems enumerados', () => {
    const empty = points.find((p) => p.code === '3.2.1');

    expect(empty.items).toEqual([]);
  });

  it('numera los puntos en el orden del documento', () => {
    expect(points.map((p) => p.order_idx)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('loadOfficialGrammar', () => {
  it('carga la gramática de los tres niveles', () => {
    expect(loadOfficialGrammar(1).length).toBeGreaterThan(20);
    expect(loadOfficialGrammar(2).length).toBeGreaterThan(40);
    expect(loadOfficialGrammar(3).length).toBeGreaterThan(40);
  });

  it('cubre las familias HSK 2 que el examen exige', () => {
    const hsk2 = loadOfficialGrammar(2);
    const text = JSON.stringify(hsk2);

    for (const family of [
      '动词重叠', '形容词重叠', '结构助词', '动态助词',
      '比较句', '“是……的”句', '选择复句', '转折复句',
      '因果复句', '紧缩复句', '结果补语', '趋向补语',
    ]) {
      expect(text).toContain(family);
    }
  });

  // «4.1» no tiene título en el sílabo, y el «Grammar focus» de las lecturas
  // mostraba sólo «4.1». Hereda el del epígrafe padre.
  it('a una sección hoja sin título le da el de su epígrafe padre', () => {
    for (const level of [2, 3]) {
      const fixedFormat = loadOfficialGrammar(level).find((point) => point.code === '4.1');
      expect(fixedFormat).toMatchObject({ hsk_level: level, group: '固定格式', title: '固定格式' });
    }
    const hsk2 = loadOfficialGrammar(2).find((point) => point.code === '4.1');
    expect(hsk2.items).toEqual(['还是……吧', '要/快要/就要……了', '都……了']);
  });

  it('ningún punto de gramática se queda sin título', () => {
    for (const level of [1, 2, 3]) {
      expect(loadOfficialGrammar(level).filter((point) => !point.title.trim())).toEqual([]);
    }
  });
});
