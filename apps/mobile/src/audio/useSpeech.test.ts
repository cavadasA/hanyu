import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { useSpeech } from './useSpeech';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

describe('useSpeech', () => {
  beforeEach(() => {
    (Speech.speak as jest.Mock).mockClear();
    (Speech.stop as jest.Mock).mockClear();
    (setAudioModeAsync as jest.Mock).mockClear();
  });

  it('routes speech through the media channel so the iOS mute switch does not silence it', async () => {
    await useSpeech().speak('你好');

    // App audio session → playback category (ignores the mute switch)…
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
    // …and the synthesizer must use that app session instead of its own.
    expect(Speech.speak).toHaveBeenCalledWith('你好', {
      language: 'zh-CN',
      rate: 0.8,
      useApplicationAudioSession: true,
    });
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('accepts a custom rate', async () => {
    await useSpeech().speak('你好', 0.5);

    expect(Speech.speak).toHaveBeenCalledWith('你好', {
      language: 'zh-CN',
      rate: 0.5,
      useApplicationAudioSession: true,
    });
  });

  it('ignores empty text without touching the audio session', async () => {
    await useSpeech().speak('');

    expect(Speech.speak).not.toHaveBeenCalled();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});
