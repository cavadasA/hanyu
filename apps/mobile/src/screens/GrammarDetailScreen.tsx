import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type GrammarPoint, type HskLevel } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function GrammarDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; level?: string | string[] }>();
  const id = parseNumber(Array.isArray(params.id) ? params.id[0] : params.id);
  const level = parseLevel(Array.isArray(params.level) ? params.level[0] : params.level);
  const grammarApi = useRef(getData().grammar);
  const { colors } = useTheme();
  const [point, setPoint] = useState<GrammarPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id || !level) {
      setError('Invalid grammar point');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setPoint(await grammarApi.current.getGrammarPoint(level, id));
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function markStudied() {
    if (!point || saving) return;
    setSaving(true);
    setError(null);
    try {
      await getData().grammar.markGrammarStudied(point.id);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id, level]);

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {point ? (
        <>
          <View>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Grammar</Text>
            <Text style={[styles.title, { color: colors.text }]}>{point.title}</Text>
          </View>
          <Badge label={`HSK ${point.hsk_level}`} />
          <Button
            label={saving ? 'Saving...' : 'Mark as studied'}
            variant="outline"
            onPress={() => void markStudied()}
            disabled={saving}
          />

          {point.pattern ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pattern</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>{point.pattern}</Text>
            </Card>
          ) : null}

          {point.explanation ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Explanation</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>{point.explanation}</Text>
            </Card>
          ) : null}

          {point.examples.length > 0 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Examples</Text>
              {point.examples.map((example, index) => (
                <View key={`${point.id}-${index}`} style={styles.example}>
                  {example.chinese ? (
                    <Text style={[styles.chinese, { color: colors.text }]}>{example.chinese}</Text>
                  ) : null}
                  {example.pinyin ? (
                    <Text style={[styles.body, { color: colors.textMuted }]}>{example.pinyin}</Text>
                  ) : null}
                  {example.english ? (
                    <Text style={[styles.body, { color: colors.textMuted }]}>{example.english}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function parseNumber(value: string | undefined) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseLevel(value: string | undefined): HskLevel | null {
  const parsed = parseNumber(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
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
  sectionTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  body: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  example: {
    gap: tokens.spacing.xs,
  },
  chinese: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
});
