import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReadingDetailScreen } from './ReadingDetailScreen';

const mockGetReading = jest.fn();
const mockCompleteReading = jest.fn();
const mockMarkRead = jest.fn();
const mockGetReadingProgress = jest.fn();
const mockToggleBookmark = jest.fn();
const mockSpeakSentences = jest.fn();
const mockStop = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'reading-1' }),
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    readings: {
      getReading: (...args: unknown[]) => mockGetReading(...args),
      completeReading: (...args: unknown[]) => mockCompleteReading(...args),
      markRead: (...args: unknown[]) => mockMarkRead(...args),
      getReadingProgress: (...args: unknown[]) => mockGetReadingProgress(...args),
      toggleBookmark: (...args: unknown[]) => mockToggleBookmark(...args),
    },
    flashcards: {
      addCard: jest.fn(),
    },
  }),
}));

jest.mock('../audio/useSpeech', () => ({
  useSpeech: () => ({
    speakSentences: (...args: unknown[]) => mockSpeakSentences(...args),
    stop: mockStop,
  }),
}));

describe('ReadingDetailScreen', () => {
  beforeEach(() => {
    mockGetReading.mockReset();
    mockCompleteReading.mockReset();
    mockMarkRead.mockReset();
    mockGetReadingProgress.mockReset();
    mockToggleBookmark.mockReset();
    mockSpeakSentences.mockReset();
    mockStop.mockReset();
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
    expect(view.getByRole('button', { name: 'Reproducir' })).toBeTruthy();

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
    expect(mockMarkRead).toHaveBeenCalledWith('reading-1');
  });

  it('avisa de que el audio es sintético cuando lo es', async () => {
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
      pinyin_text: null,
      sentences: [{ zh: '我要茶。', pinyin: '', es: 'Quiero té.' }],
      tokens: [],
      questions: [],
    });

    const view = await render(<ReadingDetailScreen />);

    await waitFor(() => expect(view.getByText('Voz sintética')).toBeTruthy());
  });

  it('no avisa cuando la grabación es humana', async () => {
    mockGetReading.mockResolvedValue({
      id: 'reading-1',
      slug: 'reading-1',
      title: 'Ordering tea',
      hsk_level: 1,
      format: 'short_text',
      topic: 'compras',
      series: null,
      series_index: null,
      audio_kind: 'human',
      audio_url: 'https://example.test/market-01.mp3',
      content: '我要茶。',
      pinyin_text: null,
      sentences: [{ zh: '我要茶。', pinyin: '', es: 'Quiero té.' }],
      tokens: [],
      questions: [],
    });

    const view = await render(<ReadingDetailScreen />);

    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    expect(view.queryByText('Voz sintética')).toBeNull();
  });

  it('resalta la frase que está sonando', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockSpeakSentences.mockImplementation((_sentences, fromIndex, options) => {
      options.onSentence(fromIndex);
      return jest.fn();
    });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));

    expect(view.getByTestId('sentence-0').props.accessibilityState.selected).toBe(true);
  });

  it('empieza por la frase que se toca y aplica la velocidad elegida', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockSpeakSentences.mockImplementation((_sentences, fromIndex, options) => {
      options.onSentence(fromIndex);
      return jest.fn();
    });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByText('0.75x'));
    await fireEvent.press(view.getAllByLabelText('Leer desde aquí', { exact: false })[0]);

    expect(mockSpeakSentences).toHaveBeenCalledWith(
      ['我要茶。', '咖啡比茶贵。'],
      0,
      expect.objectContaining({ rate: 0.75 }),
    );
  });

  it('para el audio al salir de la pantalla', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockSpeakSentences.mockReturnValue(jest.fn());

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));
    view.unmount();

    expect(mockStop).toHaveBeenCalled();
  });

  it('muestra el marcador y permite quitarlo', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockGetReadingProgress.mockResolvedValue({
      reading_slug: 'reading-1',
      bookmarked: true,
      last_sentence: 1,
      finished_at: null,
      updated_at: '2026-09-05T00:00:00Z',
    });
    mockToggleBookmark.mockResolvedValue({ bookmarked: false });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    expect(view.getByText('Quitar marcador')).toBeTruthy();
    expect(view.getByText('Continuar')).toBeTruthy();

    await fireEvent.press(view.getByText('Quitar marcador'));

    expect(mockToggleBookmark).toHaveBeenCalledWith('reading-1');
  });
});

function readingForAudio() {
  return {
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
    content: '我要茶。咖啡比茶贵。',
    sentences: [
      { zh: '我要茶。', pinyin: 'Wǒ yào chá.', es: 'Quiero té.', tokens: [] },
      { zh: '咖啡比茶贵。', pinyin: 'Kāfēi bǐ chá guì.', es: 'El café es más caro que el té.', tokens: [] },
    ],
    grammar_points: [],
    target_words: [],
    target_grammar: [],
    tokens: [],
    questions: [],
  };
}
