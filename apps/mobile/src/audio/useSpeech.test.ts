import * as Speech from 'expo-speech';
import { useSpeech } from './useSpeech';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

describe('useSpeech', () => {
  beforeEach(() => {
    (Speech.speak as jest.Mock).mockClear();
    (Speech.stop as jest.Mock).mockClear();
  });

  it('speaks Mandarin at the study rate', () => {
    useSpeech().speak('你好');

    expect(Speech.stop).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.8 });
  });

  it('accepts a custom rate', () => {
    useSpeech().speak('你好', 0.5);

    expect(Speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.5 });
  });

  it('ignores empty text', () => {
    useSpeech().speak('');

    expect(Speech.speak).not.toHaveBeenCalled();
  });
});
