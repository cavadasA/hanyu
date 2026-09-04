import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReadingDetailScreen } from './ReadingDetailScreen';

const mockGetReading = jest.fn();
const mockCompleteReading = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'reading-1' }),
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    readings: {
      getReading: (...args: unknown[]) => mockGetReading(...args),
      completeReading: (...args: unknown[]) => mockCompleteReading(...args),
    },
    flashcards: {
      addCard: jest.fn(),
    },
  }),
}));

describe('ReadingDetailScreen', () => {
  beforeEach(() => {
    mockGetReading.mockReset();
    mockCompleteReading.mockReset();
  });

  it('loads a reading, toggles pinyin, and submits answers once', async () => {
    mockGetReading.mockResolvedValue({
      id: 'reading-1',
      slug: 'reading-1',
      title: 'Ordering tea',
      hsk_level: 1,
      format: 'short_text',
      topic: 'compras',
      series: null,
      series_index: null,
      audio_kind: 'tts',
      audio_url: null,
      content: '我要茶。',
      pinyin_text: 'wo yao cha.',
      sentences: [{ zh: '我要茶。', pinyin: 'wo yao cha.', es: 'Quiero té.' }],
      tokens: [
        {
          id: 't0',
          text: '我',
          type: 'word',
          word: {
            id: 1,
            hanzi: '我',
            pinyin: 'wo',
            meaning_en: 'I',
            meaning_es: null,
            hsk_level: 1,
            pos: 'pronoun',
            frequency: null,
            in_srs: true,
          },
        },
      ],
      questions: [
        {
          id: 'q1',
          prompt: 'What does the speaker want?',
          options: [
            { id: 'A', text: 'Coffee' },
            { id: 'B', text: 'Tea' },
          ],
        },
      ],
    });
    mockCompleteReading.mockResolvedValue({
      score: 1,
      total: 1,
      results: [
        {
          question_id: 'q1',
          selected_option_id: 'B',
          correct_option_id: 'B',
          correct: true,
        },
      ],
    });

    const view = await render(<ReadingDetailScreen />);

    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Play reading' })).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Show pinyin' }));
    expect(view.getByText('wo yao cha.')).toBeTruthy();

    expect(view.getByRole('button', { name: 'Submit answers' }).props.accessibilityState)
      .toMatchObject({ disabled: true });

    await fireEvent.press(view.getByRole('button', { name: 'Tea' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit answers' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit answers' }));

    await waitFor(() => expect(view.getByText('Score 1/1')).toBeTruthy());
    expect(mockGetReading).toHaveBeenCalledWith('reading-1');
    expect(mockCompleteReading).toHaveBeenCalledTimes(1);
    expect(mockCompleteReading).toHaveBeenCalledWith('reading-1', { q1: 'B' });
  });
});
