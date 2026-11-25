import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { GrammarDetailScreen } from './GrammarDetailScreen';
import { GrammarScreen } from './GrammarScreen';

const mockGetGrammar = jest.fn();
const mockGetGrammarPoint = jest.fn();
const mockGetGrammarStudyState = jest.fn();
const mockMarkGrammarStudied = jest.fn();
const mockGetGrammarReadings = jest.fn();
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
      getGrammarStudyState: (...args: unknown[]) => mockGetGrammarStudyState(...args),
      markGrammarStudied: (...args: unknown[]) => mockMarkGrammarStudied(...args),
      getGrammarReadings: (...args: unknown[]) => mockGetGrammarReadings(...args),
    },
  }),
}));

describe('Grammar screens', () => {
  beforeEach(() => {
    mockGetGrammar.mockReset();
    mockGetGrammarPoint.mockReset();
    mockGetGrammarStudyState.mockReset();
    mockMarkGrammarStudied.mockReset();
    mockPush.mockReset();
    mockParams = {};
    mockGetGrammarStudyState.mockResolvedValue(false);
    mockGetGrammarReadings.mockReset();
    mockGetGrammarReadings.mockResolvedValue([]);
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
          zh: '因为下雨，所以我不去。',
          pinyin: 'yinwei xiayu, suoyi wo bu qu.',
          es: 'Como llueve, no voy.',
        },
      ],
    });
    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(view.getByText('因为...所以...')).toBeTruthy());
    expect(view.getByText('因为 + reason，所以 + result')).toBeTruthy();
    expect(view.getByText('因为下雨，所以我不去。')).toBeTruthy();
    expect(view.getByText('yinwei xiayu, suoyi wo bu qu.')).toBeTruthy();
    expect(view.getByText('Como llueve, no voy.')).toBeTruthy();
    expect(view.queryByText('null')).toBeNull();
    expect(mockGetGrammarPoint).toHaveBeenCalledWith(2, 3);
    await fireEvent.press(view.getByText('Mark as studied'));
    expect(mockMarkGrammarStudied).toHaveBeenCalledWith(3);
    await waitFor(() => expect(view.getByText('Studied')).toBeTruthy());
  });

  it('muestra el estado persistido y evita marcar dos veces', async () => {
    mockParams = { id: '3', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 3,
      hsk_level: 2,
      title: '因为...所以...',
      pattern: null,
      explanation: null,
      examples: [],
    });
    mockGetGrammarStudyState.mockResolvedValue(true);

    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(view.getByText('Studied')).toBeTruthy());
    const studiedButton = view.getByRole('button', { name: 'Studied' });
    expect(studiedButton).toBeDisabled();
    expect(mockMarkGrammarStudied).not.toHaveBeenCalled();
  });

  it('pinta hanzi y traducción de los ejemplos, y los errores típicos', async () => {
    mockParams = { id: '4', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 4,
      hsk_level: 2,
      code: '2.1.1',
      title: '喝',
      pattern: null,
      explanation: 'Explicación.',
      examples: [{ zh: '我喝茶。', pinyin: 'Wǒ hē chá.', es: 'Bebo té.' }],
      common_errors: [{ wrong: '我喝了茶', right: '我喝茶。', why: 'Falta el punto.' }],
      see_also: [{ hsk_level: 2, code: '2.2.1' }],
    });
    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(view.getAllByText('我喝茶。')).toHaveLength(2));
    expect(view.getByText('Bebo té.')).toBeTruthy();
    expect(view.getByText('Ejemplos')).toBeTruthy();
    expect(view.getByText('Errores típicos')).toBeTruthy();
    expect(view.getByText('我喝了茶')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(view.getByText('Falta el punto.')).toBeTruthy();
    expect(view.getByText('Ver también')).toBeTruthy();
  });

  it('oculta las secciones sin contenido', async () => {
    mockParams = { id: '5', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 5, hsk_level: 2, code: 'x', title: 'X', pattern: null, explanation: null,
      examples: [], common_errors: [], see_also: [],
    });
    const view = await render(<GrammarDetailScreen />);
    await waitFor(() => expect(view.getByText('X')).toBeTruthy());
    for (const t of ['Estructura', 'Explicación', 'Ejemplos', 'Errores típicos', 'Ver también']) {
      expect(view.queryByText(t)).toBeNull();
    }
  });

  it('no pinta «En lecturas» si ninguna lectura usa el punto', async () => {
    mockParams = { id: '6', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 6, hsk_level: 2, code: '2.2.1', title: '动词重叠', pattern: null, explanation: null,
      examples: [], common_errors: [], see_also: [],
    });
    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(mockGetGrammarReadings).toHaveBeenCalledWith(2, '2.2.1'));
    expect(view.queryByText('En lecturas')).toBeNull();
  });

  it('enlaza las lecturas que usan el punto y navega a la lectura', async () => {
    mockParams = { id: '6', level: '2' };
    mockGetGrammarPoint.mockResolvedValue({
      id: 6, hsk_level: 2, code: '2.2.1', title: '动词重叠', pattern: null, explanation: null,
      examples: [], common_errors: [], see_also: [],
    });
    mockGetGrammarReadings.mockResolvedValue([
      { slug: 'home-01-morning', title: '星期天的早上', sentence: '我看看。' },
    ]);
    const view = await render(<GrammarDetailScreen />);

    await waitFor(() => expect(view.getByText('En lecturas')).toBeTruthy());
    expect(view.getByText('我看看。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '星期天的早上' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings/home-01-morning');
  });
});
