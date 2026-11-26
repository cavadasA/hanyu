import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  toUserMessage,
  type FlashcardStats,
  type StudyMode,
  type VersionedCard,
} from '@hanyu/data';
import {
  cardPhase,
  previewIntervals,
  schedulingParams,
  shouldRequeueInSession,
  type Grade,
} from '@hanyu/domain';
import { getData } from '../lib/data';
import {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
  type ReviewSessionSnapshot,
} from '../lib/reviewSessionStore';
import { useSessionTimer } from '../lib/useSessionTimer';
import { useOfflineReview } from '../offline/OfflineReviewProvider';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardStatusBadge } from '../ui/CardStatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { FlashCardView, type ReviewSkill } from '../ui/FlashCardView';
import { ActiveSessionBanner } from '../ui/ActiveSessionBanner';
import { Screen } from '../ui/Screen';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import { StatusBarChart } from '../ui/StatusBarChart';
import { useReloadOnReturn } from '../lib/useReloadOnReturn';
import { useRequestedStudyMode } from '../lib/useRequestedStudyMode';

const MOTION_DISABLED = process.env.NODE_ENV === 'test';
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

const STUDY_MODES: StudyMode[] = ['learn', 'review', 'exam'];
const STUDY_MODE_LABELS: Record<StudyMode, string> = { learn: 'Aprender', review: 'Repasar', exam: 'Examen' };
const STUDY_MODE_OPTIONS: SegmentedOption<StudyMode>[] = STUDY_MODES.map((value) => ({
  value,
  label: STUDY_MODE_LABELS[value],
}));
const SKILLS: ReviewSkill[] = ['recognition', 'recall', 'listening', 'reading'];
const SKILL_LABELS: Record<ReviewSkill, string> = {
  recognition: 'Entender',
  recall: 'Recordar',
  listening: 'Escuchar',
  reading: 'Leer',
};
const SKILL_OPTIONS: SegmentedOption<ReviewSkill>[] = SKILLS.map((value) => ({
  value,
  label: SKILL_LABELS[value],
}));

const STUDY_MODE_DESCRIPTIONS: Record<StudyMode, string> = {
  learn: 'Presenta palabras nuevas con audio, pinyin y guía de trazos',
  review: 'Repasa lo pendiente con repetición espaciada (FSRS)',
  exam: 'Evaluación con tiempo y sin pistas para medir lo que recuerdas',
};

const SKILL_DESCRIPTIONS: Record<ReviewSkill, string> = {
  recognition: 'Entender: hanzi → significado y pinyin',
  recall: 'Recordar: significado → escribe hanzi y pinyin',
  listening: 'Escuchar: audio → identifica el hanzi',
  reading: 'Leer: comprensión de la frase y gramática',
};

type ScreenPhase = 'pre-session' | 'reviewing' | 'complete';
interface UndoEntry {
  card: VersionedCard;
  previousIndex: number;
  grade: Grade;
  reviewId: string;
  requeued: boolean;
}

interface SessionStats {
  reviewed: number;
  correct: number;
  again: number;
}

export default function CardsScreen() {
  const { colors } = useTheme();
  const { service, ready, requestRetention, sync } = useOfflineReview();
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const focusedDeckId = typeof deckId === 'string' && deckId.length > 0 ? deckId : null;

  const [phase, setPhase] = useState<ScreenPhase>('pre-session');
  const [allDueCards, setAllDueCards] = useState<VersionedCard[]>([]);
  const [activeCards, setActiveCards] = useState<VersionedCard[]>([]);
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [byStatus, setByStatus] = useState<FlashcardStats['by_status']>({});
  const [deckTotal, setDeckTotal] = useState(0);

  const [index, setIndex] = useState(0);
  const [studyMode, setStudyMode] = useState<StudyMode>('review');
  const [skill, setSkill] = useState<ReviewSkill>('recognition');
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);
  const [retryGrade, setRetryGrade] = useState<Grade | null>(null);
  const [error, setError] = useState('');
  const [swiping, setSwiping] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, correct: 0, again: 0 });
  const [resumable, setResumable] = useState<ReviewSessionSnapshot | null>(null);

  const timer = useSessionTimer();
  const sessionId = useRef<string | null>(null);
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());
  const scheduling = useMemo(
    () => schedulingParams({ request_retention: requestRetention }),
    [requestRetention],
  );
  const previewNow = useMemo(
    () => new Date(),
    [phase, index, requestRetention],
  );
  const currentCard = activeCards[index];
  const currentIntervals = useMemo(
    () => currentCard ? previewIntervals(currentCard.scheduling, previewNow, scheduling) : undefined,
    [currentCard, previewNow, scheduling],
  );

  const loadSeq = useRef(0);

  const load = useCallback(async (
    selectedSkill?: unknown,
    selectedMode?: unknown,
  ) => {
    const validSkill: ReviewSkill =
      typeof selectedSkill === 'string' && SKILLS.includes(selectedSkill as ReviewSkill)
        ? (selectedSkill as ReviewSkill)
        : skill;
    const validMode: StudyMode =
      typeof selectedMode === 'string' && STUDY_MODES.includes(selectedMode as StudyMode)
        ? (selectedMode as StudyMode)
        : studyMode;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');

    try {
      // El servicio offline es el único puerto de lectura y de escritura de
      // tarjetas. Si no está listo, se espera: caer al repositorio directo
      // recrearía los dos caminos con semánticas distintas que este plan
      // elimina.
      if (!service || !ready) {
        return;
      }

      const cards = await service.loadQueue(validSkill, focusedDeckId, validMode);
      if (seq !== loadSeq.current) return;
      if (service.lastQueueError) {
        setError(toUserMessage(new Error(service.lastQueueError)));
      }
      setAllDueCards(cards);
      setDeckSize(focusedDeckId ? service.lastDeckSize : null);
      setIndex(0);
      setReviewed(0);
      setRevealed(false);
      setPhase('pre-session');
      setRetryGrade(null);
      setPendingGrade(null);
      setSwiping(false);
      setUndoStack([]);
      setStats({ reviewed: 0, correct: 0, again: 0 });

      const data = getData();
      try {
        const dashboard = await data.stats.getDashboard();
        if (seq !== loadSeq.current) return;
        setByStatus(dashboard.cards?.by_status ?? {});
        if (!focusedDeckId) {
          setDeckSize(dashboard.cards?.total ?? 0);
        }
        setDeckTotal(dashboard.cards?.total ?? 0);
      } catch {
        // non-blocking for cards load
      }
    } catch (caught) {
      if (seq === loadSeq.current) {
        setError(toUserMessage(caught));
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [focusedDeckId, ready, service, skill, studyMode]);

  useEffect(() => {
    void load();
  }, [load]);
  useRequestedStudyMode(setStudyMode);
  useReloadOnReturn(phase, load);

  useEffect(() => {
    void loadReviewSession().then(setResumable);
  }, []);

  const contentAnim = useRef(new Animated.Value(MOTION_DISABLED ? 1 : 0)).current;
  const badgeAnim = useRef(new Animated.Value(MOTION_DISABLED ? 1 : 0)).current;
  const reviewEntrance = useRef(new Animated.Value(MOTION_DISABLED ? 1 : 0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (MOTION_DISABLED) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotion.current = enabled;
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const dueCount = allDueCards.length;

  useEffect(() => {
    if (phase !== 'pre-session') return;
    if (MOTION_DISABLED || reduceMotion.current) {
      contentAnim.setValue(1);
      return;
    }
    if (loading) {
      Animated.timing(contentAnim, {
        toValue: 0.45,
        duration: 140,
        easing: EASE,
        useNativeDriver: true,
      }).start();
    } else {
      contentAnim.setValue(0);
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 220,
        easing: EASE,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, phase, studyMode, skill, allDueCards.length, contentAnim]);

  useEffect(() => {
    if (MOTION_DISABLED || reduceMotion.current) {
      badgeAnim.setValue(dueCount > 0 ? 1 : 0);
      return;
    }
    Animated.timing(badgeAnim, {
      toValue: dueCount > 0 ? 1 : 0,
      duration: 180,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [dueCount, badgeAnim]);

  useEffect(() => {
    if (phase !== 'reviewing') return;
    if (MOTION_DISABLED || reduceMotion.current) {
      reviewEntrance.setValue(1);
      return;
    }
    reviewEntrance.setValue(0);
    Animated.timing(reviewEntrance, {
      toValue: 1,
      duration: 200,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [phase, reviewEntrance]);

  function startReview() {
    const sessionCards = allDueCards;
    setActiveCards(sessionCards);
    setIndex(0);
    setReviewed(0);
    setRevealed(false);
    setUndoStack([]);
    setStats({ reviewed: 0, correct: 0, again: 0 });
    sessionStartedAt.current = Date.now();
    cardStartedAt.current = Date.now();
    sessionId.current = randomUUID();
    if (studyMode !== 'learn') {
      timer.start();
    }
    setPhase('reviewing');
    void saveReviewSession({
      session_id: sessionId.current,
      deck_id: focusedDeckId,
      card_ids: sessionCards.map((card) => card.id),
      index: 0,
      mode: studyMode,
      skill,
      started_at: sessionStartedAt.current,
      reviewed: 0,
      stats: { reviewed: 0, correct: 0, again: 0 },
    });
  }

  function resumeSession(snapshot: ReviewSessionSnapshot) {
    const byId = new Map(allDueCards.map((entry) => [entry.id, entry]));
    const queue = snapshot.card_ids
      .map((id) => byId.get(id))
      .filter((entry): entry is VersionedCard => Boolean(entry));

    if (queue.length === 0) {
      // Ninguna tarjeta de aquella cola sigue vencida: la sesión terminó por
      // otro camino y reanudarla no tiene sentido.
      void clearReviewSession();
      setResumable(null);
      return;
    }

    const savedNextCardId = snapshot.card_ids[snapshot.index];
    const nextIndex = savedNextCardId
      ? queue.findIndex((entry) => entry.id === savedNextCardId)
      : -1;

    setActiveCards(queue);
    setIndex(nextIndex >= 0 ? nextIndex : 0);
    setReviewed(snapshot.reviewed);
    setStats(snapshot.stats);
    const legacySkill = snapshot.mode === 'recognition' || snapshot.mode === 'recall' ||
      snapshot.mode === 'listening' || snapshot.mode === 'reading'
      ? snapshot.mode
      : 'recognition';
    const savedStudyMode: StudyMode = snapshot.mode === 'learn' || snapshot.mode === 'review' || snapshot.mode === 'exam'
      ? snapshot.mode
      : 'review';
    setStudyMode(savedStudyMode);
    setSkill(snapshot.skill ?? legacySkill);
    setUndoStack([]);
    setRevealed(false);
    sessionId.current = snapshot.session_id;
    sessionStartedAt.current = snapshot.started_at;
    cardStartedAt.current = Date.now();
    if (savedStudyMode !== 'learn') {
      timer.start();
    }
    setPhase('reviewing');
    setResumable(null);
  }

  async function undoLastRating() {
    const lastEntry = undoStack[undoStack.length - 1];
    if (!lastEntry || reviewing || !service) return;

    setReviewing(true);
    setError('');

    try {
      await service.undoRating(lastEntry.reviewId);
    } catch (caught) {
      // La valoración sigue escrita, así que la pantalla no se mueve. Mostrar
      // la tarjeta anterior aquí sería exactamente la mentira que se corrige.
      setError(toUserMessage(caught));
      setReviewing(false);
      return;
    }

    const nextUndoStack = undoStack.slice(0, -1);
    let requeuedIndex = -1;
    if (lastEntry.requeued) {
      for (let candidate = activeCards.length - 1; candidate > lastEntry.previousIndex; candidate -= 1) {
        if (activeCards[candidate]?.id === lastEntry.card.id) {
          requeuedIndex = candidate;
          break;
        }
      }
    }

    const withoutRequeued = requeuedIndex >= 0
      ? activeCards.filter((_, candidate) => candidate !== requeuedIndex)
      : activeCards;
    const nextActiveCards = withoutRequeued.map((entry, candidate) =>
      candidate === lastEntry.previousIndex ? lastEntry.card : entry,
    );
    const nextReviewed = Math.max(0, reviewed - 1);
    const nextStats = {
      reviewed: Math.max(0, stats.reviewed - 1),
      correct: lastEntry.grade === 'good' || lastEntry.grade === 'easy'
        ? Math.max(0, stats.correct - 1)
        : stats.correct,
      again: lastEntry.grade === 'again'
        ? Math.max(0, stats.again - 1)
        : stats.again,
    };

    setReviewing(false);
    setUndoStack(nextUndoStack);
    setActiveCards(nextActiveCards);
    setIndex(lastEntry.previousIndex);
    setReviewed(nextReviewed);
    setStats(nextStats);
    setRevealed(false);
    cardStartedAt.current = Date.now();

    void saveReviewSession({
      session_id: sessionId.current ?? randomUUID(),
      deck_id: focusedDeckId,
      card_ids: nextActiveCards.map((card) => card.id),
      index: lastEntry.previousIndex,
      mode: studyMode,
      skill,
      started_at: sessionStartedAt.current,
      reviewed: nextReviewed,
      stats: nextStats,
    });
  }

  async function rate(grade: Grade, timeMs?: number) {
    const current = activeCards[index];
    if (!current || reviewing || !service) {
      return;
    }

    setReviewing(true);
    setPendingGrade(grade);
    setError('');

    let reviewId: string | null = null;
    let ratedCard = current;
    try {
      const elapsedMs = timeMs ?? Date.now() - cardStartedAt.current;
      if (studyMode === 'exam') {
        await getData().events.recordEvent({
          kind: 'exercise_attempted',
          target_kind: 'word',
          target_id: current.word_id,
          skill: current.skill,
          payload: {
            mode: studyMode,
            grade,
            correct: grade !== 'again',
            time_ms: studyMode === 'exam' ? elapsedMs : null,
          },
        });
      } else {
        const result = await service.rateCard(current, grade, elapsedMs);
        reviewId = result.reviewId;
        ratedCard = result.card;
      }
    } catch (caught) {
      setError(toUserMessage(caught));
      setRetryGrade(grade);
      setReviewing(false);
      setPendingGrade(null);
      return;
    }

    setRetryGrade(null);
    setReviewing(false);
    setPendingGrade(null);

    const nextReviewed = reviewed + 1;
    setReviewed(nextReviewed);
    const nextStats = {
      reviewed: stats.reviewed + 1,
      correct: stats.correct + (grade === 'good' || grade === 'easy' ? 1 : 0),
      again: stats.again + (grade === 'again' ? 1 : 0),
    };
    setStats(nextStats);

    // Cada aparición de la tarjeta en la sesión es una entrada en activeCards,
    // así que contarlas da las veces que se ha mostrado sin llevar estado
    // aparte: sobrevive a reanudar la sesión y a deshacer, que quitan y ponen
    // esas mismas entradas.
    const shown = activeCards.reduce(
      (count, entry) => (entry.id === current.id ? count + 1 : count),
      0,
    );
    const requeueIntraday = studyMode !== 'exam' &&
      shouldRequeueInSession({ state: ratedCard.scheduling, shown });
    const nextCards = requeueIntraday ? [...activeCards, ratedCard] : activeCards;

    if (reviewId) {
      setUndoStack((prev) => [
        ...prev.slice(-4),
        { card: current, previousIndex: index, grade, reviewId, requeued: requeueIntraday },
      ]);
    }

    if (index + 1 >= nextCards.length) {
      timer.stop();
      void clearReviewSession();
      setPhase('complete');

      if (sync) {
        void Promise.resolve(sync())
          .then(async () => {
            try {
              const dashboard = await getData().stats.getDashboard();
              setByStatus(dashboard.cards?.by_status ?? {});
              if (!focusedDeckId) {
                setDeckSize(dashboard.cards?.total ?? 0);
              }
              setDeckTotal(dashboard.cards?.total ?? 0);
            } catch {
              // non-blocking
            }
          })
          .catch(() => {
            // non-blocking
          });
      }

      if (studyMode !== 'learn') {
        try {
          await getData().stats.logTime(Date.now() - sessionStartedAt.current);
        } catch {
          // Study time is not worth blocking the summary for.
        }
      }

      return;
    }

    const nextIndex = index + 1;
    setActiveCards(nextCards);
    setIndex(nextIndex);
    setRevealed(false);
    cardStartedAt.current = Date.now();

    void saveReviewSession({
      session_id: sessionId.current ?? randomUUID(),
      deck_id: focusedDeckId,
      card_ids: nextCards.map((card) => card.id),
      index: nextIndex,
      mode: studyMode,
      skill,
      started_at: sessionStartedAt.current,
      reviewed: nextReviewed,
      stats: nextStats,
    });
  }

  if (loading && !allDueCards.length && deckSize === null) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  // --- PHASE: COMPLETE ---
  if (phase === 'complete') {
    const accuracy = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 100;

    return (
      <Screen>
        <View style={styles.done}>
          <View style={[styles.doneIcon, { backgroundColor: colors.vermilion }]}>
            <Ionicons name="checkmark" size={32} color={colors.onAccent} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Sesión completada</Text>
          <Text style={[styles.doneBody, { color: colors.textMuted }]}>
            ¡Buen trabajo! Has repasado {stats.reviewed} {stats.reviewed === 1 ? 'tarjeta' : 'tarjetas'}.
          </Text>

          <Card style={styles.statsCard}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stats.reviewed}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Repasadas</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.vermilion }]}>{accuracy}%</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Aciertos</Text>
              </View>
              {studyMode !== 'learn' ? (
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{timer.formatted}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Tiempo</Text>
                </View>
              ) : null}
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.gold }]}>{stats.again}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Otra vez</Text>
              </View>
            </View>
          </Card>

          <View style={styles.completeActions}>
            <Button
              label="Repasar otra vez"
              variant="outline"
              onPress={() => {
                if (sync) {
                  void Promise.resolve(sync())
                    .then(() => void load())
                    .catch(() => void load());
                } else {
                  void load();
                }
              }}
            />
            <Button
              label="Volver a Hoy"
              variant="primary"
              onPress={() => {
                if (sync) void Promise.resolve(sync()).catch(() => {});
                router.push('/today');
              }}
            />
            {focusedDeckId ? (
              <Button
                label="Volver al mazo"
                variant="secondary"
                onPress={() => router.push(`/library/decks/${focusedDeckId}`)}
              />
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  // --- PHASE: PRE-SESSION ---
  if (phase === 'pre-session') {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>Repasos</Text>
          {dueCount > 0 ? (
            <Animated.View
              style={[
                styles.due,
                {
                  backgroundColor: colors.vermilion + '18',
                  opacity: badgeAnim,
                  transform: [
                    {
                      scale: badgeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.dueDot, { backgroundColor: colors.vermilion }]} />
              <Text style={[styles.dueLabel, { color: colors.vermilion }]}>{`${dueCount} pendientes`}</Text>
            </Animated.View>
          ) : null}
        </View>

        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : null}

        {resumable ? (
          <ActiveSessionBanner
            snapshot={resumable}
            onContinue={() => resumeSession(resumable)}
            onDiscard={() => {
              void clearReviewSession();
              setResumable(null);
            }}
          />
        ) : null}

        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Modo de estudio</Text>
          <Segmented
            options={STUDY_MODE_OPTIONS}
            value={studyMode}
            onChange={(selectedMode) => {
              setStudyMode(selectedMode);
            }}
          />
          <Text style={[styles.modeHint, { color: colors.textMuted }]}>
            {STUDY_MODE_DESCRIPTIONS[studyMode]}
          </Text>

          <Text style={[styles.sectionTitle, styles.skillTitle, { color: colors.text }]}>Habilidad</Text>
          <Segmented
            options={SKILL_OPTIONS}
            value={skill}
            onChange={(selectedSkill) => {
              setSkill(selectedSkill);
            }}
          />
          <Text style={[styles.modeHint, { color: colors.textMuted }]}>
            {SKILL_DESCRIPTIONS[skill]}
          </Text>
        </Card>

        <Animated.View
          style={{
            opacity: contentAnim,
            transform: [
              {
                translateY: contentAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
            gap: tokens.spacing.md,
          }}
        >
          {dueCount === 0 ? (
            deckSize === 0 && !focusedDeckId ? (
              <EmptyState
                title="Prepara tu plan de estudio de HSK 2"
                body="Crea el plan completo de HSK 1–2 y sáltate las palabras que ya reconoces."
                actionLabel="Empezar el diagnóstico"
                onAction={() => router.push('/diagnostic')}
                actionDisabled={loading}
              />
            ) : (
              <EmptyState
                title="No hay tarjetas pendientes"
                body="Has repasado todo lo de hoy. ¡Vuelve mañana para mantener la racha!"
              />
            )
          ) : (
            <>
              <Button
                label="Empezar sesión"
                variant="primary"
                onPress={startReview}
                disabled={loading}
              />

              <Card>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Estado de las tarjetas</Text>
                <StatusBarChart byStatus={byStatus} total={deckTotal} />
              </Card>
            </>
          )}
        </Animated.View>
      </Screen>
    );
  }

  // --- PHASE: REVIEWING ---
  const current = currentCard;
  const next = activeCards[index + 1];
  const counter = activeCards.length
    ? `${Math.min(index + 1, activeCards.length)}/${activeCards.length}`
    : '0/0';
  const progress: `${number}%` = activeCards.length
    ? `${Math.round(Math.min(1, reviewed / activeCards.length) * 100)}%`
    : '0%';

  return (
    <Screen scrollEnabled={!swiping}>
      <Animated.View
        style={{
          flex: 1,
          opacity: reviewEntrance,
          gap: tokens.spacing.md,
        }}
      >
        <View style={styles.reviewHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar la sesión de repaso"
            hitSlop={8}
            onPress={() => {
              void clearReviewSession();
              setPhase('pre-session');
            }}
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>

          <View style={styles.reviewHeaderCenter}>
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.vermilion, width: progress }]} />
              </View>
              <Text style={[styles.counterLabel, { color: colors.textMuted }]}>{counter}</Text>
            </View>
          </View>

          <View style={styles.reviewHeaderRight}>
            {studyMode !== 'learn' ? (
              <Text style={[styles.timerLabel, { color: colors.textMuted }]}>{timer.formatted}</Text>
            ) : null}
            {undoStack.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deshacer la última calificación"
                hitSlop={8}
                onPress={() => {
                  void undoLastRating();
                }}
              >
                <Ionicons name="arrow-undo" size={20} color={colors.vermilion} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {error ? (
          <ErrorBanner
            message={error}
            onRetry={retryGrade === null ? () => void load() : () => rate(retryGrade)}
          />
        ) : null}

        {current ? (
          <>
            <View style={styles.cardHeaderRow}>
              <CardStatusBadge status={cardPhase(current.scheduling, previewNow, scheduling)} />
            </View>
            <View style={styles.stack}>
              {next ? (
                <FlashCardView
                  key={next.id}
                  preview
                  card={next}
                  mode={studyMode}
                  skill={skill}
                  allowHints={studyMode !== 'exam'}
                />
              ) : null}
              <FlashCardView
                key={current.id}
                card={current}
                mode={studyMode}
                skill={skill}
                allowHints={studyMode !== 'exam'}
                intervals={currentIntervals}
                revealed={revealed}
                onReveal={() => setRevealed(true)}
                onRate={rate}
                ratingDisabled={reviewing}
                pendingGrade={pendingGrade}
                onPanActiveChange={setSwiping}
              />
            </View>
            {revealed ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Desliza a la izquierda para «Otra vez» y a la derecha para «Bien»
              </Text>
            ) : null}
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    minHeight: 32,
  },
  dueDot: { width: 8, height: 8, borderRadius: tokens.radius.pill },
  dueLabel: { fontSize: tokens.fontSize.xs, fontWeight: '700' },

  sectionTitle: { fontSize: tokens.fontSize.sm, fontWeight: '600', marginBottom: tokens.spacing.xs },
  skillTitle: { marginTop: tokens.spacing.md },
  modeHint: {
    fontSize: tokens.fontSize.xs,
    marginTop: tokens.spacing.xs,
    lineHeight: 16,
  },

  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  reviewHeaderCenter: {
    flex: 1,
  },
  reviewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: tokens.radius.pill },
  counterLabel: { fontSize: tokens.fontSize.xs, fontWeight: '700' },
  timerLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: tokens.spacing.xs,
  },

  stack: { position: 'relative' },
  hint: { fontSize: tokens.fontSize.xs, textAlign: 'center' },

  done: { alignItems: 'center', gap: tokens.spacing.lg, paddingVertical: tokens.spacing.xl },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  doneBody: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
  statsCard: { width: '100%' },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: tokens.spacing.sm,
  },
  statCell: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  statLabel: { fontSize: tokens.fontSize.xs },
  completeActions: { width: '100%', gap: tokens.spacing.sm },
});
