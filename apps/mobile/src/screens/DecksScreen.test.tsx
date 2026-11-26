import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DecksScreen } from './DecksScreen';

const mockGetDecks = jest.fn();
const mockUpdateDeck = jest.fn();
const mockCreateDeck = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    decks: {
      getDecks: () => mockGetDecks(),
      updateDeck: (...args: unknown[]) => mockUpdateDeck(...args),
      createDeck: (...args: unknown[]) => mockCreateDeck(...args),
    },
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ push: mockPush }),
  };
});

const deck = {
  id: 'd1',
  name: 'HSK 1',
  description: null,
  is_active: true,
  is_default: false,
  source_template_id: null,
  sort_order: 0,
  word_count: 150,
  due_count: 12,
};

async function renderDecks() {
  await act(async () => {
    await render(<DecksScreen />);
  });
}

describe('DecksScreen', () => {
  beforeEach(() => {
    mockGetDecks.mockReset();
    mockUpdateDeck.mockReset();
    mockCreateDeck.mockReset();
    mockPush.mockReset();
  });

  it('lists the user decks with counts', async () => {
    mockGetDecks.mockResolvedValue([deck]);

    await renderDecks();

    expect(screen.getByText('HSK 1')).toBeTruthy();
    expect(screen.getByText('150 words · 12 due')).toBeTruthy();
  });

  it('opens the catalog from the header and the empty state', async () => {
    mockGetDecks.mockResolvedValue([]);

    await renderDecks();

    await fireEvent.press(screen.getByText('Catálogo'));
    expect(mockPush).toHaveBeenLastCalledWith('/library/decks/catalog');

    await fireEvent.press(screen.getByText('Añadir del catálogo'));
    expect(mockPush).toHaveBeenLastCalledWith('/library/decks/catalog');
  });

  it('toggles deck activation optimistically', async () => {
    mockGetDecks.mockResolvedValue([deck]);
    mockUpdateDeck.mockResolvedValue({});

    await renderDecks();

    await fireEvent.press(screen.getByLabelText('Pausar HSK 1'));
    expect(mockUpdateDeck).toHaveBeenCalledWith('d1', { is_active: false });
    await waitFor(() => expect(screen.getByLabelText('Activar HSK 1')).toBeTruthy());
  });

  it('navigates to the detail screen when a deck is pressed', async () => {
    mockGetDecks.mockResolvedValue([deck]);

    await renderDecks();

    await fireEvent.press(screen.getByLabelText('Abrir HSK 1'));
    expect(mockPush).toHaveBeenLastCalledWith('/library/decks/d1');
  });

  it('creates a new deck and opens its detail', async () => {
    mockGetDecks.mockResolvedValue([]);
    mockCreateDeck.mockResolvedValue({ id: 'd9', name: 'New deck' });

    await renderDecks();

    await fireEvent.press(screen.getByText('New deck'));
    await waitFor(() => expect(mockCreateDeck).toHaveBeenCalled());
    expect(mockPush).toHaveBeenLastCalledWith('/library/decks/d9');
  });
});