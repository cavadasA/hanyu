import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CharacterWriting } from './CharacterWriting';

const strokesData = require('../../assets/hanzi-writer/writing-strokes.json') as Record<
  string,
  { strokes: string[]; medians: Array<Array<[number, number]>> }
>;

let lastWebView: { onMessage: (event: { nativeEvent: { data: string } }) => void; html: string } | null = null;
const mockInjected: string[] = [];
beforeEach(() => {
  mockInjected.length = 0;
  lastWebView = null;
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: (code: string) => mockInjected.push(code) }));
      lastWebView = { onMessage: props.onMessage, html: props.source.html };
      return <View testID="writing-canvas" />;
    }),
  };
});

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff' },
  }),
}));

const xue = strokesData['学'].medians;
const shifted = (stroke: Array<[number, number]>) => stroke.map(([x, y]) => [x + 20, y - 15]);

/** Lo que manda el lienzo al terminar un trazo en guided y quiz: solo ese trazo. */
async function stroke(points: number[][]) {
  await act(async () => {
    lastWebView!.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'stroke', stroke: points }) } });
  });
}

describe('CharacterWriting en modo quiz', () => {
  it('学 escrito en orden: acepta cada trazo y termina con completed y 0 errores', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="quiz" hanzi="学" onResult={onResult} />);

    for (const median of xue) await stroke(shifted(median));

    expect(mockInjected.filter(code => code.includes('accept('))).toHaveLength(8);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ completed: true, mistakes: 0, hints: 0, strokes: 8, recognized: '学' });
  });

  it('un trazo fuera de orden se rechaza y cuenta como error', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="quiz" hanzi="学" onResult={onResult} />);

    await stroke(shifted(xue[1]));
    expect(mockInjected.at(-1)).toContain('reject(');
    for (const median of xue) await stroke(shifted(median));

    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ completed: true, mistakes: 1 }));
  });

  it('no muestra el contorno; enseña el trazo al tercer error en él', async () => {
    await render(<CharacterWriting mode="quiz" hanzi="学" onResult={jest.fn()} />);
    expect(lastWebView!.html).toContain('var outline=false');

    for (let attempt = 0; attempt < 2; attempt += 1) await stroke(shifted(xue[5]));
    expect(mockInjected.some(code => code.includes('hint('))).toBe(false);
    await stroke(shifted(xue[5]));
    expect(mockInjected.at(-1)).toContain('hint(0)');
  });

  it('«Pista» enseña el trazo que toca y queda registrada', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="quiz" hanzi="学" onResult={onResult} />);

    await fireEvent.press(screen.getByLabelText('Pista'));
    expect(mockInjected.at(-1)).toContain('hint(0)');
    for (const median of xue) await stroke(shifted(median));

    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ completed: true, mistakes: 0, hints: 1 }));
  });
});

describe('CharacterWriting en modo guided', () => {
  it('muestra el contorno y anima el orden de trazos', async () => {
    await render(<CharacterWriting mode="guided" hanzi="学" onResult={jest.fn()} />);

    expect(lastWebView!.html).toContain('var outline=true');
    await fireEvent.press(screen.getByLabelText('Ver el orden'));
    expect(mockInjected.at(-1)).toContain('animate(');
  });

  it('al terminar de calcar, avisa de que ha terminado', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="guided" hanzi="学" onResult={onResult} />);

    for (const median of xue) await stroke(shifted(median));

    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ completed: true, recognized: '学' }));
  });
});

describe('CharacterWriting sin datos de trazos', () => {
  it('no se renderiza y lo registra como error de contenido', async () => {
    const onContentError = jest.fn();
    await render(<CharacterWriting mode="quiz" hanzi="龘" onResult={jest.fn()} onContentError={onContentError} />);

    expect(screen.queryByTestId('writing-canvas')).toBeNull();
    expect(onContentError).toHaveBeenCalledWith({ kind: 'missing_strokes', hanzi: '龘' });
  });
});
