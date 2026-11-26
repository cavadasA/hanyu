import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';
import { ReadingDetailScreen } from './ReadingDetailScreen';

const mockGetReading = jest.fn();
const mockCompleteReading = jest.fn();
const mockMarkRead = jest.fn();
const mockGetReadingProgress = jest.fn();
const mockToggleBookmark = jest.fn();
const mockSaveReadingProgress = jest.fn();
const mockSpeakSentences = jest.fn();
const mockStop = jest.fn();
let mockReadingId = 'reading-1';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockReadingId }),
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    readings: {
      getReading: (...args: unknown[]) => mockGetReading(...args),
      completeReading: (...args: unknown[]) => mockCompleteReading(...args),
      markRead: (...args: unknown[]) => mockMarkRead(...args),
      getReadingProgress: (...args: unknown[]) => mockGetReadingProgress(...args),
      toggleBookmark: (...args: unknown[]) => mockToggleBookmark(...args),
      saveReadingProgress: (...args: unknown[]) => mockSaveReadingProgress(...args),
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
  ensureMediaAudioSession: () => Promise.resolve(),
}));

describe('ReadingDetailScreen', () => {
  beforeEach(() => {
    mockGetReading.mockReset();
    mockCompleteReading.mockReset();
    mockMarkRead.mockReset();
    mockGetReadingProgress.mockReset();
    mockToggleBookmark.mockReset();
    mockSaveReadingProgress.mockReset();
    mockSpeakSentences.mockReset();
    mockStop.mockReset();
    mockReadingId = 'reading-1';
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
      sentence_audio: [null],
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
    expect(mockMarkRead).toHaveBeenCalledWith('reading-1', { pinyinShown: true });
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
      sentence_audio: [null],
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
      sentence_audio: [{ url: 'https://example.test/media/a.m4a', duration_ms: 1200 }],
      content: '我要茶。',
      pinyin_text: null,
      sentences: [{ zh: '我要茶。', pinyin: '', es: 'Quiero té.' }],
      tokens: [],
      questions: [],
    });

    const view = await render(<ReadingDetailScreen />);

    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    expect(view.queryByText('Voz sintética')).toBeNull();
    expect(view.queryByText('Voz neuronal')).toBeNull();
  });

  it('una lectura con voz neuronal tiene reproducción frase a frase, velocidades y su nota', async () => {
    mockGetReading.mockResolvedValue(readingWithClips());

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());

    expect(view.getByLabelText('Reproducir')).toBeTruthy();
    expect(view.getByText('0.75x')).toBeTruthy();
    expect(view.getByText('1x')).toBeTruthy();
    expect(view.getByText('1.25x')).toBeTruthy();
    expect(view.getByText('Voz neuronal')).toBeTruthy();
    expect(view.queryByText('Voz sintética')).toBeNull();
  });

  it('con clips, reproduce el clip de la frase y no la voz del dispositivo', async () => {
    mockGetReading.mockResolvedValue(readingWithClips());
    const player = { play: jest.fn(), remove: jest.fn(), setPlaybackRate: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) };
    (createAudioPlayer as jest.Mock).mockReturnValue(player);

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'https://example.test/media/a.m4a' });
    expect(player.play).toHaveBeenCalled();
    expect(mockSpeakSentences).not.toHaveBeenCalled();
    expect(view.getByTestId('sentence-0').props.accessibilityState.selected).toBe(true);
  });

  it('dice qué frase no tiene el audio descargado en vez de saltarla', async () => {
    mockGetReading.mockResolvedValue({
      ...readingWithClips(),
      sentence_audio: [null, { url: 'file:///audio/b.m4a', duration_ms: 1500 }],
    });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.getByText('Falta el audio de la frase 1: conéctate para descargarlo.')).toBeTruthy();
    expect(mockSpeakSentences).not.toHaveBeenCalled();
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

  it('guarda la última frase que realmente empezó a sonar sin retroceder', async () => {
    const sentenceCallbacks: Array<{ onSentence(index: number | null): void }> = [];
    mockGetReading.mockResolvedValue(readingForAudio());
    mockSpeakSentences.mockImplementation((_sentences, fromIndex, options) => {
      sentenceCallbacks.push(options);
      options.onSentence(fromIndex);
      return jest.fn();
    });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));
    await act(async () => {
      sentenceCallbacks[0].onSentence(1);
      sentenceCallbacks[0].onSentence(0);
    });

    expect(mockSaveReadingProgress).toHaveBeenCalledWith('reading-1', 1);
    expect(mockSaveReadingProgress.mock.calls).toEqual([
      ['reading-1', 0],
      ['reading-1', 1],
    ]);
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
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(1);
  });

  it('traducir una frase guarda progreso sin marcarla como activa', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockSpeakSentences.mockReturnValue(jest.fn());

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getAllByLabelText('Traducir la frase')[0]);

    expect(view.getByTestId('sentence-0').props.accessibilityState.selected).toBe(false);
    expect(view.getByRole('button', { name: 'Reproducir' })).toBeTruthy();
    expect(mockSaveReadingProgress).toHaveBeenCalledWith('reading-1', 0);
    expect(mockSpeakSentences).not.toHaveBeenCalled();
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

  it('permite marcar como leída una lectura sin preguntas', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockGetReadingProgress.mockResolvedValue({
      reading_slug: 'reading-1', bookmarked: false, last_sentence: 0, finished_at: null,
      updated_at: '2026-09-05T00:00:00Z',
    });
    mockMarkRead.mockResolvedValue({
      reading_slug: 'reading-1', bookmarked: false, last_sentence: 0,
      finished_at: '2026-09-05T00:00:00Z', updated_at: '2026-09-05T00:00:00Z',
    });

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Marcar como leída' }));

    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('reading-1', { pinyinShown: false }));
  });

  it('muestra el error al fallar el marcador', async () => {
    mockGetReading.mockResolvedValue(readingForAudio());
    mockGetReadingProgress.mockResolvedValue({
      reading_slug: 'reading-1', bookmarked: true, last_sentence: 0, finished_at: null,
      updated_at: '2026-09-05T00:00:00Z',
    });
    mockToggleBookmark.mockRejectedValue(new Error('Failed to fetch'));

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('Quitar marcador')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Quitar marcador' }));

    await waitFor(() => expect(view.getByText('Sin conexión. Revisa la red e inténtalo de nuevo.')).toBeTruthy());
  });

  it('detiene el audio al cambiar de lectura en la misma ruta', async () => {
    mockGetReading.mockImplementation((readingId: string) => Promise.resolve({
      ...readingForAudio(), id: readingId, slug: readingId, title: readingId,
    }));
    mockSpeakSentences.mockReturnValue(jest.fn());

    const view = await render(<ReadingDetailScreen />);
    await waitFor(() => expect(view.getByText('reading-1')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Reproducir'));
    mockReadingId = 'reading-2';
    await act(async () => {
      view.rerender(<ReadingDetailScreen />);
      await Promise.resolve();
    });

    await waitFor(() => expect(view.getByText('reading-2')).toBeTruthy());
    expect(mockGetReading).toHaveBeenCalledWith('reading-2');
    expect(mockStop).toHaveBeenCalled();
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
    sentence_audio: [null, null],
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

function readingWithClips() {
  return {
    ...readingForAudio(),
    audio_kind: 'neural',
    sentence_audio: [
      { url: 'https://example.test/media/a.m4a', duration_ms: 1200 },
      { url: 'https://example.test/media/b.m4a', duration_ms: 1500 },
    ],
  };
}
