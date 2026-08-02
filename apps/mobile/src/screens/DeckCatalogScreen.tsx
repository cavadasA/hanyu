import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type DeckTemplate } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function DeckCatalogScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [templates, setTemplates] = useState<DeckTemplate[] | null>(null);
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await getData().decks.getDeckTemplates();
      setTemplates(list);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function add(template: DeckTemplate) {
    setAdding((current) => ({ ...current, [template.id]: true }));
    setError(null);
    try {
      await getData().decks.addDeckFromTemplate(template.id);
      router.back();
    } catch (caught) {
      setError(toUserMessage(caught));
      setAdding((current) => ({ ...current, [template.id]: false }));
    }
  }

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Decks</Text>
        <Text style={[styles.title, { color: colors.text }]}>Catalog</Text>
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {templates === null ? <ActivityIndicator /> : null}

      {(templates ?? []).map((template) => (
        <Card key={template.id}>
          <Text style={[styles.name, { color: colors.text }]}>{template.name}</Text>
          {template.description ? (
            <Text style={[styles.description, { color: colors.textMuted }]}>
              {template.description}
            </Text>
          ) : null}
          <Button
            label="Add"
            variant="primary"
            busy={adding[template.id]}
            onPress={() => add(template)}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    marginTop: tokens.spacing.xs,
  },
  name: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  description: {
    fontSize: tokens.fontSize.sm,
  },
});