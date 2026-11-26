import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { diagnose } from '@hanyu/domain';
import { ExerciseRenderer } from '../exercises/ExerciseRenderer';
import { useExerciseSession } from '../exercises/useExerciseSession';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';



export function ExercisesScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ mistakes?: string | string[] }>();
  const session = useExerciseSession();

  const router = useRouter();
  const busy = session.status === 'loading' || session.status === 'checking';
  const canCheck = session.status === 'answering' && session.complete;
  const isSessionActive =
    session.status === 'answering' || session.status === 'checking' || session.status === 'checked';
  const hasExercise = Boolean(session.exercise) && isSessionActive;
  const isLast = session.index === session.exercises.length - 1;
  const mistakesParam = Array.isArray(params.mistakes) ? params.mistakes[0] : params.mistakes;
  const mistakeKey = mistakesParam ?? '';

  useEffect(() => {
    const targetWordIds = mistakeKey
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    void session.load(targetWordIds);
  }, [mistakeKey, session.load]);

  function retrySession() {
    const targetWordIds = mistakeKey
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    void session.load(targetWordIds);
  }

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Práctica</Text>
        <Text style={[styles.title, { color: colors.text }]}>Ejercicios</Text>
      </View>

      {session.error ? <ErrorBanner message={session.error} onRetry={retrySession} /> : null}
      {session.status === 'loading' && !session.unit ? <ActivityIndicator /> : null}

      {session.status === 'ready' && session.unit ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>Unidad activa</Text>
          <Text style={[styles.unitTitle, { color: colors.text }]}>{session.unit.unit_title}</Text>
          {session.unit.review_fallback ? (
            <Text style={[styles.unitMeta, { color: colors.textMuted }]}>
              {`Todavía no tiene ejercicios propios: repaso general de HSK ${session.unit.hsk_level}`}
            </Text>
          ) : null}
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


      {!isSessionActive ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>Simulacro HSK 2</Text>
          <Text style={[styles.unitMeta, { color: colors.textMuted }]}>
            El examen entero con el formato 3.0: 听力, 阅读 y 书写, con tiempo y sin ayudas.
          </Text>
          <Button label="Simulacro completo" onPress={() => router.push('/practice/exam/next')} disabled={busy} />
        </Card>
      ) : null}

      {hasExercise && session.exercise ? (
        <Card>
          <View style={styles.progressRow}>
            <Text style={[styles.progress, { color: colors.textMuted }]}>{session.progress}</Text>
          </View>
          <ExerciseRenderer
            exercise={session.exercise}
            value={session.draft}
            disabled={session.status !== 'answering'}
            onChange={session.setDraft}
            onHintUsed={session.markHintUsed}
          />
          {session.status === 'checking' ? <ActivityIndicator /> : null}

          {session.result ? (
            <View style={styles.result}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {session.result.hint_used && session.result.answer_correct
                  ? 'Correcto con ayuda'
                  : session.result.correct ? 'Correcto' : 'No del todo'}
              </Text>
              {session.result.explanation ? (
                <Text style={[styles.explanation, { color: colors.textMuted }]}>
                  {session.result.explanation}
                </Text>
              ) : null}
              {!session.result.correct ? (
                <Text style={[styles.explanation, { color: colors.textMuted }]}>
                  {diagnose(session.result.detail)}
                </Text>
              ) : null}
              {isLast ? <Text style={[styles.detail, { color: colors.text }]}>Terminado</Text> : null}
            </View>
          ) : null}

          {session.result ? (
            <Button label={isLast ? 'Ver resumen' : 'Siguiente'} onPress={session.next} />
          ) : (
            <Button
              label={session.status === 'checking' ? 'Comprobando...' : 'Comprobar'}
              onPress={session.check}
              disabled={!canCheck || session.status === 'checking' || session.hintPending}
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
