import { fireEvent, render } from '@testing-library/react-native';
import { LibraryHomeScreen } from './LibraryHomeScreen';
import { PracticeHomeScreen } from './PracticeHomeScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('content tab navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('opens every content destination from its tab landing screen', async () => {
    const practice = await render(<PracticeHomeScreen />);

    await fireEvent.press(practice.getByRole('button', { name: 'Exercises' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/exercises');

    await fireEvent.press(practice.getByRole('button', { name: 'Readings' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings');

    await fireEvent.press(practice.getByRole('button', { name: 'Mistakes' }));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/mistakes');
    await practice.unmount();

    const library = await render(<LibraryHomeScreen />);
    await fireEvent.press(library.getByRole('button', { name: 'Words' }));
    expect(mockPush).toHaveBeenLastCalledWith('/library/words');

    await fireEvent.press(library.getByRole('button', { name: 'Grammar' }));
    expect(mockPush).toHaveBeenLastCalledWith('/library/grammar');
  });
});
