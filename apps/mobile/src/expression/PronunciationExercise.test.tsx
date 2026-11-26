import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { comparePinyin } from '@hanyu/domain';
import { PronunciationExercise } from './PronunciationExercise';

const mockSpeech = {
  status: 'ready' as string,
  available: true,
  listen: jest.fn(),
  stop: jest.fn(),
};
jest.mock('./useSpeechCheck', () => ({ useSpeechCheck: () => mockSpeech }));
jest.mock('../ui/AudioButton', () => {
  const { Text } = require('react-native');
  return { AudioButton: ({ label }: { label: string }) => <Text>{label}</Text> };
});
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff', success: '#2a7', danger: '#c33' },
  }),
}));

const WORD = { hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hola', audioUrl: null };

function heard(transcriptPinyin: string, audioUri: string | null = null) {
  return {
    status: 'heard',
    transcript: '…',
    heard: transcriptPinyin,
    comparison: comparePinyin(WORD.pinyin, transcriptPinyin, { targetWord: WORD.pinyin }),
    audioUri,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSpeech.status = 'ready';
  mockSpeech.available = true;
});

async function speak(outcome: unknown, props: Partial<Parameters<typeof PronunciationExercise>[0]> = {}) {
  mockSpeech.listen.mockResolvedValue(outcome);
  const onGraded = jest.fn();
  const onUnavailable = jest.fn();
  await render(<PronunciationExercise word={WORD} onGraded={onGraded} onUnavailable={onUnavailable} {...props} />);
  await fireEvent.press(screen.getByLabelText('Hablar'));
  return { onGraded, onUnavailable };
}

describe('PronunciationExercise', () => {
  it('se te entendió: lo dice así, sílaba a sílaba, sin hablar de tonos, y da Good', async () => {
    const { onGraded } = await speak(heard('ni3 hao3'));

    await waitFor(() => expect(screen.getByText('Se te entendió')).toBeTruthy());
    expect(screen.getAllByLabelText(/sílaba .* entendida/)).toHaveLength(2);
    expect(screen.queryByText(/tono/i)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onGraded).toHaveBeenCalledWith({ grade: 'good', intelligible: true });
  });

  it('no se te entendió → Again', async () => {
    const { onGraded } = await speak(heard('ma1 ma1'));

    await waitFor(() => expect(screen.getByText('No se te entendió')).toBeTruthy());
    expect(screen.queryByText(/tono/i)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onGraded).toHaveBeenCalledWith({ grade: 'again', intelligible: false });
  });

  it('sin reconocedor en chino: lo explica y no se ofrece', async () => {
    mockSpeech.status = 'unsupported';
    mockSpeech.available = false;
    const onUnavailable = jest.fn();

    await render(<PronunciationExercise word={WORD} onGraded={jest.fn()} onUnavailable={onUnavailable} />);

    expect(screen.getByText(/no tiene reconocimiento de voz en chino/)).toBeTruthy();
    expect(screen.queryByLabelText('Hablar')).toBeNull();
    expect(onUnavailable).toHaveBeenCalledWith('unsupported');
  });

  it('permiso denegado: lo explica, enlaza a Ajustes y no cuenta como error', async () => {
    mockSpeech.status = 'denied';
    mockSpeech.available = false;
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const onGraded = jest.fn();
    const onUnavailable = jest.fn();

    await render(<PronunciationExercise word={WORD} onGraded={onGraded} onUnavailable={onUnavailable} />);
    await fireEvent.press(screen.getByLabelText('Abrir Ajustes'));

    expect(openSettings).toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith('denied');
    expect(onGraded).not.toHaveBeenCalled();
  });

  it('si el permiso se deniega al hablar, tampoco hay nota', async () => {
    const { onGraded, onUnavailable } = await speak({ status: 'unavailable', reason: 'denied' });

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith('denied'));
    expect(onGraded).not.toHaveBeenCalled();
  });

  it('con evaluación fina (200), añade la puntuación por sílaba y solo entonces habla de tonos', async () => {
    const assess = jest.fn(async () => ({
      status: 'scored' as const,
      assessment: { accuracy: 88, fluency: 90, completeness: 100, syllables: [{ syllable: '你', accuracy: 92 }, { syllable: '好', accuracy: 61 }] },
    }));

    await speak(heard('ni3 hao3', 'file:///cache/rec.wav'), { assess });

    await waitFor(() => expect(screen.getByText(/sonidos y tonos/i)).toBeTruthy());
    expect(assess).toHaveBeenCalledWith({ audioUri: 'file:///cache/rec.wav', referenceText: '你好' });
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('61')).toBeTruthy();
  });

  it('sin evaluación fina (no configurada), no menciona tonos', async () => {
    const assess = jest.fn(async () => ({ status: 'unavailable' as const, reason: 'not_configured' }));

    await speak(heard('ni3 hao3', 'file:///cache/rec.wav'), { assess });

    await waitFor(() => expect(assess).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByText('Se te entendió')).toBeTruthy();
    expect(screen.queryByText(/tono/i)).toBeNull();
  });
});
