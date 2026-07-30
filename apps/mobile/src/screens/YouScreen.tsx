import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import {
  toUserMessage,
  type AiProvider,
  type CardOrder,
  type ThemePreference,
  type UserSettings,
} from '@hanyu/data';
import { getData } from '../lib/data';
import { useSession } from '../session/SessionProvider';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { NumberRow } from '../ui/NumberRow';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const ORDERS: readonly CardOrder[] = ['due', 'frequency'];
const PROVIDERS: readonly AiProvider[] = ['none', 'deepseek', 'gemini'];
const LEVELS = ['1', '2', '3', '4', '5', '6'] as const;

export default function YouScreen() {
  const { colors, setPreference } = useTheme();
  const { session, signOut } = useSession();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const loaded = (await getData().settings.getSettings()) as UserSettings;
      setSettings(loaded);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<UserSettings>) {
    if (saving) {
      return;
    }

    const previous = settings;
    const previousTheme = previous?.theme;
    setSaving(true);
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setError('');

    if (patch.theme) {
      setPreference(patch.theme);
    }

    try {
      const saved = (await getData().settings.updateSettings(patch)) as UserSettings;
      setSettings(saved);
    } catch (caught) {
      setSettings(previous);
      if (patch.theme && previousTheme) {
        setPreference(previousTheme);
      }
      setError(toUserMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>You</Text>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <Card>
        <Text style={[styles.label, { color: colors.textMuted }]}>Signed in as</Text>
        <Text style={[styles.value, { color: colors.text }]}>{session?.user?.email ?? '-'}</Text>
      </Card>

      {settings ? (
        <>
          <Card>
            <OptionRow
              label="Theme"
              value={settings.theme}
              options={THEMES}
              onChange={(theme) => save({ theme })}
              disabled={saving}
            />
          </Card>

          <Card>
            <OptionRow
              label="Current level"
              value={String(settings.current_level) as (typeof LEVELS)[number]}
              options={LEVELS}
              onChange={(level) => save({ current_level: Number(level) })}
              disabled={saving}
            />
          </Card>

          <Card>
            <NumberRow
              label="Cards per day"
              value={settings.cards_per_day}
              min={1}
              max={100}
              step={5}
              onChange={(cards_per_day) => save({ cards_per_day })}
              disabled={saving}
            />
            <NumberRow
              label="Max reviews per session"
              value={settings.max_reviews_per_session}
              min={1}
              max={300}
              step={10}
              onChange={(max_reviews_per_session) => save({ max_reviews_per_session })}
              disabled={saving}
            />
          </Card>

          <Card>
            <OptionRow
              label="Card order"
              value={settings.card_order}
              options={ORDERS}
              onChange={(card_order) => save({ card_order })}
              disabled={saving}
            />
          </Card>

          <Card>
            <OptionRow
              label="AI provider"
              value={settings.ai_provider}
              options={PROVIDERS}
              onChange={(ai_provider) => save({ ai_provider })}
              disabled={saving}
            />
          </Card>
        </>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  label: { fontSize: tokens.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  value: { fontSize: tokens.fontSize.md },
});
