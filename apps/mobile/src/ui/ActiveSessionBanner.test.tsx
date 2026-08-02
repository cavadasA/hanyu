import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActiveSessionBanner } from './ActiveSessionBanner';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      vermilion: '#c93624',
      surface: '#f9fafb',
      border: '#e5e7eb',
      text: '#111827',
      textMuted: '#6b7280',
      onAccent: '#ffffff',
    },
  }),
}));

describe('ActiveSessionBanner', () => {
  it('renders banner when session is active', async () => {
    await render(
      <ActiveSessionBanner
        snapshot={{ active: true, total: 25, reviewed: 20, mode: 'recognition', startedAt: 0 }}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByText(/5 cards left/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('calls onContinue when button pressed', async () => {
    const mockContinue = jest.fn();
    await render(
      <ActiveSessionBanner
        snapshot={{ active: true, total: 25, reviewed: 20, mode: 'recognition', startedAt: 0 }}
        onContinue={mockContinue}
      />,
    );
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockContinue).toHaveBeenCalledTimes(1);
  });

  it('returns null when snapshot is null', async () => {
    await render(<ActiveSessionBanner snapshot={null} onContinue={jest.fn()} />);
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it('returns null when session is not active', async () => {
    await render(
      <ActiveSessionBanner
        snapshot={{ active: false, total: 25, reviewed: 25, mode: 'recognition', startedAt: 0 }}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.queryByText(/left/)).toBeNull();
  });
});
