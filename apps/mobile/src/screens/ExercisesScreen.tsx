import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { diagnose, emptyAnswer, isAnswerComplete } from '@hanyu/domain';
import {
  toUserMessage,
  type Exercise,
  type ExerciseAnswer,
  type ExerciseCheckResult,
  type MockExam,
  type MockExamScope,
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
  if (!raw?.id || !raw.prompt || !raw.solution || raw.prompt.kind !== raw.solution.kind) return null;
  return raw;
}

export function ExercisesScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ mistakes?: string | string[] }>();
  const session = useExerciseSession();
  const timer = useSessionTimer();
  const [mockExam, setMockExam] = useState<MockExam | null>(null);
  const [mockScope, setMockScope] = useState<MockExamScope>('section');
  const [mockSectionCode, setMockSectionCode] = useState<string | null>(null);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockStarted, setMockStarted] = useState(false);
  const [mockExpired, setMockExpired] = useState(false);
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
      !mockExpired &&
      !timer.expired &&
      currentMockExercise &&
      isAnswerComplete(currentMockExercise.solution, mockDraft),
  );
  const mockLevel = session.unit?.hsk_level ?? 2;
  const mistakesParam = Array.isArray(params.mistakes) ? params.mistakes[0] : params.mistakes;
  const mistakeKey = mistakesParam ?? '';

  useEffect(() => {
    const targetWordIds = mistakeKey
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    void session.load(targetWordIds);
  }, [mistakeKey, session.load]);

  useEffect(() => {
    if (!mockStarted || !timer.expired) return;

    timer.stop();
    setMockExpired(true);
    setMockStarted(false);
  }, [mockStarted, timer.expired, timer.stop]);

  async function openMockExam(scope: MockExamScope = 'section', sectionCode?: string | null) {
    setMockLoading(true);
    setMockError(null);

    try {
      const nextExam = await session.buildMockExam(mockLevel, scope, sectionCode);
      setMockExam(nextExam);
      setMockScope(scope);
      setMockSectionCode(sectionCode ?? null);
      setMockSectionIndex(0);
      setMockExerciseIndex(0);
      setMockDraft(emptyAnswer('fill_blank'));
      setMockResult(null);
      setMockStarted(false);
      setMockExpired(false);
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
      timer.start(mockSection ? mockSection.minutes * 60 : 60);
      return;
    }

    setMockExerciseIndex(0);
    setMockDraft(emptyAnswer(currentMockExercise.type));
    setMockResult(null);
    setMockError(null);
    setMockExpired(false);
    setMockStarted(true);
    timer.start(mockSection.minutes * 60);
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

  function advanceMockSection() {
    if (!mockExam) return;

    if (mockSectionIndex < mockExam.sections.length - 1) {
      const nextSectionIndex = mockSectionIndex + 1;
      const nextSection = mockExam.sections[nextSectionIndex];
      setMockSectionIndex(nextSectionIndex);
      setMockExerciseIndex(0);
      setMockDraft(emptyAnswer(examExercise(nextSection.exercises[0])?.type ?? 'fill_blank'));
      setMockResult(null);
      setMockExpired(false);
      timer.start(nextSection.minutes * 60);
      return;
    }

    timer.stop();
    setMockStarted(false);
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

    advanceMockSection();
  }

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
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Practice</Text>
        <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
      </View>

      {session.error ? <ErrorBanner message={session.error} onRetry={retrySession} /> : null}
      {mockError ? <ErrorBanner message={mockError} onRetry={() => openMockExam(mockScope, mockSectionCode)} /> : null}
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
        </Card>
      ) : null}

      {!mockExam ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>Práctica de examen</Text>
          <Text style={[styles.unitMeta, { color: colors.textMuted }]}>Nivel HSK {mockLevel}; elige una sección o el examen completo.</Text>
          <Button label="Simulacro" onPress={() => openMockExam('section', 'listening')} disabled={busy} />
          <Button label="Lectura" onPress={() => openMockExam('section', 'reading')} disabled={busy} />
          <Button label="Examen completo" onPress={() => openMockExam('full')} disabled={busy} />
        </Card>
      ) : null}

      {mockExam && mockSection ? (
        <Card>
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>
            {mockScope === 'full' ? `Examen completo HSK ${mockExam.hsk_level ?? mockLevel}` : `Simulacro HSK ${mockExam.hsk_level ?? mockLevel}`}
          </Text>
          <Text style={[styles.unitTitle, { color: colors.text }]}>{mockSection.title}</Text>
          <Text style={[styles.timer, { color: colors.text }]}>
            {formatRemaining(mockSection.minutes, timer.elapsed)}
          </Text>

          {mockExam.unsupported?.map((part) => (
            <Text key={`${part.section}-${part.part ?? ''}`} style={[styles.unsupported, { color: colors.textMuted }]}>
              {`${part.section}${part.part ? ` · ${part.part}` : ''}: esta parte aún no se puede simular (${part.reason}).`}
            </Text>
          ))}

          {mockExpired ? (
            <>
              <Text style={[styles.explanation, { color: colors.textMuted }]}>Tiempo agotado: esta sección queda cerrada.</Text>
              <Button label="Reintentar sección" onPress={startMockExam} disabled={busy} />
            </>
          ) : !mockStarted ? (
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
            <>
              <Text style={[styles.explanation, { color: colors.textMuted }]}>Esta sección todavía no tiene ejercicios simulables.</Text>
              {mockScope === 'full' && mockSectionIndex < mockExam.sections.length - 1 ? (
                <Button label="Siguiente sección" onPress={advanceMockSection} />
              ) : null}
            </>
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
