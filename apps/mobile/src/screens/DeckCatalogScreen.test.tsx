import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeckCatalogScreen } from './DeckCatalogScreen';

const mockGetDeckTemplates = jest.fn();
const mockAddDeckFromTemplate = jest.fn();
const mockBack = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    decks: {
      getDeckTemplates: () => mockGetDeckTemplates(),
      addDeckFromTemplate: (...args: unknown[]) => mockAddDeckFromTemplate(...args),
    },
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ back: mockBack, push: jest.fn() }),
  };
});

const template = {
  id: 't1',
  slug: 'hsk1',
  name: 'HSK 1',
  description: 'Foundation vocabulary.',
  category: 'hsk',
  hsk_level: 1,
  sort_order: 10,
};

async function renderCatalog() {
  await act(async () => {
    await render(<DeckCatalogScreen />);
  });
}

describe('DeckCatalogScreen', () => {
  beforeEach(() => {
    mockGetDeckTemplates.mockReset();
    mockAddDeckFromTemplate.mockReset();
    mockBack.mockReset();
  });

  it('lists catalog templates with an add action', async () => {
    mockGetDeckTemplates.mockResolvedValue([template]);

    await renderCatalog();

    expect(screen.getByText('HSK 1')).toBeTruthy();
    expect(screen.getByText('Foundation vocabulary.')).toBeTruthy();
  });

  it('adds a template deck on press and goes back', async () => {
    mockGetDeckTemplates.mockResolvedValue([template]);
    mockAddDeckFromTemplate.mockResolvedValue({ deck_id: 'd9', inserted: 150 });

    await renderCatalog();

    await act(async () => {
      await fireEvent.press(screen.getByText('Add'));
    });

    expect(mockAddDeckFromTemplate).toHaveBeenCalledWith('t1');
    expect(mockBack).toHaveBeenCalled();
  });
});