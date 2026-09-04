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

  it('cuenta los segundos transcurridos desde start', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(65_000);
    });

    expect(result.current.elapsed).toBe(65);
    expect(result.current.formatted).toBe('1:05');
    jest.useRealTimers();
  });

  it('deja de contar tras stop', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(3000);
      result.current.stop();
      jest.advanceTimersByTime(10_000);
    });

    expect(result.current.elapsed).toBe(3);
    jest.useRealTimers();
  });

  it('start reinicia el contador de una sesión anterior', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start();
      jest.advanceTimersByTime(5000);
      result.current.start();
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.elapsed).toBe(2);
    jest.useRealTimers();
  });

  it('se detiene al llegar al límite de una sección', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useSessionTimer());

    await act(async () => {
      result.current.start(3);
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.elapsed).toBe(3);
    expect(result.current.expired).toBe(true);
    jest.useRealTimers();
  });
});
