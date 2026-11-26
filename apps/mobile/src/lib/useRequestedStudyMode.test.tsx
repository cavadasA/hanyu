import { renderHook } from '@testing-library/react-native';
import { studyModeHref, useRequestedStudyMode } from './useRequestedStudyMode';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

// «Start learning» en Hoy abría Reviews en modo Review: la ruta no llevaba modo y la
// pantalla no leía ninguno.
describe('useRequestedStudyMode', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('el enlace de Hoy pide el modo y es distinto en cada pulsación', () => {
    const first = studyModeHref('learn');
    expect(first).toMatchObject({ pathname: '/cards', params: { mode: 'learn' } });
    expect(typeof first.params.at).toBe('string');
  });

  it('aplica el modo pedido por la ruta', async () => {
    mockParams = { mode: 'learn', at: '1' };
    const onRequest = jest.fn();
    await renderHook(() => useRequestedStudyMode(onRequest));
    expect(onRequest).toHaveBeenCalledWith('learn');
  });

  it('sin modo, o con uno que no existe, no hace nada', async () => {
    const onRequest = jest.fn();
    mockParams = { deckId: 'd1' };
    await renderHook(() => useRequestedStudyMode(onRequest));
    mockParams = { mode: 'nada', at: '2' };
    await renderHook(() => useRequestedStudyMode(onRequest));
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('vuelve a aplicarlo en cada nueva pulsación, aunque el modo sea el mismo', async () => {
    const onRequest = jest.fn();
    mockParams = { mode: 'learn', at: '1' };
    const view = await renderHook(() => useRequestedStudyMode(onRequest));
    await view.rerender(undefined);
    expect(onRequest).toHaveBeenCalledTimes(1);

    mockParams = { mode: 'learn', at: '2' };
    await view.rerender(undefined);
    expect(onRequest).toHaveBeenCalledTimes(2);
  });
});
