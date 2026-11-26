import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COMPREHENSIBLE_MAX, COMPREHENSIBLE_MIN, type HskLevel, type ReadingFormat } from '@hanyu/data';
import { useReadings } from '../readings/useReadings';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: HskLevel[] = [2];
const TOPICS: Array<{ value?: string; label: string }> = [
  { label: 'Todos los temas' },
  { value: 'compras', label: 'compras' },
  { value: 'estudio', label: 'estudio' },
  { value: 'vida diaria', label: 'vida diaria' },
  { value: 'salud', label: 'salud' },
  { value: 'lugares', label: 'lugares' },
  { value: 'ocio', label: 'ocio' },
];
const FORMAT_LABELS: Record<ReadingFormat, string> = {
  short_text: 'Texto corto',
  story: 'Historia',
  dialogue: 'Diálogo',
};

export function ReadingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const readings = useReadings(undefined, 2);
  const busy = readings.loading;

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Práctica</Text>
        <Text style={[styles.title, { color: colors.text }]}>Lecturas</Text>
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
        <EmptyState title="Todavía no hay lecturas" body="Ninguna lectura coincide con este filtro." />
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
            {reading.coverage ? (
              <View style={styles.coverage}>
                <Text style={{ color: colors.textMuted }}>
                  {Math.round(reading.coverage.ratio * 100)}% conocido · {reading.coverage.unknown_count} sin conocer
                </Text>
                <Badge label={coverageLabel(reading.coverage.ratio)} />
              </View>
            ) : null}
            <View style={styles.progress}>
              <Text style={{ color: colors.textMuted }}>
                {reading.progress?.finished_at
                  ? 'Leída'
                  : reading.progress && reading.progress.last_sentence > 0
                    ? 'Empezada'
                    : 'Sin empezar'}
              </Text>
              {reading.progress?.bookmarked ? <Badge label="Marcada" /> : null}
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function formatLabel(format: ReadingFormat) {
  return FORMAT_LABELS[format] ?? format;
}

// El mismo rango que el planificador usa para decidir qué lectura proponer, y
// no una copia suya: la etiqueta que se lee antes de abrir tiene que significar
// lo mismo que el motivo que se lee en el plan del día.
function coverageLabel(ratio: number) {
  if (ratio < COMPREHENSIBLE_MIN) return 'Difícil';
  if (ratio <= COMPREHENSIBLE_MAX) return 'Cómoda';
  return 'Fácil';
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
  coverage: {
    gap: tokens.spacing.xs,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
});
