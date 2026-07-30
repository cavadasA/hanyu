import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import type { ThemePreference } from '@hanyu/data';
import { getData } from '../lib/data';
import { useSession } from '../session/SessionProvider';
import { tokens, type ThemeColors } from './tokens';

interface ThemeValue {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  scheme: 'light',
  colors: tokens.colors.light,
  preference: 'light',
  setPreference: () => undefined,
});

function resolve(preference: ThemePreference, system: 'light' | 'dark'): 'light' | 'dark' {
  return preference === 'system' ? system : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [preference, setPreference] = useState<ThemePreference>('light');
  const [system, setSystem] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    let disposed = false;
    const userId = session?.user?.id;

    if (!userId) {
      setPreference('light');
      return;
    }

    getData()
      .settings.getSettings()
      .then((settings) => {
        if (!disposed && settings?.theme) {
          setPreference(settings.theme as ThemePreference);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'dark' ? 'dark' : 'light');
    });

    return () => subscription.remove();
  }, []);

  const scheme = resolve(preference, system);

  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: tokens.colors[scheme], preference, setPreference }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
