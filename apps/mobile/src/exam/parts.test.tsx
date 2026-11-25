import { fireEvent, render, screen } from '@testing-library/react-native';
import { BankGroup, ImageTriple, pickInGroup } from './parts';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff', background: '#fafafa' } }),
}));
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: () => <View testID="svg" /> };
});

const p = (zh: string) => ({ zh, pinyin: `${zh}-py` });
const local = (url: string) => `file:///${url}`;

describe('ImageTriple (L1)', () => {
  it('muestra 3 imágenes por pregunta y elegir una marca su letra', async () => {
    const onPick = jest.fn();
    const group: any = {
      slug: 'a-l1',
      part: 'L1',
      items: [{ images: ['i1', 'i2', 'i3'] }, { images: ['i4', 'i5', 'i6'] }],
    };
    const images = Object.fromEntries(['i1', 'i2', 'i3', 'i4', 'i5', 'i6'].map(key => [key, { url: key, path: key }]));
    await render(<ImageTriple group={group} numbers={{ 'a-l1:0': 1, 'a-l1:1': 2 }} images={images} localUri={local} picks={{}} onPick={onPick} />);
    expect(screen.getAllByLabelText(/^Pregunta 1, imagen [ABC]$/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Pregunta 2, imagen [ABC]$/)).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText('Pregunta 2, imagen C'));
    expect(onPick).toHaveBeenCalledWith('a-l1', 1, 2);
  });
});

describe('BankGroup (R3)', () => {
  const group: any = {
    slug: 'a-r3',
    part: 'R3',
    bank: ['我很好。', '不是。', '在家。', '没有。', '好的。', '明天。'].map(p),
    example: { text: p('你好吗？'), shown_answer: 0 },
    items: ['他是老师吗？', '你在哪儿？', '你有书吗？', '去吗？', '什么时候？'].map(zh => ({ text: p(zh) })),
  };
  const numbers = Object.fromEntries([0, 1, 2, 3, 4].map(index => [`a-r3:${index}`, 36 + index]));

  it('muestra las 6 opciones una sola vez para las 5 frases', async () => {
    await render(<BankGroup group={group} numbers={numbers} characters={{}} picks={{}} onPick={jest.fn()} />);
    for (const option of group.bank) expect(screen.getAllByText(option.zh)).toHaveLength(1);
    for (const item of group.items) expect(screen.getByText(item.text.zh)).toBeTruthy();
    expect(screen.queryByText(/estudiante|hola/i)).toBeNull();
  });

  it('el ejemplo se ve resuelto y su opción no se ofrece a las preguntas', async () => {
    await render(<BankGroup group={group} numbers={numbers} characters={{}} picks={{}} onPick={jest.fn()} />);
    expect(screen.getByLabelText('Ejemplo: A')).toBeTruthy();
    expect(screen.queryByLabelText('Pregunta 36, opción A')).toBeNull();
    expect(screen.getByLabelText('Pregunta 36, opción B')).toBeTruthy();
  });
});

describe('pickInGroup', () => {
  it('reusar una opción la quita de la frase anterior', () => {
    const picks = { 'a-r3': { 0: 2, 1: 4 } };
    expect(pickInGroup(picks, 'a-r3', 3, 2, true)).toEqual({ 'a-r3': { 1: 4, 3: 2 } });
  });

  it('en las partes sin banco común una opción puede repetirse', () => {
    const picks = { 'a-l1': { 0: 2 } };
    expect(pickInGroup(picks, 'a-l1', 1, 2, false)).toEqual({ 'a-l1': { 0: 2, 1: 2 } });
  });
});
