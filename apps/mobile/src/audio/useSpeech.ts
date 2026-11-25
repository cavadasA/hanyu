import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

let audioModeReady: Promise<void> | null = null;
let activeSentenceRun = 0;

/**
 * On iOS, AVSpeechSynthesizer's own audio session routes speech through the
 * alert/ringer channel, so TTS is silent while the device mute switch is on.
 * Switching the app's session to the playback category (playsInSilentMode)
 * and telling the synthesizer to use it (useApplicationAudioSession) routes
 * speech through the media channel instead — audible regardless of the mute
 * switch, like music apps.
 */
export function ensureMediaAudioSession(): Promise<void> {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({ playsInSilentMode: true }).catch((error) => {
      audioModeReady = null; // allow a retry on the next speak
      console.warn('[useSpeech] failed to configure the audio session:', error);
    });
  }
  return audioModeReady;
}

const speech = {
  async speak(text: string, rate = 0.8) {
    if (!text) {
      return;
    }

    await ensureMediaAudioSession();
    Speech.stop();
    Speech.speak(text, {
      language: 'zh-CN',
      rate,
      useApplicationAudioSession: true,
    });
  },
  stop() {
    Speech.stop();
  },
  speakSentences(
    sentences: readonly string[],
    fromIndex: number,
    options: { rate: number; onSentence(index: number | null): void },
  ) {
    let cancelled = false;
    const run = ++activeSentenceRun;
    const isCurrent = () => !cancelled && activeSentenceRun === run;

    const next = (index: number) => {
      if (!isCurrent()) return;
      if (index >= sentences.length) {
        options.onSentence(null);
        return;
      }

      options.onSentence(index);
      Speech.speak(sentences[index], {
        language: 'zh-CN',
        rate: options.rate,
        useApplicationAudioSession: true,
        onDone: () => next(index + 1),
        onStopped: () => {
          if (isCurrent()) options.onSentence(null);
        },
        onError: () => {
          if (isCurrent()) options.onSentence(null);
        },
      });
    };

    void ensureMediaAudioSession().then(() => {
      if (!isCurrent()) return;
      Speech.stop();
      next(fromIndex);
    });

    return () => {
      cancelled = true;
      if (activeSentenceRun === run) {
        activeSentenceRun += 1;
        Speech.stop();
        options.onSentence(null);
      }
    };
  },
};

export function useSpeech() {
  return speech;
}
