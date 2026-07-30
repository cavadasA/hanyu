import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { GrammarDetailScreen } from './GrammarDetailScreen';
import { GrammarScreen } from './GrammarScreen';

const mockGetGrammar = jest.fn();
const mockGetGrammarPoint = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    grammar: {
      getGrammar: (...args: unknown[]) => mockGetGrammar(...args),
      getGrammarPoint: (...args: unknown[]) => mockGetGrammarPoint(...args),
    },
  }),
}));

describe('Grammar screens', () => {
  beforeEach(() => {
    mockGetGrammar.mockReset();
    mockGetGrammarPoint.mockReset();
    mockPush.mockReset();
    mockParams = {};
  });

  it('filters grammar points and navigates with the selected level', async () => {
    mockGetGrammar.mockResolvedValue([
      {
        id: 3,
        hsk_level: 2,
        title: '因为...所以...',
        pattern: null,
        explanation: 'Cause and result.',
        examples: [],
      },
    ]);
    const view = await render(<GrammarScreen />);

    await waitFor(() => expect(mockGetGrammar).toHaveBeenCalledWith(1));
    await fireEvent.press(view.getByRole('button', { name: 'HSK 2' }));
    await waitFor(() => expect(mockGetGrammar).toHaveBeenLastCalledWith(2));

    await waitFor(() => expect(view.getByText('因为...所以...')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: '因为...所以...' }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/library/grammar/[id]',
      params: { id: '3', level: '2' },
    });
  });

  it('renders grammar detail as plain text and omits null fields', async () => {
    mockParams = { id: '3', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 3,
      hsk_level: 2,
      title: '因为...所以...',
      pattern: '因为 + reason，所以 + result',
      explanation: null,
      examples: [
        {
          chinese: '因为下雨，所以我不去。',
          pinyin: 'yinwei xiayu, suoyi wo bu qu.',
          english: 'Because it rains, I am not going.',
        },
      ],
    });
    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(view.getByText('因为...所以...')).toBeTruthy());
    expect(view.getByText('因为 + reason，所以 + result')).toBeTruthy();
    expect(view.getByText('因为下雨，所以我不去。')).toBeTruthy();
    expect(view.getByText('yinwei xiayu, suoyi wo bu qu.')).toBeTruthy();
    expect(view.getByText('Because it rains, I am not going.')).toBeTruthy();
    expect(view.queryByText('null')).toBeNull();
    expect(mockGetGrammarPoint).toHaveBeenCalledWith(2, 3);
  });
});
