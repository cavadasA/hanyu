import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExerciseType, HskLevel } from '@hanyu/data';
import { ExerciseRenderer } from '../exercises/ExerciseRenderer';
import { useExerciseSession } from '../exercises/useExerciseSession';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: HskLevel[] = [1, 2, 3];

const TYPES: Array<{ type: ExerciseType; label: string }> = [
  { type: 'fill_blank', label: 'Fill blank' },
  { type: 'multiple_choice', label: 'Multiple choice' },
  { type: 'reorder', label: 'Reorder' },
  { type: 'dictation', label: 'Dictation' },
  { type: 'matching', label: 'Matching' },
];

function hasAnswer(value: unknown) {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return value !== null && value !== undefined;
}

export function ExercisesScreen() {
  const { colors } = useTheme();
  const session = useExerciseSession();
  const busy = session.status === 'loading' || session.status === 'checking';
  const canCheck = session.status === 'answering' && hasAnswer(session.draft);
  const explanation =
    session.result?.explanation ??
    session.exercise?.explanation ??
    (session.result ? `Expected answer: ${String(session.result.expected_answer)}` : null);

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Practice</Text>
        <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
      </View>

      <View style={styles.segmentGroup}>
        {LEVELS.map(level => (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityLabel={`HSK ${level}`}
            accessibilityState={{ selected: session.level === level, disabled: busy }}
            disabled={busy}
            onPress={() => session.setLevel(level)}
            style={[
              styles.segment,
              {
                borderColor: session.level === level ? colors.vermilion : colors.border,
                backgroundColor: session.level === level ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>HSK {level}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.typeGrid}>
        {TYPES.map(item => (
          <Pressable
            key={item.type}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: session.type === item.type, disabled: busy }}
            disabled={busy}
            onPress={() => session.setType(item.type)}
            style={[
              styles.typeButton,
              {
                borderColor: session.type === item.type ? colors.vermilion : colors.border,
                backgroundColor: session.type === item.type ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {session.error ? <ErrorBanner message={session.error} onRetry={session.load} /> : null}

      {!session.exercise ? (
        <Button
          label={session.status === 'loading' ? 'Generating...' : 'Generate exercise'}
          onPress={session.load}
          disabled={session.status === 'loading'}
        />
      ) : (
        <Card>
          <ExerciseRenderer
            exercise={session.exercise}
            value={session.draft}
            disabled={session.status !== 'answering'}
            onChange={session.setDraft}
          />
          {session.status === 'checking' ? <ActivityIndicator /> : null}

          {session.result ? (
            <View style={styles.result}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {session.result.correct ? 'Correct' : 'Not quite'}
              </Text>
              {explanation ? (
                <Text style={[styles.explanation, { color: colors.textMuted }]}>{explanation}</Text>
              ) : null}
            </View>
          ) : null}

          {session.result ? (
            <Button label="Next exercise" onPress={session.next} disabled={session.status === 'loading'} />
          ) : (
            <Button
              label={session.status === 'checking' ? 'Checking...' : 'Check answer'}
              onPress={session.check}
              disabled={!canCheck || session.status === 'checking'}
            />
          )}
        </Card>
      )}
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  typeButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: {
    gap: tokens.spacing.xs,
  },
  resultTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
  explanation: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
  },
});
