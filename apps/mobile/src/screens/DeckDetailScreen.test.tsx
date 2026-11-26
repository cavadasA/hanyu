import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DeckDetailScreen } from './DeckDetailScreen';

const mockGetDecks = jest.fn();
const mockGetDeckCards = jest.fn();
const mockRemoveWordFromDeck = jest.fn();
const mockUpdateDeck = jest.fn();
const mockDeleteDeck = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    decks: {
      getDecks: () => mockGetDecks(),
      getDeckCards: (...args: unknown[]) => mockGetDeckCards(...args),
      removeWordFromDeck: (...args: unknown[]) => mockRemoveWordFromDeck(...args),
      updateDeck: (...args: unknown[]) => mockUpdateDeck(...args),
      deleteDeck: (...args: unknown[]) => mockDeleteDeck(...args),
    },
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useLocalSearchParams: () => ({ id: 'd1' }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ push: mockPush, back: mockBack }),
  };
});

const deck = {
  id: 'd1',
  user_id: 'u1',
  name: 'Travel',
  description: null,
  is_active: true,
  is_default: false,
  source_template_id: null,
  sort_order: 0,
  word_count: 2,
  due_count: 0,
};

const word = {
  word_id: 5,
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning_en: 'hello',
  hsk_level: 1,
};

async function renderDetail() {
  await act(async () => {
    await render(<DeckDetailScreen />);
  });
}

describe('DeckDetailScreen', () => {
  beforeEach(() => {
    mockGetDecks.mockReset();
    mockGetDeckCards.mockReset();
    mockRemoveWordFromDeck.mockReset();
    mockUpdateDeck.mockReset();
    mockDeleteDeck.mockReset();
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('shows deck words and starts a focused review', async () => {
    mockGetDecks.mockResolvedValue([deck]);
    mockGetDeckCards.mockResolvedValue([word]);

    await renderDetail();

    expect(screen.getByText('你好')).toBeTruthy();
    await fireEvent.press(screen.getByText('Repasar este mazo'));
    expect(mockPush).toHaveBeenCalledWith('/cards?deckId=d1');
  });

  it('removes a word from the deck', async () => {
    mockGetDecks.mockResolvedValue([deck]);
    mockGetDeckCards.mockResolvedValue([word]);
    mockRemoveWordFromDeck.mockResolvedValue({});

    await renderDetail();

    await fireEvent.press(screen.getByLabelText('Quitar 你好'));
    await waitFor(() => expect(mockRemoveWordFromDeck).toHaveBeenCalledWith('d1', 5));
    expect(screen.queryByText('你好')).toBeNull();
  });

  it('renames the deck from the header input', async () => {
    mockGetDecks.mockResolvedValue([deck]);
    mockGetDeckCards.mockResolvedValue([]);
    mockUpdateDeck.mockResolvedValue({});

    await renderDetail();

    const input = screen.getByTestId('deck-name-input');
    await fireEvent.changeText(input, 'Around the world');
    await fireEvent(input, 'submitEditing');

    await waitFor(() =>
      expect(mockUpdateDeck).toHaveBeenCalledWith('d1', { name: 'Around the world' }),
    );
  });
});