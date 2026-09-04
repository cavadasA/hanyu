import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MistakesScreen } from './MistakesScreen';

const mockGetMistakes = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    exercises: {
      getMistakes: (...args: unknown[]) => mockGetMistakes(...args),
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

async function renderMistakes() {
  await act(async () => {
    render(<MistakesScreen />);
  });
}

describe('MistakesScreen', () => {
  beforeEach(() => {
    mockGetMistakes.mockReset();
    mockPush.mockReset();
  });

  it('lista lo fallado y cuántas veces', async () => {
    mockGetMistakes.mockResolvedValue([
      {
        target_id: 42,
        word: { hanzi: '茶', pinyin: 'chá', meaning_es: 'té', meaning_en: 'tea' },
        misses: 3,
        hits_since: 1,
        distinct_days: 1,
      },
    ]);

    await renderMistakes();

    await waitFor(() => expect(screen.getByText('茶')).toBeTruthy());
    expect(screen.queryByText('Palabra 42')).toBeNull();
    expect(screen.getByText('3 fallos · 1 acierto desde entonces')).toBeTruthy();
  });

  it('permite practicar la cola desde la pantalla', async () => {
    mockGetMistakes.mockResolvedValue([
      { target_id: 42, misses: 1, hits_since: 0, distinct_days: 0 },
    ]);

    await renderMistakes();
    await waitFor(() => expect(screen.getByText('Practicar')).toBeTruthy());
    await fireEvent.press(screen.getByText('Practicar'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/practice/exercises',
      params: { mistakes: '42' },
    });
  });

  it('explica cuando todavía no hay errores pendientes', async () => {
    mockGetMistakes.mockResolvedValue([]);

    await renderMistakes();

    await waitFor(() => expect(screen.getByText('No hay errores pendientes')).toBeTruthy());
  });
});
