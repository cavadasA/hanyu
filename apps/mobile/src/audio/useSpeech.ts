import * as Speech from 'expo-speech';

const speech = {
  speak(text: string, rate = 0.8) {
    if (!text) {
      return;
    }

    Speech.stop();
    Speech.speak(text, { language: 'zh-CN', rate });
  },
  stop() {
    Speech.stop();
  },
};

export function useSpeech() {
  return speech;
}
