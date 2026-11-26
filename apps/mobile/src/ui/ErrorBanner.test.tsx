import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorBanner } from './ErrorBanner';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      bg: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#e5e7eb',
      vermilion: '#e23d28',
      gold: '#d4a017',
      onAccent: '#ffffff',
    },
  }),
}));

describe('ErrorBanner', () => {
  it('shows the message', async () => {
    await render(<ErrorBanner message="Failed to load due cards" />);
    expect(screen.getByText('Failed to load due cards')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = jest.fn();

    await render(<ErrorBanner message="No connection." onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry button when no handler is given', async () => {
    await render(<ErrorBanner message="No connection." />);
    expect(screen.queryByText('Reintentar')).toBeNull();
  });
});
