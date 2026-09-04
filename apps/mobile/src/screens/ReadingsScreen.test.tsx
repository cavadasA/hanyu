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
});
