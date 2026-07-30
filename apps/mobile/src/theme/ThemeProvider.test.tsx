import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from './ThemeProvider';

const mockGetSettings = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'user-1' } };

jest.mock('../lib/data', () => ({
  getData: () => ({ settings: { getSettings: () => mockGetSettings() } }),
}));

jest.mock('../session/SessionProvider', () => ({
  useSession: () => ({ session: mockSession }),
}));

jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: () => 'dark',
  addChangeListener: () => ({ remove: () => undefined }),
}));

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text>{`${scheme}:${colors.bg}`}</Text>;
}

async function renderTheme() {
  let result: Awaited<ReturnType<typeof render>> | undefined;

  await act(async () => {
    result = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });

  return result!;
}

describe('useTheme', () => {
  beforeEach(() => {
    mockGetSettings.mockReset();
    mockSession = { user: { id: 'user-1' } };
  });

  it('uses the stored preference', async () => {
    mockGetSettings.mockResolvedValue({ theme: 'dark' });

    await renderTheme();

    expect(screen.getByText('dark:#0f172a')).toBeTruthy();
  });

  it('falls back to light when settings cannot be read', async () => {
    mockGetSettings.mockRejectedValue(new Error('offline'));

    await renderTheme();

    expect(screen.getByText('light:#ffffff')).toBeTruthy();
  });

  it('resolves the system preference through Appearance', async () => {
    mockGetSettings.mockResolvedValue({ theme: 'system' });

    await renderTheme();

    expect(screen.getByText('dark:#0f172a')).toBeTruthy();
  });

  it('loads the signed-in user preference after authentication changes', async () => {
    mockSession = null;
    mockGetSettings.mockResolvedValue({ theme: 'dark' });
    const result = await renderTheme();

    expect(mockGetSettings).not.toHaveBeenCalled();
    expect(screen.getByText('light:#ffffff')).toBeTruthy();

    mockSession = { user: { id: 'user-1' } };
    await act(async () => {
      await result.rerender(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(mockGetSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('dark:#0f172a')).toBeTruthy();
  });
});
