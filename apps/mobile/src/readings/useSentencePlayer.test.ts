import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import { act, renderHook } from '@testing-library/react-native';
import { useSentencePlayer } from './useSentencePlayer';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

type Listener = (status: { didJustFinish: boolean }) => void;

function fakePlayers() {
  const players: Array<{
    source: unknown;
    play: jest.Mock;
    pause: jest.Mock;
    remove: jest.Mock;
    setPlaybackRate: jest.Mock;
    finish(): void;
  }> = [];
  (createAudioPlayer as jest.Mock).mockImplementation((source: unknown) => {
    let listener: Listener | null = null;
    const player = {
      source,
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      setPlaybackRate: jest.fn(),
      addListener: jest.fn((_event: string, callback: Listener) => {
        listener = callback;
        return { remove: jest.fn() };
      }),
      finish: () => listener?.({ didJustFinish: true }),
    };
    players.push(player);
    return player;
  });
  return players;
}

const sentences = ['我起床。', '我吃饭。', '我上学。'];
const clips = [
  { url: 'https://cdn.test/media/a.m4a' },
  { url: 'https://cdn.test/media/b.m4a' },
  { url: 'https://cdn.test/media/c.m4a' },
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useSentencePlayer', () => {
  beforeEach(() => {
    (createAudioPlayer as jest.Mock).mockReset();
    (Speech.speak as jest.Mock).mockClear();
  });

  it('con clips, reproduce el de la frase y al terminar pasa a la siguiente', async () => {
    const players = fakePlayers();
    const onSentence = jest.fn();
    const { result } = await renderHook(() => useSentencePlayer({ sentences, clips, rate: 1, onSentence }));

    await act(() => result.current.playFrom(0));
    await flush();

    expect(players[0].source).toEqual({ uri: 'https://cdn.test/media/a.m4a' });
    expect(players[0].play).toHaveBeenCalled();
    expect(result.current.activeIndex).toBe(0);

    await act(() => players[0].finish());

    expect(players[0].remove).toHaveBeenCalled();
    expect(players[1].source).toEqual({ uri: 'https://cdn.test/media/b.m4a' });
    expect(result.current.activeIndex).toBe(1);
    expect(onSentence).toHaveBeenLastCalledWith(1);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('al acabar la última frase, no queda ninguna activa', async () => {
    const players = fakePlayers();
    const { result } = await renderHook(() => useSentencePlayer({ sentences, clips, rate: 1 }));

    await act(() => result.current.playFrom(2));
    await flush();
    await act(() => players[0].finish());

    expect(result.current.activeIndex).toBeNull();
  });

  it('a 1.25x pide la velocidad con corrección de tono', async () => {
    const players = fakePlayers();
    const { result } = await renderHook(() => useSentencePlayer({ sentences, clips, rate: 1.25 }));

    await act(() => result.current.playFrom(0));
    await flush();

    expect(players[0].setPlaybackRate).toHaveBeenCalledWith(1.25, 'high');
  });

  it('cambiar la velocidad mientras suena la aplica al clip en curso', async () => {
    const players = fakePlayers();
    const { result, rerender } = await renderHook(
      ({ rate }: { rate: 0.75 | 1 | 1.25 }) => useSentencePlayer({ sentences, clips, rate }),
      { initialProps: { rate: 1 as 0.75 | 1 | 1.25 } },
    );

    await act(() => result.current.playFrom(0));
    await flush();
    await rerender({ rate: 0.75 });

    expect(players[0].setPlaybackRate).toHaveBeenLastCalledWith(0.75, 'high');
  });

  it('un clip que falta en una lectura con clips se para en esa frase y no cae a TTS', async () => {
    const players = fakePlayers();
    const { result } = await renderHook(() =>
      useSentencePlayer({ sentences, clips: [clips[0], null, clips[2]], rate: 1 }));

    await act(() => result.current.playFrom(0));
    await flush();
    await act(() => players[0].finish());

    expect(result.current.missingClip).toBe(1);
    expect(result.current.activeIndex).toBeNull();
    expect(players).toHaveLength(1);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('stop libera el reproductor', async () => {
    const players = fakePlayers();
    const { result } = await renderHook(() => useSentencePlayer({ sentences, clips, rate: 1 }));

    await act(() => result.current.playFrom(0));
    await flush();
    await act(() => result.current.stop());

    expect(players[0].remove).toHaveBeenCalled();
    expect(result.current.activeIndex).toBeNull();
  });

  it('sin clips, lee con la voz del dispositivo', async () => {
    const { result } = await renderHook(() =>
      useSentencePlayer({ sentences, clips: [null, null, null], rate: 1 }));

    await act(() => result.current.playFrom(0));
    await flush();

    expect(Speech.speak).toHaveBeenCalledWith('我起床。', expect.objectContaining({ rate: 1 }));
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });
});
