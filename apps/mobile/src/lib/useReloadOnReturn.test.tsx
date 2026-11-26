import { renderHook } from '@testing-library/react-native';
import { useReloadOnReturn } from './useReloadOnReturn';

let mockFocus: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
  },
}));

// Reviews enseñaba «Deck breakdown» y «N due» de antes de la sesión (new 503 / 10 due
// tras estudiar 6) hasta que se cambiaba de modo.
describe('useReloadOnReturn', () => {
  beforeEach(() => {
    mockFocus = null;
  });

  it('recarga al cerrar una sesión y volver al resumen', async () => {
    const reload = jest.fn();
    const view = await renderHook(({ phase }: { phase: string }) => useReloadOnReturn(phase, reload), {
      initialProps: { phase: 'pre-session' },
    });
    await view.rerender({ phase: 'reviewing' });
    expect(reload).not.toHaveBeenCalled();

    await view.rerender({ phase: 'pre-session' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recarga al volver a la pestaña con el resumen a la vista, no la primera vez', async () => {
    const reload = jest.fn();
    await renderHook(() => useReloadOnReturn('pre-session', reload));

    mockFocus?.();
    expect(reload).not.toHaveBeenCalled();
    mockFocus?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('no recarga al volver a la pestaña en mitad de una sesión', async () => {
    const reload = jest.fn();
    await renderHook(() => useReloadOnReturn('reviewing', reload));

    mockFocus?.();
    mockFocus?.();
    expect(reload).not.toHaveBeenCalled();
  });
});
