import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReadingsScreen } from './ReadingsScreen';

const mockGetReadings = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    readings: {
      getReadings: (...args: unknown[]) => mockGetReadings(...args),
    },
  }),
}));

describe('ReadingsScreen', () => {
  beforeEach(() => {
    mockGetReadings.mockReset();
    mockPush.mockReset();
  });

  it('filters the catalog and opens an existing reading', async () => {
    mockGetReadings.mockResolvedValue([
        {
          id: 'reading-1',
          slug: 'reading-1',
          title: 'Ordering tea',
          hsk_level: 1,
          format: 'short_text',
          topic: 'compras',
          series: 'mercado',
          series_index: 1,
          audio_kind: 'tts',
          audio_url: null,
        },
      ],
    );

    const view = await render(<ReadingsScreen />);

    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Ordering tea' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings/reading-1');

    await fireEvent.press(view.getByRole('button', { name: 'HSK 2' }));
    await fireEvent.press(view.getByRole('button', { name: 'compras' }));
    await waitFor(() => expect(mockGetReadings).toHaveBeenLastCalledWith({
      level: 2,
      topic: 'compras',
    }));
    expect(view.queryByRole('button', { name: 'Generate reading' })).toBeNull();
    expect(view.queryByRole('button', { name: 'HSK 1' })).toBeNull();
    expect(view.queryByRole('button', { name: 'HSK 3' })).toBeNull();
  });

  it('muestra cobertura y estado de progreso sin ocultar lecturas difíciles', async () => {
    mockGetReadings.mockResolvedValue([
      {
        id: 'reading-1',
        slug: 'reading-1',
        title: 'Una lectura difícil',
        hsk_level: 2,
        format: 'short_text',
        topic: 'compras',
        series: null,
        series_index: null,
        audio_kind: 'tts',
        audio_url: null,
        coverage: { ratio: 0.5, known_count: 1, unknown_count: 1 },
        progress: { reading_slug: 'reading-1', bookmarked: true, last_sentence: 2, finished_at: null, updated_at: '2026-09-05T00:00:00Z' },
      },
    ]);

    const view = await render(<ReadingsScreen />);

    await waitFor(() => expect(view.getByText('50% known · 1 not yet known')).toBeTruthy());
    expect(view.getByText('Difficult')).toBeTruthy();
    expect(view.getByText('Started')).toBeTruthy();
    expect(view.getByText('Bookmarked')).toBeTruthy();
  });

  it('distingue una cobertura confortable de una cobertura casi completa', async () => {
    mockGetReadings.mockResolvedValue([
      {
        id: 'reading-1', slug: 'reading-1', title: 'Confortable', hsk_level: 2,
        format: 'short_text', topic: 'compras', series: null, series_index: null,
        audio_kind: 'tts', audio_url: null,
        coverage: { ratio: 0.93, known_count: 93, unknown_count: 7 },
      },
      {
        id: 'reading-2', slug: 'reading-2', title: 'Casi completa', hsk_level: 2,
        format: 'short_text', topic: 'compras', series: null, series_index: null,
        audio_kind: 'tts', audio_url: null,
        coverage: { ratio: 0.99, known_count: 99, unknown_count: 1 },
      },
    ]);

    const view = await render(<ReadingsScreen />);

    await waitFor(() => expect(view.getByText('Casi completa')).toBeTruthy());
    expect(view.getByText('Comfortable')).toBeTruthy();
    expect(view.getByText('Easy')).toBeTruthy();
  });
});
