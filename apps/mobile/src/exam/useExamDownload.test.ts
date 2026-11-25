import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useExamDownload } from './useExamDownload';

jest.mock('expo-file-system', () => ({}));

describe('useExamDownload', () => {
  it('descarga todos los medios y solo entonces está listo, con su ruta local', async () => {
    const download = jest.fn(async (url: string) => `file:///exam/${url.split('/').pop()}`);
    const { result } = await renderHook(() => useExamDownload(['https://x/a.m4a', 'https://x/b.webp'], { download }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.progress).toBe(1);
    expect(result.current.localUri('https://x/b.webp')).toBe('file:///exam/b.webp');
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('si una descarga falla no está listo y lo dice', async () => {
    const download = jest.fn(async (url: string) => {
      if (url.endsWith('b.webp')) throw new Error('sin red');
      return 'file:///exam/a.m4a';
    });
    const { result } = await renderHook(() => useExamDownload(['https://x/a.m4a', 'https://x/b.webp'], { download }));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(result.current.progress).toBe(0.5);
  });

  it('reintentar vuelve a descargar lo que faltaba', async () => {
    let fail = true;
    const download = jest.fn(async (url: string) => {
      if (fail) throw new Error('sin red');
      return `file:///exam/${url.split('/').pop()}`;
    });
    const { result } = await renderHook(() => useExamDownload(['https://x/a.m4a'], { download }));
    await waitFor(() => expect(result.current.failed).toBe(true));
    fail = false;
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});
