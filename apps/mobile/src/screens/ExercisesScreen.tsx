import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ExerciseRenderer } from '../exercises/ExerciseRenderer';
import { useExerciseSession } from '../exercises/useExerciseSession';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

function exerciseIdentifier(exercise: { id: string; slug?: string }) {
  return exercise.slug ?? exercise.id;
}

export function ExercisesScreen() {
  const { colors } = useTheme();
  const session = useExerciseSession();
  const busy = session.status === 'loading' || session.status === 'checking';
  const canCheck = session.status === 'answering' && session.complete;
  const hasExercise = Boolean(session.exercise) && session.status !== 'complete';
  const isLast = session.index === session.exercises.length - 1;

  useEffect(() => {
    void session.load();
  }, [session.load]);

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Practice</Text>
        <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
      </View>

      {session.error ? <ErrorBanner message={session.error} onRetry={session.load} /> : null}

      {session.status === 'loading' && !session.unit ? <ActivityIndicator /> : null}

      {session.status === 'ready' && session.unit ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>Unidad activa</Text>
          <Text style={[styles.unitTitle, { color: colors.text }]}>{session.unit.unit_title}</Text>
          <Text style={[styles.unitMeta, { color: colors.textMuted }]}>
            {`${session.exercises.length} ejercicios, de reconocer a producir`}
          </Text>
          <Button
            label="Empezar"
            onPress={session.start}
            disabled={session.exercises.length === 0 || busy}
          />
        </Card>
      ) : null}

      {hasExercise && session.exercise ? (
        <Card>
          <View style={styles.progressRow}>
            <Text style={[styles.progress, { color: colors.textMuted }]}>{session.progress}</Text>
            <Text testID="exercise-slug" style={[styles.exerciseId, { color: colors.textMuted }]}>
              {exerciseIdentifier(session.exercise as typeof session.exercise & { slug?: string })}
            </Text>
          </View>
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
                {session.result.correct ? 'Correcto' : 'No del todo'}
              </Text>
              {session.result.explanation ? (
                <Text style={[styles.explanation, { color: colors.textMuted }]}>
                  {session.result.explanation}
                </Text>
              ) : null}
              {isLast ? (
                <Text style={[styles.detail, { color: colors.text }]}>Terminado</Text>
              ) : null}
            </View>
          ) : null}

          {session.result ? (
            <Button label={isLast ? 'Ver resumen' : 'Siguiente'} onPress={session.next} />
          ) : (
            <Button
              label={session.status === 'checking' ? 'Comprobando...' : 'Comprobar'}
              onPress={session.check}
              disabled={!canCheck || session.status === 'checking'}
            />
          )}
        </Card>
      ) : null}

      {session.status === 'complete' && session.summary ? (
        <Card>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Terminado</Text>
          <Text style={[styles.summary, { color: colors.textMuted }]}>
            {`${session.summary.correct}/${session.summary.total} correctos`}
          </Text>
        </Card>
      ) : null}
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
  unitLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  unitTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
    marginTop: tokens.spacing.xs,
  },
  unitMeta: {
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progress: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  exerciseId: {
    fontSize: tokens.fontSize.xs,
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
  detail: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  summary: {
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing.sm,
  },
});
