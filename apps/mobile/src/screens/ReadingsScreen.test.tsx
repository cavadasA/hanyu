import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReadingsScreen } from './ReadingsScreen';

const mockGetReadings = jest.fn();
const mockGenerateReading = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../lib/data', () => ({
  getData: () => ({
    readings: {
      getReadings: (...args: unknown[]) => mockGetReadings(...args),
      generateReading: (...args: unknown[]) => mockGenerateReading(...args),
    },
  }),
}));

describe('ReadingsScreen', () => {
  beforeEach(() => {
    mockGetReadings.mockReset();
    mockGenerateReading.mockReset();
    mockPush.mockReset();
  });

  it('filters, opens an existing reading, and navigates to a generated reading', async () => {
    mockGetReadings.mockResolvedValue({
      readings: [
        {
          id: 'reading-1',
          title: 'Ordering tea',
          hsk_level: 1,
          format: 'short_text',
          generated_at: '2026-07-30T10:00:00Z',
        },
      ],
    });
    mockGenerateReading.mockResolvedValue({
      id: 'reading-2',
      title: 'Market story',
      hsk_level: 2,
      format: 'story',
      generated_at: '2026-07-30T11:00:00Z',
      content: '你好。',
      pinyin_text: 'ni hao.',
      questions: [],
      tokens: [],
    });

    const view = await render(<ReadingsScreen />);

    await waitFor(() => expect(view.getByText('Ordering tea')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Ordering tea' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings/reading-1');

    await fireEvent.press(view.getByRole('button', { name: 'HSK 2' }));
    await fireEvent.press(view.getByRole('button', { name: 'Story' }));
    await waitFor(() => expect(mockGetReadings).toHaveBeenLastCalledWith({
      level: 2,
      format: 'story',
    }));

    await fireEvent.press(view.getByRole('button', { name: 'Generate reading' }));
    await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith('/practice/readings/reading-2'));
    expect(mockGenerateReading).toHaveBeenCalledWith(2, 'story');
  });
});
