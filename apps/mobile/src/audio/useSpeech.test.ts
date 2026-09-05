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

  it('reproduce frases en secuencia y avisa cuál está sonando', async () => {
    const onSentence = jest.fn();
    const cancel = useSpeech().speakSentences(['第一句。', '第二句。'], 0, {
      rate: 0.75,
      onSentence,
    });

    await Promise.resolve();
    expect(onSentence).toHaveBeenCalledWith(0);
    expect(Speech.speak).toHaveBeenCalledWith(
      '第一句。',
      expect.objectContaining({ language: 'zh-CN', rate: 0.75 }),
    );

    const firstOptions = (Speech.speak as jest.Mock).mock.calls[0][1];
    firstOptions.onDone();
    expect(onSentence).toHaveBeenCalledWith(1);

    const secondOptions = (Speech.speak as jest.Mock).mock.calls[1][1];
    secondOptions.onDone();
    expect(onSentence).toHaveBeenLastCalledWith(null);

    cancel();
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('ignora el callback de una frase detenida cuando ya empezó otra reproducción', async () => {
    const firstOnSentence = jest.fn();
    const secondOnSentence = jest.fn();
    useSpeech().speakSentences(['第一句。'], 0, { rate: 1, onSentence: firstOnSentence });
    await Promise.resolve();
    const firstOptions = (Speech.speak as jest.Mock).mock.calls[0][1];

    useSpeech().speakSentences(['第二句。'], 0, { rate: 1, onSentence: secondOnSentence });
    await Promise.resolve();
    secondOnSentence.mockClear();

    firstOptions.onStopped();

    expect(secondOnSentence).not.toHaveBeenCalledWith(null);
  });
});
