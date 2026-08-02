import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

let audioModeReady: Promise<void> | null = null;

/**
 * On iOS, AVSpeechSynthesizer's own audio session routes speech through the
 * alert/ringer channel, so TTS is silent while the device mute switch is on.
 * Switching the app's session to the playback category (playsInSilentMode)
 * and telling the synthesizer to use it (useApplicationAudioSession) routes
 * speech through the media channel instead — audible regardless of the mute
 * switch, like music apps.
 */
function ensureMediaAudioSession(): Promise<void> {
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
};

export function useSpeech() {
  return speech;
}
