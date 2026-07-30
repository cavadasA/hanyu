import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type GrammarPoint, type HskLevel } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: HskLevel[] = [1, 2, 3];

export function GrammarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const grammarApi = useRef(getData().grammar);
  const [level, setLevel] = useState<HskLevel>(1);
  const [points, setPoints] = useState<GrammarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextLevel = level) {
    setLoading(true);
    setError(null);
    try {
      setPoints(await grammarApi.current.getGrammar(nextLevel));
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(level);
  }, [level]);

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Library</Text>
        <Text style={[styles.title, { color: colors.text }]}>Grammar</Text>
      </View>

      <View style={styles.filters}>
        {LEVELS.map(value => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`HSK ${value}`}
            accessibilityState={{ selected: level === value }}
            onPress={() => setLevel(value)}
            style={[
              styles.filter,
              {
                borderColor: level === value ? colors.vermilion : colors.border,
                backgroundColor: level === value ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>HSK {value}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => load(level)} /> : null}
      {loading ? <ActivityIndicator /> : null}

      {!loading && points.length === 0 ? (
        <EmptyState title="No grammar points" body="Try a different HSK level." />
      ) : null}

      {points.map(point => (
        <Pressable
          key={point.id}
          accessibilityRole="button"
          accessibilityLabel={point.title}
          onPress={() =>
            router.push({
              pathname: '/library/grammar/[id]',
              params: { id: String(point.id), level: String(level) },
            })
          }
        >
          <Card>
            <View style={styles.pointHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{point.title}</Text>
              <Badge label={`HSK ${point.hsk_level}`} />
            </View>
            {point.pattern ? (
              <Text style={[styles.pattern, { color: colors.textMuted }]}>{point.pattern}</Text>
            ) : null}
          </Card>
        </Pressable>
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
  filters: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  filter: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  cardTitle: {
    flex: 1,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  pattern: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
  },
});
