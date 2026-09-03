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
    mockGetWords.mockResolvedValue({
      items: [
        { id: 1, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_es: 'hola', hsk_level: 1 },
        { id: 2, hanzi: '爱情', pinyin: 'àiqíng', meaning_es: 'amor', hsk_level: 2 },
      ],
    });
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
});
