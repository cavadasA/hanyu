import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HskLevel, ReadingFormat } from '@hanyu/data';
import { useReadings } from '../readings/useReadings';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: HskLevel[] = [1, 2, 3];
const TOPICS: Array<{ value?: string; label: string }> = [
  { label: 'All topics' },
  { value: 'compras', label: 'compras' },
  { value: 'estudio', label: 'estudio' },
  { value: 'vida diaria', label: 'vida diaria' },
  { value: 'salud', label: 'salud' },
  { value: 'lugares', label: 'lugares' },
  { value: 'ocio', label: 'ocio' },
];
const FORMAT_LABELS: Record<ReadingFormat, string> = {
  short_text: 'Short text',
  story: 'Story',
  dialogue: 'Dialogue',
};

export function ReadingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const readings = useReadings();
  const busy = readings.loading;

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Practice</Text>
        <Text style={[styles.title, { color: colors.text }]}>Readings</Text>
      </View>

      <View style={styles.segmentGroup}>
        {LEVELS.map(level => (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityLabel={`HSK ${level}`}
            accessibilityState={{ selected: readings.level === level, disabled: busy }}
            disabled={busy}
            onPress={() => readings.setLevel(level)}
            style={[
              styles.segment,
              {
                borderColor: readings.level === level ? colors.vermilion : colors.border,
                backgroundColor: readings.level === level ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>HSK {level}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.topicGroup}>
        {TOPICS.map(topic => (
          <Pressable
            key={topic.label}
            accessibilityRole="button"
            accessibilityLabel={topic.label}
            accessibilityState={{ selected: readings.topic === topic.value, disabled: busy }}
            disabled={busy}
            onPress={() => readings.setTopic(topic.value)}
            style={[
              styles.topicButton,
              {
                borderColor: readings.topic === topic.value ? colors.vermilion : colors.border,
                backgroundColor: readings.topic === topic.value ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{topic.label}</Text>
          </Pressable>
        ))}
      </View>

      {readings.error ? <ErrorBanner message={readings.error} onRetry={readings.reload} /> : null}
      {readings.loading ? <ActivityIndicator /> : null}

      {!readings.loading && readings.readings.length === 0 ? (
        <EmptyState title="No readings yet" body="No readings match this filter." />
      ) : null}

      {readings.readings.map(reading => (
        <Pressable
          key={reading.id}
          accessibilityRole="button"
          accessibilityLabel={reading.title}
          onPress={() => router.push(`/practice/readings/${reading.id}`)}
        >
          <Card>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{reading.title}</Text>
            <Text style={{ color: colors.textMuted }}>
              HSK {reading.hsk_level} · {formatLabel(reading.format)} · {reading.topic}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function formatLabel(format: ReadingFormat) {
  return FORMAT_LABELS[format] ?? format;
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
  segmentGroup: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  topicButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
});
