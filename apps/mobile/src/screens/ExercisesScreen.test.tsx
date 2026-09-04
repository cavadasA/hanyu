import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ExerciseKind } from '@hanyu/domain';

const mockBuildExerciseSession = jest.fn();
const mockBuildMock = jest.fn();
const mockCheckExercise = jest.fn();
const mockRateCard = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    exercises: {
      buildExerciseSession: (...args: unknown[]) => mockBuildExerciseSession(...args),
      buildMockExam: (...args: unknown[]) => mockBuildMock(...args),
      checkExercise: (...args: unknown[]) => mockCheckExercise(...args),
    },
    flashcards: { rateCard: (...args: unknown[]) => mockRateCard(...args) },
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
}));

const { ExercisesScreen } = require('./ExercisesScreen');

function exercise(id: string, type: ExerciseKind) {
  if (type === 'dictation') {
    return {
      id,
      type,
      hsk_level: 2,
      prompt: { kind: 'dictation', audio_text: '你好' },
      solution: { kind: 'dictation', hanzi: '你好', pinyin: null },
      explanation: null,
    };
  }

  if (type === 'reorder') {
    return {
      id,
      type,
      hsk_level: 2,
      prompt: { kind: 'reorder', tokens: ['我', '喜欢', '茶'] },
      solution: { kind: 'reorder', order: ['我', '喜欢', '茶'] },
      explanation: null,
    };
  }

  return {
    id,
    type,
    hsk_level: 2,
    prompt: { kind: 'multiple_choice', question: '选择', options: ['A', 'B'] },
    solution: { kind: 'multiple_choice', correct: 'A' },
    explanation: null,
  };
}

async function renderExercises() {
  await act(async () => {
    render(<ExercisesScreen />);
  });
  await waitFor(() => expect(mockBuildExerciseSession).toHaveBeenCalled());
}

describe('ExercisesScreen', () => {
  beforeEach(() => {
    mockBuildExerciseSession.mockReset();
    mockBuildMock.mockReset();
    mockCheckExercise.mockReset();
    mockRateCard.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('propone la unidad activa en vez de pedir que elijas nivel y tipo', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });

    await renderExercises();

    expect(screen.getByText('离合词')).toBeTruthy();
    expect(screen.queryByText('HSK 1')).toBeNull();
  });

  it('ordena los ejercicios de discriminación a producción', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [exercise('e1', 'dictation'), exercise('e2', 'multiple_choice'), exercise('e3', 'reorder')],
      length: 3,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByTestId('exercise-slug').props.children).toBe('e2');
  });

  it('muestra el progreso y termina con un resumen', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [exercise('e1', 'multiple_choice')],
      length: 1,
    });
    mockCheckExercise.mockResolvedValue({
      correct: true,
      expected_answer: { kind: 'multiple_choice', correct: 'A' },
      submitted_answer: { kind: 'multiple_choice', option: 'A' },
      detail: { kind: 'simple' },
      explanation: null,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByText('1/1')).toBeTruthy();
    await fireEvent.press(screen.getByText('A'));
    await fireEvent.press(screen.getByText('Comprobar'));
    await waitFor(() => expect(screen.getByText('Terminado')).toBeTruthy());
  });

  it('no repite el mismo ejercicio dos veces seguidas', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [exercise('e1', 'multiple_choice'), exercise('e1', 'multiple_choice')],
      length: 2,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('cronometra cada sección con los minutos oficiales', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'listening', title: '听力', minutes: 25, exercises: [] }],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Comprensión auditiva'));

    expect(screen.getByText('25:00')).toBeTruthy();
  });

  it('usa el único nivel transcrito cuando la unidad es de otro nivel', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: 'Unidad HSK 3',
      hsk_level: 3,
      exercises: [],
      length: 8,
    });
    mockBuildMock.mockResolvedValue({
      hsk_level: 2,
      scope: 'full',
      sections: [{ code: 'reading', title: '阅读', minutes: 22, exercises: [] }],
      unsupported: [],
    });

    await renderExercises();
    expect(screen.getByText(/Tu unidad es HSK 3/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Examen completo'));

    await waitFor(() => expect(screen.getByText('阅读')).toBeTruthy());
    expect(mockBuildMock).toHaveBeenCalledWith(2, 'full', undefined);
  });

  it('dice qué partes del examen no puede simular todavía', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'listening', title: '听力', minutes: 25, exercises: [] }],
      unsupported: [{ section: '书写', reason: 'no_matching_type' }],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Comprensión auditiva'));

    expect(screen.getByText(/书写/)).toBeTruthy();
  });

  it('no reprograma ninguna tarjeta', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'reading', title: '阅读', minutes: 22, exercises: [exercise('e1', 'multiple_choice')] }],
    });
    mockCheckExercise.mockResolvedValue({
      correct: true,
      expected_answer: { kind: 'multiple_choice', correct: 'A' },
      submitted_answer: { kind: 'multiple_choice', option: 'A' },
      detail: { kind: 'simple' },
      explanation: null,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Comprensión auditiva'));
    await fireEvent.press(screen.getByText('Empezar'));
    await fireEvent.press(screen.getByText('A'));
    await fireEvent.press(screen.getByText('Comprobar'));

    expect(mockRateCard).not.toHaveBeenCalled();
  });

  it('no fabrica una pregunta cuando la RPC devuelve una fila incompleta', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'reading', title: '阅读', minutes: 22, exercises: [{ id: 'broken', type: 'multiple_choice' }] }],
      unsupported: [],
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Comprensión auditiva'));
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.queryByText('Elige la respuesta correcta')).toBeNull();
    expect(screen.getByText(/todavía no tiene ejercicios simulables/)).toBeTruthy();
    expect(mockCheckExercise).not.toHaveBeenCalled();
  });

  it('cierra la sección cuando se agota su tiempo oficial', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    mockBuildMock.mockResolvedValue({
      sections: [{ code: 'reading', title: '阅读', minutes: 22, exercises: [] }],
      unsupported: [],
    });

    await renderExercises();
    jest.useFakeTimers();
    await fireEvent.press(screen.getByText('Comprensión auditiva'));
    await fireEvent.press(screen.getByText('Empezar'));

    await act(async () => {
      jest.advanceTimersByTime(22 * 60 * 1000);
      await Promise.resolve();
    });

    expect(screen.getByText(/Tiempo agotado/)).toBeTruthy();
  });
});
