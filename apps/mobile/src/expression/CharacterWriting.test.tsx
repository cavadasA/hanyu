import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CharacterWriting } from './CharacterWriting';

const medians = require('../../assets/hanzi-writer/handwriting-medians.json') as Record<string, Array<Array<[number, number]>>>;

let lastWebView: { onMessage: (event: { nativeEvent: { data: string } }) => void; injected: string[] } | null = null;
const mockInjected: string[] = [];
beforeEach(() => {
  mockInjected.length = 0;
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: (code: string) => mockInjected.push(code) }));
      lastWebView = { onMessage: props.onMessage, injected: mockInjected };
      return <View testID="writing-canvas" />;
    }),
  };
});

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff' },
  }),
}));

/** Lo que manda el lienzo cuando el alumno termina un trazo: todos los trazos hasta ahora. */
async function drawn(strokes: Array<Array<[number, number]>>) {
  await act(async () => {
    lastWebView!.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'strokes', strokes }) } });
  });
}

/** 学 escrito más pequeño y desplazado, con los trazos desordenados. */
const xueShuffled = () => {
  const strokes = medians['学'].map(stroke => stroke.map(([x, y]) => [x * 0.6 + 100, y * 0.6 - 40] as [number, number]));
  return [strokes[6], strokes[1], strokes[0], strokes[7], strokes[3], strokes[2], strokes[5], strokes[4]];
};

describe('CharacterWriting en modo exam', () => {
  it('no emite ningún resultado hasta «Hecho»', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="exam" onResult={onResult} />);
    await drawn(xueShuffled().slice(0, 3));
    await drawn(xueShuffled());
    expect(onResult).not.toHaveBeenCalled();
  });

  it('al pulsar «Hecho» reconoce el carácter escrito, en cualquier orden de trazos', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="exam" onResult={onResult} />);
    await drawn(xueShuffled());
    await fireEvent.press(screen.getByLabelText('Hecho'));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ completed: true, recognized: '学', strokes: 8 }));
  });

  it('un dibujo que no es ningún carácter da recognized: null y no está completo', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="exam" onResult={onResult} />);
    await drawn([[[100, 100], [900, 800]], [[900, 100], [100, 800]]]);
    await fireEvent.press(screen.getByLabelText('Hecho'));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ completed: false, recognized: null }));
  });

  it('sin contorno ni pistas: no muestra el carácter ni su pinyin', async () => {
    await render(<CharacterWriting mode="exam" onResult={jest.fn()} />);
    expect(screen.queryByText('学')).toBeNull();
    expect(screen.queryByLabelText('Pista')).toBeNull();
  });

  it('«Borrar» limpia el lienzo y descarta los trazos', async () => {
    const onResult = jest.fn();
    await render(<CharacterWriting mode="exam" onResult={onResult} />);
    await drawn(xueShuffled());
    await fireEvent.press(screen.getByLabelText('Borrar'));
    expect(lastWebView!.injected.join('\n')).toContain('clearCanvas');
    await fireEvent.press(screen.getByLabelText('Hecho'));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ recognized: null, strokes: 0 }));
  });
});
