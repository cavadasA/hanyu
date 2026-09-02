import { renderHook, waitFor } from '@testing-library/react-native';
import { useSupportLanguage } from './useSupportLanguage';
import { getData } from './data';

jest.mock('./data');

describe('useSupportLanguage', () => {
  it('empieza en español antes de que carguen los ajustes', async () => {
    const pending = new Promise(() => {});
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockReturnValue(pending) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    expect(result.current).toBe('es');
  });

  it('adopta la preferencia guardada', async () => {
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockResolvedValue({ support_language: 'en' }) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    await waitFor(() => expect(result.current).toBe('en'));
  });

  it('se queda en español si los ajustes no cargan', async () => {
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockRejectedValue(new Error('offline')) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    await waitFor(() => expect(result.current).toBe('es'));
  });
});
