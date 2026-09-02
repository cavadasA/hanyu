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
  const snapshot = {
    session_id: 's1',
    deck_id: null,
    card_ids: Array.from({ length: 25 }, (_, index) => `card-${index}`),
    index: 20,
    mode: 'recognition' as const,
    started_at: Date.now(),
    reviewed: 20,
    stats: { reviewed: 20, correct: 18, again: 2 },
  };

  it('renders banner when session is active', async () => {
    await render(
      <ActiveSessionBanner
        snapshot={snapshot}
        onContinue={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(screen.getByText(/5 cards left/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('calls onContinue when button pressed', async () => {
    const mockContinue = jest.fn();
    await render(
      <ActiveSessionBanner
        snapshot={snapshot}
        onContinue={mockContinue}
        onDiscard={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockContinue).toHaveBeenCalledTimes(1);
  });

  it('returns null when snapshot is null', async () => {
    await render(
      <ActiveSessionBanner snapshot={null} onContinue={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it('returns null when session is not active', async () => {
    await render(
      <ActiveSessionBanner
        snapshot={{ ...snapshot, card_ids: ['card-1'], index: 0, reviewed: 1 }}
        onContinue={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it('calls onDiscard when the user rejects the saved session', async () => {
    const mockDiscard = jest.fn();
    await render(
      <ActiveSessionBanner snapshot={snapshot} onContinue={jest.fn()} onDiscard={mockDiscard} />,
    );

    await fireEvent.press(screen.getByText('Discard'));
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });
});
