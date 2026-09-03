import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type DueCard, type FlashcardStats } from '@hanyu/data';
import { cardPhase, previewIntervals, schedulingParams, type Grade } from '@hanyu/domain';
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
import { FlashCardView, type ReviewMode } from '../ui/FlashCardView';
import { ActiveSessionBanner } from '../ui/ActiveSessionBanner';
import { Screen } from '../ui/Screen';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import { StatusBarChart } from '../ui/StatusBarChart';

const MODES: ReviewMode[] = ['recognition', 'recall', 'listening'];
const MODE_OPTIONS: SegmentedOption<ReviewMode>[] = MODES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

const INTRA_SESSION_HORIZON_MS = 30 * 60 * 1000;

type ScreenPhase = 'pre-session' | 'reviewing' | 'complete';
type SessionSize = 'quick' | 'all';

interface UndoEntry {
  card: DueCard;
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
  const { service, ready } = useOfflineReview();
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const focusedDeckId = typeof deckId === 'string' && deckId.length > 0 ? deckId : null;

  const [phase, setPhase] = useState<ScreenPhase>('pre-session');
  const [allDueCards, setAllDueCards] = useState<DueCard[]>([]);
  const [activeCards, setActiveCards] = useState<DueCard[]>([]);
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [byStatus, setByStatus] = useState<FlashcardStats['by_status']>({});
  const [deckTotal, setDeckTotal] = useState(0);

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ReviewMode>('recognition');
  const [sessionSize, setSessionSize] = useState<SessionSize>('all');
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
  const [requestRetention, setRequestRetention] = useState(0.9);

  const timer = useSessionTimer();
  const sessionId = useRef<string | null>(null);
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());

  const load = useCallback(async (selectedSkill: ReviewMode = mode) => {
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

      const cards = selectedSkill === 'recognition'
        ? await service.loadDueCards(50, focusedDeckId)
        : await service.loadDueCards(50, focusedDeckId, selectedSkill);
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
        const settings = await data.settings.getSettings();
        setRequestRetention(Number(settings.request_retention ?? 0.9));
      } catch {
        // Scheduling previews use the default when settings are unavailable.
      }
      try {
        const dashboard = await data.stats.getDashboard();
        setByStatus(dashboard.cards?.by_status ?? {});
        if (!focusedDeckId) {
          setDeckSize(dashboard.cards?.total ?? 0);
        }
        setDeckTotal(dashboard.cards?.total ?? 0);
      } catch {
        // non-blocking for cards load
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [focusedDeckId, ready, service]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadReviewSession().then(setResumable);
  }, []);

  function startReview() {
    const limit = sessionSize === 'quick' ? 10 : allDueCards.length;
    const sessionCards = allDueCards.slice(0, limit);
    setActiveCards(sessionCards);
    setIndex(0);
    setReviewed(0);
    setRevealed(false);
    setUndoStack([]);
    setStats({ reviewed: 0, correct: 0, again: 0 });
    sessionStartedAt.current = Date.now();
    cardStartedAt.current = Date.now();
    sessionId.current = randomUUID();
    timer.start();
    setPhase('reviewing');
    void saveReviewSession({
      session_id: sessionId.current,
      deck_id: focusedDeckId,
      card_ids: sessionCards.map((card) => card.id),
      index: 0,
      mode,
      started_at: sessionStartedAt.current,
      reviewed: 0,
      stats: { reviewed: 0, correct: 0, again: 0 },
    });
  }

  function resumeSession(snapshot: ReviewSessionSnapshot) {
    const byId = new Map(allDueCards.map((entry) => [entry.id, entry]));
    const queue = snapshot.card_ids
      .map((id) => byId.get(id))
      .filter((entry): entry is DueCard => Boolean(entry));

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
    setMode(snapshot.mode);
    setUndoStack([]);
    setRevealed(false);
    sessionId.current = snapshot.session_id;
    sessionStartedAt.current = snapshot.started_at;
    cardStartedAt.current = Date.now();
    timer.start();
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
      mode,
      started_at: sessionStartedAt.current,
      reviewed: nextReviewed,
      stats: nextStats,
    });
  }

  async function rate(grade: Grade) {
    const current = activeCards[index];
    if (!current || reviewing || !service) {
      return;
    }

    setReviewing(true);
    setPendingGrade(grade);
    setError('');

    let reviewId: string;
    let ratedCard: DueCard;
    try {
      const result = await service.rateCard(
        current,
        grade,
        Date.now() - cardStartedAt.current,
      );
      reviewId = result.reviewId;
      ratedCard = result.card;
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

    const dueAt = Date.parse(ratedCard.scheduling.due);
    const requeueIntraday = Number.isFinite(dueAt) && dueAt - Date.now() < INTRA_SESSION_HORIZON_MS;
    const nextCards = requeueIntraday ? [...activeCards, ratedCard] : activeCards;

    setUndoStack((prev) => [
      ...prev.slice(-4),
      { card: current, previousIndex: index, grade, reviewId, requeued: requeueIntraday },
    ]);

    if (index + 1 >= nextCards.length) {
      timer.stop();
      void clearReviewSession();
      setPhase('complete');

      try {
        await getData().stats.logTime(Date.now() - sessionStartedAt.current);
      } catch {
        // Study time is not worth blocking the summary for.
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
      mode,
      started_at: sessionStartedAt.current,
      reviewed: nextReviewed,
      stats: nextStats,
    });
  }

  async function createStarterDeck() {
    setLoading(true);
    setError('');

    try {
      await getData().flashcards.createStarterDeck({
        strategy: 'hsk2_consolidation',
        limit: 150,
      });
      await load();
    } catch (caught) {
      setError(toUserMessage(caught));
      setLoading(false);
    }
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
          <Text style={[styles.doneTitle, { color: colors.text }]}>Session complete</Text>
          <Text style={[styles.doneBody, { color: colors.textMuted }]}>
            Great work! You reviewed {stats.reviewed} {stats.reviewed === 1 ? 'card' : 'cards'}.
          </Text>

          <Card style={styles.statsCard}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stats.reviewed}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Reviewed</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.vermilion }]}>{accuracy}%</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Accuracy</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.text }]}>{timer.formatted}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Time</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.gold }]}>{stats.again}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Again</Text>
              </View>
            </View>
          </Card>

          <View style={styles.completeActions}>
            <Button label="Review again" variant="outline" onPress={load} />
            <Button label="Back to Today" variant="primary" onPress={() => router.push('/today')} />
            {focusedDeckId ? (
              <Button
                label="Back to deck"
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
    const dueCount = allDueCards.length;

    return (
      <Screen>
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>Reviews</Text>
          {dueCount > 0 ? (
            <View style={[styles.due, { backgroundColor: colors.vermilion + '18' }]}>
              <View style={[styles.dueDot, { backgroundColor: colors.vermilion }]} />
              <Text style={[styles.dueLabel, { color: colors.vermilion }]}>{`${dueCount} due`}</Text>
            </View>
          ) : null}
        </View>

        {error ? (
          <ErrorBanner message={error} onRetry={load} />
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

        {dueCount === 0 ? (
          deckSize === 0 ? (
            <EmptyState
              title="Set up your HSK2 starter deck"
              body="Start with 150 HSK1 review and HSK2 consolidation cards. You can add custom words later."
              actionLabel="Create starter deck"
              onAction={createStarterDeck}
              actionDisabled={loading}
            />
          ) : (
            <EmptyState
              title="No cards due right now"
              body="You have reviewed everything due today. Come back tomorrow to keep your streak!"
            />
          )
        ) : (
          <>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Review Mode</Text>
              <Segmented
                options={MODE_OPTIONS}
                value={mode}
                onChange={(selectedSkill) => {
                  setMode(selectedSkill);
                  void load(selectedSkill);
                }}
              />
            </Card>

            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Session Size</Text>
              <Segmented
                options={[
                  { value: 'quick', label: `Quick (${Math.min(10, dueCount)})` },
                  { value: 'all', label: `All due (${dueCount})` },
                ]}
                value={sessionSize}
                onChange={setSessionSize}
              />
            </Card>

            <Button label="Start review" variant="primary" onPress={startReview} />

            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Deck breakdown</Text>
              <StatusBarChart byStatus={byStatus} total={deckTotal} />
            </Card>
          </>
        )}
      </Screen>
    );
  }

  // --- PHASE: REVIEWING ---
  const current = activeCards[index];
  const next = activeCards[index + 1];
  const counter = activeCards.length
    ? `${Math.min(index + 1, activeCards.length)}/${activeCards.length}`
    : '0/0';
  const progress: `${number}%` = activeCards.length
    ? `${Math.round(Math.min(1, reviewed / activeCards.length) * 100)}%`
    : '0%';

  return (
    <Screen scrollEnabled={!swiping}>
      <View style={styles.reviewHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close review session"
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
          <Text style={[styles.timerLabel, { color: colors.textMuted }]}>{timer.formatted}</Text>
          {undoStack.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo last rating"
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
          onRetry={retryGrade === null ? load : () => rate(retryGrade)}
        />
      ) : null}

      {current ? (
        <>
          <View style={styles.cardHeaderRow}>
            <CardStatusBadge status={cardPhase(current.scheduling)} />
          </View>
          <View style={styles.stack}>
            {next ? <FlashCardView key={next.id} preview card={next} mode={mode} /> : null}
            <FlashCardView
              card={current}
              mode={mode}
              intervals={previewIntervals(current.scheduling, new Date(), schedulingParams({ request_retention: requestRetention }))}
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
              Swipe left for Again, right for Good
            </Text>
          ) : null}
        </>
      ) : null}
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
