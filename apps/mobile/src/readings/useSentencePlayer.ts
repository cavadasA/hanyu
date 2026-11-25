import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { ensureMediaAudioSession, useSpeech } from '../audio/useSpeech';

export type ReadingRate = 0.75 | 1 | 1.25;

/**
 * Reproduce una lectura frase a frase. Con clips (audio neuronal o humano),
 * un reproductor por frase; sin clips, la voz del dispositivo. Una lectura
 * nunca mezcla fuentes: si tiene clips y falta el de una frase (no se
 * descargó y no hay red), se para en ella y lo expone en `missingClip`.
 */
export function useSentencePlayer(input: {
  sentences: string[];
  clips: Array<{ url: string } | null>;
  rate: ReadingRate;
  /** La lectura tiene audio grabado: se usan sus clips aunque no haya ninguno descargado. */
  recorded?: boolean;
  onSentence?(index: number): void;
}): { activeIndex: number | null; playFrom(i: number): void; stop(): void; missingClip: number | null } {
  const speech = useSpeech();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [missingClip, setMissingClip] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const hasClips = input.recorded ?? input.clips.some(clip => clip !== null);

  useEffect(() => {
    player.current?.setPlaybackRate(input.rate, 'high');
  }, [input.rate]);

  const stop = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    setActiveIndex(null);
  }, []);

  useEffect(() => () => {
    cancel.current?.();
    cancel.current = null;
  }, []);

  const playClipsFrom = useCallback((start: number) => {
    let cancelled = false;
    let subscription: { remove(): void } | null = null;

    const release = () => {
      subscription?.remove();
      subscription = null;
      player.current?.remove();
      player.current = null;
    };

    const next = (index: number) => {
      release();
      if (cancelled) return;
      const { clips, rate, onSentence } = latest.current;
      if (index >= clips.length) {
        setActiveIndex(null);
        return;
      }
      const clip = clips[index];
      if (!clip) {
        setMissingClip(index);
        setActiveIndex(null);
        return;
      }

      setActiveIndex(index);
      onSentence?.(index);
      const current = createAudioPlayer({ uri: clip.url });
      player.current = current;
      current.setPlaybackRate(rate, 'high');
      subscription = current.addListener('playbackStatusUpdate', status => {
        if (status.didJustFinish) next(index + 1);
      });
      current.play();
    };

    cancel.current = () => {
      cancelled = true;
      release();
    };
    void ensureMediaAudioSession().then(() => next(start));
  }, []);

  const playSpeechFrom = useCallback((start: number) => {
    const { sentences, rate } = latest.current;
    cancel.current = speech.speakSentences(sentences, start, {
      rate,
      onSentence: index => {
        setActiveIndex(index);
        if (index !== null) latest.current.onSentence?.(index);
      },
    });
  }, [speech]);

  const playFrom = useCallback((index: number) => {
    cancel.current?.();
    cancel.current = null;
    setMissingClip(null);
    if (hasClips) playClipsFrom(index);
    else playSpeechFrom(index);
  }, [hasClips, playClipsFrom, playSpeechFrom]);

  return { activeIndex, playFrom, stop, missingClip };
}
