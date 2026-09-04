import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DiagnosticScreen from './DiagnosticScreen';

const mockGetWords = jest.fn();
const mockSubmitDiagnostic = jest.fn();
const mockCreateStudyPlan = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    words: { getWords: (params: unknown) => mockGetWords(params) },
    flashcards: {
      submitDiagnostic: (results: unknown) => mockSubmitDiagnostic(results),
      createStudyPlan: (levels: number[]) => mockCreateStudyPlan(levels),
    },
  }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

async function renderDiagnostic() {
  await act(async () => {
    await render(<DiagnosticScreen />);
  });
}

describe('DiagnosticScreen', () => {
  beforeEach(() => {
    mockGetWords.mockReset();
    mockSubmitDiagnostic.mockReset().mockResolvedValue({ suspended: 1, queued: 1 });
    mockCreateStudyPlan.mockReset().mockResolvedValue({ deck_id: 'd1', scope_size: 504 });
    mockGetWords.mockImplementation(({ level }: { level: number }) =>
      Promise.resolve({
        items: [{
          id: level === 1 ? 1 : 2,
          hanzi: level === 1 ? '字一' : '字二',
          pinyin: 'zì',
          meaning_es: 'carácter',
          hsk_level: level,
        }],
      }),
    );
  });

  it('crea el plan de estudio antes de preguntar nada', async () => {
    await renderDiagnostic();

    expect(mockCreateStudyPlan).toHaveBeenCalledWith([1, 2]);
  });

  it('manda lo reconocido y lo no reconocido con su marca', async () => {
    await renderDiagnostic();

    await fireEvent.press(screen.getByText('Ya la sé'));
    await fireEvent.press(screen.getByText('No la sé'));

    expect(mockSubmitDiagnostic).toHaveBeenCalledWith([
      { word_id: 1, known: true },
      { word_id: 2, known: false },
    ]);
  });

  it('se puede saltar sin marcar nada', async () => {
    await renderDiagnostic();

    await fireEvent.press(screen.getByText('Saltar'));

    expect(mockSubmitDiagnostic).toHaveBeenCalledWith([]);
  });

  it('reparte la muestra entre los dos niveles objetivo', async () => {
    mockGetWords.mockImplementation(({ level, page_size }: { level: number; page_size: number }) =>
      Promise.resolve({
        items: Array.from({ length: page_size }, (_, index) => ({
          id: level * 100 + index,
          hanzi: `字${level}-${index}`,
          pinyin: 'zì',
          meaning_es: 'carácter',
          hsk_level: level,
        })),
      }),
    );

    await renderDiagnostic();

    expect(mockGetWords).toHaveBeenNthCalledWith(1, { level: 1, page_size: 6 });
    expect(mockGetWords).toHaveBeenNthCalledWith(2, { level: 2, page_size: 6 });
  });
});
