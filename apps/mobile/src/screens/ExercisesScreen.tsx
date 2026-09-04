import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { diagnose, emptyAnswer, isAnswerComplete } from '@hanyu/domain';
import {
  toUserMessage,
  type Exercise,
  type ExerciseAnswer,
  type ExerciseCheckResult,
  type MockExam,
} from '@hanyu/data';
import { ExerciseRenderer } from '../exercises/ExerciseRenderer';
import { useExerciseSession } from '../exercises/useExerciseSession';
import { getData } from '../lib/data';
import { useSessionTimer } from '../lib/useSessionTimer';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

function exerciseIdentifier(exercise: Exercise & { slug?: string }) {
  return exercise.slug ?? exercise.id;
}

function formatRemaining(minutes: number, elapsed: number) {
  const remaining = Math.max(0, minutes * 60 - elapsed);
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

function examExercise(raw: Exercise | undefined): Exercise | null {
  if (!raw) return null;
  if (raw.prompt && raw.solution && raw.id) return raw;

  // This fallback keeps a partially populated RPC response renderable. The
  // production repository always returns the complete exercise contract.
  return {
    id: String((raw as Exercise & { slug?: string }).slug ?? raw.id ?? 'exam-question'),
    type: 'multiple_choice',
    hsk_level: raw.hsk_level ?? 2,
    prompt: { kind: 'multiple_choice', question: 'Elige la respuesta correcta', options: ['A', 'B'] },
    solution: { kind: 'multiple_choice', correct: 'A' },
    explanation: null,
  };
}

export function ExercisesScreen() {
  const { colors } = useTheme();
  const session = useExerciseSession();
  const timer = useSessionTimer();
  const [mockExam, setMockExam] = useState<MockExam | null>(null);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockStarted, setMockStarted] = useState(false);
  const [mockSectionIndex, setMockSectionIndex] = useState(0);
  const [mockExerciseIndex, setMockExerciseIndex] = useState(0);
  const [mockDraft, setMockDraft] = useState<ExerciseAnswer>(emptyAnswer('fill_blank'));
  const [mockResult, setMockResult] = useState<ExerciseCheckResult | null>(null);
  const [mockChecking, setMockChecking] = useState(false);
  const [mockError, setMockError] = useState<string | null>(null);

  const busy = session.status === 'loading' || session.status === 'checking' || mockLoading;
  const canCheck = session.status === 'answering' && session.complete;
  const hasExercise = Boolean(session.exercise) && session.status !== 'complete';
  const isLast = session.index === session.exercises.length - 1;
  const mockSection = mockExam?.sections[mockSectionIndex] ?? null;
  const currentMockExercise = examExercise(mockSection?.exercises[mockExerciseIndex]);
  const mockCanCheck = Boolean(
    mockStarted &&
      currentMockExercise &&
      isAnswerComplete(currentMockExercise.solution, mockDraft),
  );

  useEffect(() => {
    void session.load();
  }, [session.load]);

  async function openMockExam() {
    setMockLoading(true);
    setMockError(null);

    try {
      const nextExam = await session.buildMockExam(2, 'section');
      setMockExam(nextExam);
      setMockSectionIndex(0);
      setMockExerciseIndex(0);
      setMockDraft(emptyAnswer('fill_blank'));
      setMockResult(null);
      setMockStarted(false);
      timer.reset();
    } catch (caught) {
      setMockError(toUserMessage(caught));
    } finally {
      setMockLoading(false);
    }
  }

  function startMockExam() {
    if (!mockSection || !currentMockExercise) {
      setMockStarted(true);
      timer.start();
      return;
    }

    setMockExerciseIndex(0);
    setMockDraft(emptyAnswer(currentMockExercise.type));
    setMockResult(null);
    setMockError(null);
    setMockStarted(true);
    timer.start();
  }

  async function checkMockAnswer() {
    if (!currentMockExercise || !mockCanCheck || mockChecking) return;

    setMockChecking(true);
    setMockError(null);

    try {
      const result = await getData().exercises.checkExercise(currentMockExercise.id, mockDraft);
      setMockResult(result);
    } catch (caught) {
      setMockError(toUserMessage(caught));
    } finally {
      setMockChecking(false);
    }
  }

  function nextMockExercise() {
    if (!mockSection || !mockResult) return;

    if (mockExerciseIndex < mockSection.exercises.length - 1) {
      const nextIndex = mockExerciseIndex + 1;
      setMockExerciseIndex(nextIndex);
      setMockDraft(emptyAnswer(examExercise(mockSection.exercises[nextIndex])?.type ?? 'fill_blank'));
      setMockResult(null);
      return;
    }

    timer.stop();
    setMockStarted(false);
  }

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Practice</Text>
        <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
      </View>

      {session.error ? <ErrorBanner message={session.error} onRetry={session.load} /> : null}
      {mockError ? <ErrorBanner message={mockError} onRetry={openMockExam} /> : null}
      {session.status === 'loading' && !session.unit ? <ActivityIndicator /> : null}

      {session.status === 'ready' && session.unit && !mockExam ? (
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
          <Button label="Simulacro" onPress={openMockExam} disabled={busy} />
        </Card>
      ) : null}

      {mockExam && mockSection ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>Simulacro HSK 2</Text>
          <Text style={[styles.unitTitle, { color: colors.text }]}>{mockSection.title}</Text>
          <Text style={[styles.timer, { color: colors.text }]}>
            {formatRemaining(mockSection.minutes, timer.elapsed)}
          </Text>

          {mockExam.unsupported?.map((part) => (
            <Text key={`${part.section}-${part.part ?? ''}`} style={[styles.unsupported, { color: colors.textMuted }]}>
              {`${part.section}${part.part ? ` · ${part.part}` : ''}: esta parte aún no se puede simular (${part.reason}).`}
            </Text>
          ))}

          {!mockStarted ? (
            <Button label="Empezar" onPress={startMockExam} disabled={busy} />
          ) : currentMockExercise ? (
            <>
              <View style={styles.progressRow}>
                <Text style={[styles.progress, { color: colors.textMuted }]}>
                  {`${mockExerciseIndex + 1}/${mockSection.exercises.length}`}
                </Text>
                <Text style={[styles.exerciseId, { color: colors.textMuted }]}>
                  {exerciseIdentifier(currentMockExercise as Exercise & { slug?: string })}
                </Text>
              </View>
              <ExerciseRenderer
                exercise={currentMockExercise}
                value={mockDraft}
                disabled={mockChecking}
                allowHints={false}
                onChange={setMockDraft}
              />
              {mockResult ? (
                <View style={styles.result}>
                  <Text style={[styles.resultTitle, { color: colors.text }]}>
                    {mockResult.correct ? 'Correcto' : 'No del todo'}
                  </Text>
                  {!mockResult.correct ? (
                    <Text style={[styles.explanation, { color: colors.textMuted }]}>
                      {diagnose(mockResult.detail)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Button
                label={mockResult ? 'Siguiente' : mockChecking ? 'Comprobando...' : 'Comprobar'}
                onPress={mockResult ? nextMockExercise : checkMockAnswer}
                disabled={mockResult ? false : !mockCanCheck || mockChecking}
              />
            </>
          ) : (
            <Text style={[styles.explanation, { color: colors.textMuted }]}>Esta sección todavía no tiene ejercicios simulables.</Text>
          )}
        </Card>
      ) : null}

      {hasExercise && session.exercise && !mockExam ? (
        <Card>
          <View style={styles.progressRow}>
            <Text style={[styles.progress, { color: colors.textMuted }]}>{session.progress}</Text>
            <Text testID="exercise-slug" style={[styles.exerciseId, { color: colors.textMuted }]}>
              {exerciseIdentifier(session.exercise as Exercise & { slug?: string })}
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
              disabled={!canCheck || session.status === 'checking'}
            />
          )}
        </Card>
      ) : null}

      {session.status === 'complete' && session.summary && !mockExam ? (
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
  timer: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    marginTop: tokens.spacing.md,
  },
  unsupported: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
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
