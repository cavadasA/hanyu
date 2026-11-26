import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { emptyState } from '@hanyu/domain';
import { ExpressionSessionScreen } from './ExpressionSessionScreen';

const mockData = {
  settings: { getSettings: jest.fn() },
  flashcards: { buildQueue: jest.fn(), reviewCardEvent: jest.fn() },
  expression: {
    getWritingQueue: jest.fn(),
    reviewWriting: jest.fn(),
    getCommunicativeTasks: jest.fn(),
    getCommunicativeContext: jest.fn(),
    gradeCommunicative: jest.fn(),
  },
  events: { recordEvent: jest.fn() },
};
jest.mock('../lib/data', () => ({ getData: () => mockData }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));

const mockSpeech = { status: 'ready' as string, available: true };
jest.mock('../expression/useSpeechCheck', () => ({ useSpeechCheck: () => mockSpeech }));

// Los ejercicios se prueban aparte: aquí solo importa qué recibe cada uno y qué se registra.
jest.mock('../expression/CharacterWriting', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CharacterWriting: ({ mode, hanzi, onResult }: any) => (
      <Pressable
        accessibilityLabel={`lienzo ${mode} ${hanzi}`}
        onPress={() => onResult({ completed: true, mistakes: 1, hints: 0, strokes: 8, recognized: hanzi })}
      >
        <Text>lienzo</Text>
      </Pressable>
    ),
  };
});
jest.mock('../expression/PronunciationExercise', () => {
  const { Pressable, Text } = require('react-native');
  return {
    PronunciationExercise: ({ word, onGraded, onUnavailable }: any) => (
      <>
        <Pressable accessibilityLabel={`pronunciar ${word.hanzi}`} onPress={() => onGraded({ grade: 'good', intelligible: true })}>
          <Text>pronunciar</Text>
        </Pressable>
        <Pressable accessibilityLabel="sin permiso" onPress={() => onUnavailable('denied')}>
          <Text>sin permiso</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock('../expression/CommunicativeTask', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CommunicativeTask: ({ task, onFinished }: any) => (
      <>
        <Pressable accessibilityLabel={`aprobar ${task.slug}`} onPress={() => onFinished({ status: 'graded', passed: true })}>
          <Text>aprobar</Text>
        </Pressable>
        <Pressable accessibilityLabel="sin corregir" onPress={() => onFinished({ status: 'ungraded' })}>
          <Text>sin corregir</Text>
        </Pressable>
        <Pressable accessibilityLabel="no configurado" onPress={() => onFinished({ status: 'unavailable', reason: 'not_configured' })}>
          <Text>no configurado</Text>
        </Pressable>
      </>
    ),
  };
});

const XUE = {
  hanzi: '学',
  target_id: 23398,
  is_new: false,
  version: 4,
  scheduling: emptyState(new Date('2026-11-20T00:00:00Z')),
  example: { word: '学生', pinyin: 'xuéshēng', meaning: 'estudiante' },
};
const NIHAO = {
  id: 'card-1',
  word_id: 7,
  skill: 'pronunciation',
  version: 2,
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning_es: 'hola',
  meaning_en: 'hello',
  scheduling: emptyState(new Date('2026-11-20T00:00:00Z')),
};
const TASK = { slug: '2-03-rechazar-invitacion', hsk_level: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  mockSpeech.status = 'ready';
  mockSpeech.available = true;
  mockData.settings.getSettings.mockResolvedValue({ current_level: 2, request_retention: 0.9 });
  mockData.expression.getWritingQueue.mockResolvedValue([XUE]);
  mockData.flashcards.buildQueue.mockResolvedValue({ cards: [NIHAO], deck_size: null });
  mockData.expression.getCommunicativeTasks.mockResolvedValue([TASK]);
  mockData.expression.getCommunicativeContext.mockResolvedValue({ dictionary: [], grammar_points: [] });
  mockData.expression.reviewWriting.mockResolvedValue({ outcome: 'applied', version: 5 });
  mockData.flashcards.reviewCardEvent.mockResolvedValue({ outcome: 'applied', card: NIHAO });
  mockData.events.recordEvent.mockResolvedValue({});
});

describe('ExpressionSessionScreen', () => {
  it('pide el carácter con su palabra, sin enseñarlo, y registra el quiz con su nota', async () => {
    await render(<ExpressionSessionScreen />);

    await waitFor(() => expect(screen.getByLabelText('lienzo quiz 学')).toBeTruthy());
    expect(screen.getByText('□生')).toBeTruthy();
    expect(screen.queryByText('学生')).toBeNull();
    await fireEvent.press(screen.getByLabelText('lienzo quiz 学'));

    await waitFor(() => expect(mockData.expression.reviewWriting).toHaveBeenCalledTimes(1));
    expect(mockData.expression.reviewWriting).toHaveBeenCalledWith(
      expect.objectContaining({ item: XUE, grade: 'hard', mistakes: 1, hints: 0, review_id: 'uuid-1' }),
    );
  });

  it('practicar con el contorno (guided) después del quiz no registra nada más', async () => {
    await render(<ExpressionSessionScreen />);
    await waitFor(() => expect(screen.getByLabelText('lienzo quiz 学')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('lienzo quiz 学'));
    await waitFor(() => expect(screen.getByLabelText('Practicar con el contorno')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Practicar con el contorno'));
    await fireEvent.press(screen.getByLabelText('lienzo guided 学'));

    expect(mockData.expression.reviewWriting).toHaveBeenCalledTimes(1);
  });

  it('la pronunciación se registra como repaso de la habilidad pronunciation de la palabra', async () => {
    await render(<ExpressionSessionScreen />);
    await waitFor(() => expect(screen.getByLabelText('lienzo quiz 学')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('lienzo quiz 学'));
    await fireEvent.press(await screen.findByLabelText('Siguiente'));

    await fireEvent.press(await screen.findByLabelText('pronunciar 你好'));

    await waitFor(() => expect(mockData.flashcards.reviewCardEvent).toHaveBeenCalledTimes(1));
    expect(mockData.flashcards.reviewCardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ card_id: 'card-1', skill: 'pronunciation', grade: 3, expected_version: 2 }),
    );
    expect(mockData.flashcards.buildQueue).toHaveBeenCalledWith(expect.objectContaining({ skill: 'pronunciation', mode: 'learn' }));
  });

  it('sin reconocedor de voz no hay pronunciación en la sesión, y lo dice', async () => {
    mockSpeech.status = 'unsupported';
    mockSpeech.available = false;
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.expression.getCommunicativeTasks.mockResolvedValue([]);

    await render(<ExpressionSessionScreen />);

    await waitFor(() => expect(screen.getByText(/no hay ejercicios de pronunciación/)).toBeTruthy());
    expect(screen.queryByLabelText('pronunciar 你好')).toBeNull();
  });

  it('si se deniega el permiso a mitad, la pronunciación sale de la sesión sin nota', async () => {
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.flashcards.buildQueue.mockResolvedValue({ cards: [NIHAO, { ...NIHAO, id: 'card-2', hanzi: '谢谢' }], deck_size: null });

    await render(<ExpressionSessionScreen />);
    await fireEvent.press(await screen.findByLabelText('sin permiso'));

    expect(screen.queryByLabelText('pronunciar 谢谢')).toBeNull();
    expect(mockData.flashcards.reviewCardEvent).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('aprobar 2-03-rechazar-invitacion')).toBeTruthy();
  });

  it('una tarea comunicativa corregida se registra; sin corregir, no', async () => {
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.flashcards.buildQueue.mockResolvedValue({ cards: [], deck_size: null });

    await render(<ExpressionSessionScreen />);
    await fireEvent.press(await screen.findByLabelText('aprobar 2-03-rechazar-invitacion'));

    await waitFor(() => expect(mockData.events.recordEvent).toHaveBeenCalledWith({
      kind: 'exercise_attempted',
      skill: 'production',
      client_event_id: 'uuid-1',
      payload: { communicative_task: '2-03-rechazar-invitacion', passed: true },
    }));
  });

  it('una tarea sin corregir no deja ningún evento', async () => {
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.flashcards.buildQueue.mockResolvedValue({ cards: [], deck_size: null });

    await render(<ExpressionSessionScreen />);
    await fireEvent.press(await screen.findByLabelText('sin corregir'));

    expect(mockData.events.recordEvent).not.toHaveBeenCalled();
  });

  it('sin corrector configurado, deja de ofrecer tareas comunicativas', async () => {
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.flashcards.buildQueue.mockResolvedValue({ cards: [], deck_size: null });

    await render(<ExpressionSessionScreen />);
    await fireEvent.press(await screen.findByLabelText('no configurado'));
    await fireEvent.press(await screen.findByLabelText('Otra sesión'));

    expect(await screen.findByText(/Nada de expresión para hoy/)).toBeTruthy();
    expect(screen.queryByLabelText('aprobar 2-03-rechazar-invitacion')).toBeNull();
    expect(mockData.events.recordEvent).not.toHaveBeenCalled();
  });

  it('sin nada pendiente lo explica', async () => {
    mockData.expression.getWritingQueue.mockResolvedValue([]);
    mockData.flashcards.buildQueue.mockResolvedValue({ cards: [], deck_size: null });
    mockData.expression.getCommunicativeTasks.mockResolvedValue([]);

    await render(<ExpressionSessionScreen />);

    expect(await screen.findByText(/Nada de expresión para hoy/)).toBeTruthy();
  });
});
