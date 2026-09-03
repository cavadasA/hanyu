import { act, fireEvent, render, screen } from '@testing-library/react-native';
import YouScreen from './YouScreen';

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
const mockSignOut = jest.fn();
const mockGetDashboard = jest.fn();
const mockGetLeechStates = jest.fn();
const mockSetSkillSuspended = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    settings: {
      getSettings: () => mockGetSettings(),
      updateSettings: (input: unknown) => mockUpdateSettings(input as never),
    },
    stats: {
      getDashboard: () => mockGetDashboard(),
    },
    skills: {
      getLeechStates: (skill: string) => mockGetLeechStates(skill),
      setSkillSuspended: (input: unknown) => mockSetSkillSuspended(input),
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
  support_language: 'es',
  current_level: 2,
  cards_per_day: 20,
  max_reviews_per_session: 100,
  request_retention: 0.9,
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
    mockGetDashboard.mockReset();
    mockGetLeechStates.mockReset();
    mockSetSkillSuspended.mockReset();
    mockGetLeechStates.mockResolvedValue([]);
    mockGetDashboard.mockResolvedValue({
      cards: { by_status: { mastered: 47 } },
      exercise_stats: { accuracy: 82 },
    });
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

  it('persists a support-language change', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockResolvedValue({ ...settings, support_language: 'en' });

    await renderYou();
    await fireEvent.press(screen.getByText('en'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ support_language: 'en' });
  });

  it('persists the target retention setting', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockResolvedValue({ ...settings, request_retention: 0.85 });

    await renderYou();
    await fireEvent.press(screen.getByText('Relajado (0,85)'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ request_retention: 0.85 });
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

  it('shows hero stats from the dashboard', async () => {
    mockGetSettings.mockResolvedValue(settings);

    await renderYou();

    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByText('words mastered')).toBeTruthy();
    expect(screen.getByText('HSK 2 · 82% accuracy')).toBeTruthy();
  });

  it('shows hero without accuracy when dashboard has no accuracy', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockGetDashboard.mockResolvedValue({
      cards: { by_status: { mastered: 12 } },
      exercise_stats: { accuracy: null },
    });

    await renderYou();

    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('HSK 2')).toBeTruthy();
  });

  it('degrades gracefully when dashboard fetch fails', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockGetDashboard.mockRejectedValue(new Error('Network error'));

    await renderYou();

    // Hero shows fallback dash and level without crashing
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('HSK 2')).toBeTruthy();
    // Settings still load fine
    expect(screen.getByText('Cards per day: 20')).toBeTruthy();
  });

  it('muestra el hanzi en la lista de leeches, no el id interno', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockGetLeechStates.mockResolvedValue([{
      id: 'state-1',
      target_kind: 'word',
      target_id: 42,
      skill: 'recognition',
      lapses: 8,
      word: { hanzi: '学', pinyin: 'xué', meaning_es: 'estudiar', meaning_en: 'to study' },
    }]);

    await renderYou();

    expect(screen.getByText('学 · 8 lapses')).toBeTruthy();
    expect(screen.queryByText('Word 42 · 8 lapses')).toBeNull();
  });
});
