import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { Word } from '@hanyu/data';
import { WordSheet } from './WordSheet';

const mockAddCard = jest.fn();
const mockGetSettings = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
    settings: {
      getSettings: () => mockGetSettings(),
    },
  }),
}));

const huan: Word = {
  id: 1,
  hanzi: '还',
  traditional: '還',
  pinyin: 'huán',
  meaning_en: 'to pay back; to return',
  meaning_es: 'devolver; restituir',
  classifier: null,
  hsk_level: 3,
  pos: 'verb',
  frequency: 1,
  in_srs: false,
};

describe('WordSheet', () => {
  beforeEach(() => {
    mockAddCard.mockReset();
    mockGetSettings.mockReset();
  });

  it('muestra la glosa española cuando el idioma de apoyo es español', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(<WordSheet word={huan} text="还" onClose={() => {}} />);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('devolver; restituir')).toBeTruthy());
    expect(screen.queryByText('to pay back; to return')).toBeNull();
  });

  it('muestra la glosa inglesa cuando el idioma de apoyo es inglés', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'en' });

    await act(async () => {
      render(<WordSheet word={huan} text="还" onClose={() => {}} />);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('to pay back; to return')).toBeTruthy());
  });

  it('muestra la forma tradicional cuando difiere de la simplificada', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(<WordSheet word={huan} text="还" onClose={() => {}} />);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('繁 還')).toBeTruthy());
  });
});
