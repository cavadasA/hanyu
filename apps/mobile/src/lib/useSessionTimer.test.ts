import { act, renderHook } from '@testing-library/react-native';
import { useSessionTimer } from './useSessionTimer';

describe('useSessionTimer', () => {
  it('starts at 0 and formats correctly', async () => {
    const { result } = await renderHook(() => useSessionTimer());
    expect(result.current.elapsed).toBe(0);
    expect(result.current.formatted).toBe('0:00');
  });

  it('resets timer cleanly', async () => {
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.elapsed).toBe(0);
    expect(result.current.formatted).toBe('0:00');
  });
});
