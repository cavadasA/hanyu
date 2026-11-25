import { incompleteCharacterSvg, missingComponentIndex } from './components.ts';

// Trazos de prueba con coordenadas distinguibles: los de 亻 a la izquierda (x < 300),
// los de 十 a la derecha (x > 500). Mismo sistema que hanzi-writer-data (1024, y hacia arriba).
const LEFT = ['M 200 800 Q 150 600 100 500 Z', 'M 220 600 L 230 100 Z'];
const RIGHT = ['M 520 500 L 900 500 L 900 460 Z', 'M 700 820 L 720 60 L 680 60 Z'];
const SHI = { decomposition: '⿰亻十', matches: [[0], [0], [1], [1]] };

describe('incompleteCharacterSvg', () => {
  it("('什', '十') no contiene ningún trazo de 十 y sí los de 亻", () => {
    const svg = incompleteCharacterSvg('什', '十', [...LEFT, ...RIGHT], SHI);
    for (const stroke of LEFT) expect(svg).toContain(stroke);
    for (const stroke of RIGHT) expect(svg).not.toContain(stroke);
  });

  it('deja un recuadro punteado donde estaba el componente', () => {
    const svg = incompleteCharacterSvg('什', '十', [...LEFT, ...RIGHT], SHI);
    const rect = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*stroke-dasharray/.exec(svg);
    expect(rect).not.toBeNull();
    const [x, y, width, height] = rect!.slice(1).map(Number);
    // 十 ocupa x 520–900 e y 60–820; en pantalla y = 900 − y → 80–840.
    expect(x).toBeLessThanOrEqual(520);
    expect(x + width).toBeGreaterThanOrEqual(900);
    expect(y).toBeLessThanOrEqual(80);
    expect(y + height).toBeGreaterThanOrEqual(840);
  });

  it('quitar el otro componente deja los trazos contrarios', () => {
    const svg = incompleteCharacterSvg('什', '亻', [...LEFT, ...RIGHT], SHI);
    for (const stroke of RIGHT) expect(svg).toContain(stroke);
    for (const stroke of LEFT) expect(svg).not.toContain(stroke);
  });

  it('un componente anidado o ausente lanza', () => {
    expect(() => incompleteCharacterSvg('什', '口', [...LEFT, ...RIGHT], SHI)).toThrow(/口/);
  });
});

describe('missingComponentIndex', () => {
  it('encuentra el hijo directo de la descripción IDS, también con tres hijos y anidados', () => {
    expect(missingComponentIndex('⿰亻十', '十')).toBe(1);
    expect(missingComponentIndex('⿳⺍冖子', '子')).toBe(2);
    expect(missingComponentIndex('⿰讠⿱五口', '讠')).toBe(0);
    expect(missingComponentIndex('⿰讠⿱五口', '口')).toBe(-1);
  });
});
