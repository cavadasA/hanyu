import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ExerciseKind } from '@hanyu/domain';

const mockBuildExerciseSession = jest.fn();
const mockPush = jest.fn();
const mockCheckExercise = jest.fn();
const mockRateCard = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    exercises: {
      buildExerciseSession: (...args: unknown[]) => mockBuildExerciseSession(...args),
      checkExercise: (...args: unknown[]) => mockCheckExercise(...args),
    },
    flashcards: { rateCard: (...args: unknown[]) => mockRateCard(...args) },
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush }),
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
    mockPush.mockReset();
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

  // Ejercicios decía «Unidad activa: Repaso HSK 1» mientras Hoy decía 方位名词.
  it('si la unidad aún no tiene ejercicios propios, lo dice y ofrece el repaso general', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '方位名词', review_fallback: true, hsk_level: 1, exercises: [exercise('e1', 'multiple_choice')], length: 1,
    });

    await renderExercises();

    expect(screen.getByText('方位名词')).toBeTruthy();
    expect(screen.getByText('Todavía no tiene ejercicios propios: repaso general de HSK 1')).toBeTruthy();
  });

  it('ordena los ejercicios de discriminación a producción', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [exercise('e1', 'dictation'), exercise('e2', 'multiple_choice'), exercise('e3', 'reorder')],
      length: 3,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    // El primero es el de opción múltiple (e2), que pregunta «选择».
    expect(screen.getByText('选择')).toBeTruthy();
  });

  it('no enseña el identificador interno del ejercicio', async () => {
    mockBuildExerciseSession.mockResolvedValue({
      unit_title: '离合词',
      exercises: [{ ...exercise('e1', 'multiple_choice'), slug: 'l1-multiple-choice-01' }],
      length: 1,
    });

    await renderExercises();
    await fireEvent.press(screen.getByText('Empezar'));

    expect(screen.getByText('选择')).toBeTruthy();
    expect(screen.queryByText('l1-multiple-choice-01')).toBeNull();
    expect(screen.queryByText('e1')).toBeNull();
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

  it('el simulacro abre el examen HSK 2 completo, con la siguiente forma por hacer', async () => {
    mockBuildExerciseSession.mockResolvedValue({ unit_title: '离合词', exercises: [], length: 8 });
    await renderExercises();
    await fireEvent.press(screen.getByText('Simulacro completo'));
    expect(mockPush).toHaveBeenCalledWith('/practice/exam/next');
    expect(screen.queryByText(/aún no se puede simular/)).toBeNull();
  });
});
