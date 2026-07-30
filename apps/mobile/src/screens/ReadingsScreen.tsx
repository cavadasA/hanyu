import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HskLevel, ReadingFormat } from '@hanyu/data';
import { useReadings } from '../readings/useReadings';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: HskLevel[] = [1, 2, 3];
const FORMATS: Array<{ value: ReadingFormat; label: string }> = [
  { value: 'short_text', label: 'Short text' },
  { value: 'story', label: 'Story' },
  { value: 'dialogue', label: 'Dialogue' },
];

export function ReadingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const readings = useReadings();
  const busy = readings.loading || readings.generating;

  async function generate() {
    const detail = await readings.generate();
    if (detail) {
      router.push(`/practice/readings/${detail.id}`);
    }
  }

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

      <View style={styles.formatGroup}>
        {FORMATS.map(format => (
          <Pressable
            key={format.value}
            accessibilityRole="button"
            accessibilityLabel={format.label}
            accessibilityState={{ selected: readings.format === format.value, disabled: busy }}
            disabled={busy}
            onPress={() => readings.setFormat(format.value)}
            style={[
              styles.formatButton,
              {
                borderColor: readings.format === format.value ? colors.vermilion : colors.border,
                backgroundColor: readings.format === format.value ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{format.label}</Text>
          </Pressable>
        ))}
      </View>

      <Button
        label={readings.generating ? 'Generating...' : 'Generate reading'}
        onPress={generate}
        disabled={readings.generating}
      />

      {readings.error ? <ErrorBanner message={readings.error} onRetry={readings.reload} /> : null}
      {readings.loading ? <ActivityIndicator /> : null}

      {!readings.loading && readings.readings.length === 0 ? (
        <EmptyState title="No readings yet" body="Generate one for this HSK level." />
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
              HSK {reading.hsk_level} · {formatLabel(reading.format)}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function formatLabel(format: ReadingFormat) {
  return FORMATS.find(item => item.value === format)?.label ?? format;
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
  formatGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  formatButton: {
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
