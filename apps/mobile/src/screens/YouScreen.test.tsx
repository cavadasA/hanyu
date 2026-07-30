import { act, fireEvent, render, screen } from '@testing-library/react-native';
import YouScreen from './YouScreen';

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
const mockSignOut = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    settings: {
      getSettings: () => mockGetSettings(),
      updateSettings: (input: unknown) => mockUpdateSettings(input as never),
    },
  }),
}));

jest.mock('../session/SessionProvider', () => ({
  useSession: () => ({
    session: { user: { id: 'user-1', email: 'learner@example.com' } },
    loading: false,
    signOut: () => mockSignOut(),
  }),
}));

const mockSetPreference = jest.fn();

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    scheme: 'light',
    preference: 'light',
    setPreference: mockSetPreference,
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

const settings = {
  user_id: 'user-1',
  theme: 'light',
  current_level: 2,
  cards_per_day: 20,
  max_reviews_per_session: 100,
  card_order: 'due',
  ai_provider: 'none',
};

async function renderYou() {
  await act(async () => {
    await render(<YouScreen />);
  });
}

describe('YouScreen', () => {
  beforeEach(() => {
    mockGetSettings.mockReset();
    mockUpdateSettings.mockReset();
    mockSignOut.mockReset();
    mockSetPreference.mockReset();
  });

  it('shows the signed-in email and the current settings', async () => {
    mockGetSettings.mockResolvedValue(settings);

    await renderYou();

    expect(screen.getByText('learner@example.com')).toBeTruthy();
    expect(screen.getByText('Cards per day: 20')).toBeTruthy();
    expect(screen.getByText('Max reviews per session: 100')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('persists a theme change and applies it immediately', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockResolvedValue({ ...settings, theme: 'dark' });

    await renderYou();
    await fireEvent.press(screen.getByText('dark'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mockSetPreference).toHaveBeenCalledWith('dark');
  });

  it('restores the previous theme when persistence fails', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockRejectedValue({ message: 'Failed to save settings' });

    await renderYou();
    await fireEvent.press(screen.getByText('dark'));

    expect(mockSetPreference.mock.calls).toEqual([['dark'], ['light']]);
    expect(screen.getByText('Failed to save settings')).toBeTruthy();
  });

  it('persists a cards-per-day change', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockResolvedValue({ ...settings, cards_per_day: 25 });

    await renderYou();
    await fireEvent.press(screen.getByLabelText('Increase cards per day'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ cards_per_day: 25 });
  });

  it('shows a retryable error and rolls back when saving fails', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockRejectedValue({ message: 'Failed to save settings' });

    await renderYou();
    await fireEvent.press(screen.getByLabelText('Increase cards per day'));

    expect(screen.getByText('Failed to save settings')).toBeTruthy();
    expect(screen.getByText('Cards per day: 20')).toBeTruthy();
  });

  it('signs the user out', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockSignOut.mockResolvedValue(undefined);

    await renderYou();
    await fireEvent.press(screen.getByText('Sign out'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
