import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  toUserMessage,
  type FlashcardStats,
  type PlanStep,
  type StreakPayload,
  type TodayPayload,
} from '@hanyu/data';
import { getData } from '../lib/data';
import {
  clearReviewSession,
  loadReviewSession,
  type ReviewSessionSnapshot,
} from '../lib/reviewSessionStore';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { ActiveSessionBanner } from '../ui/ActiveSessionBanner';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { ProgressRing } from '../ui/ProgressRing';
import { Screen } from '../ui/Screen';
import { StatusBarChart } from '../ui/StatusBarChart';
import { reasonToText, unavailableToText } from '../lib/planCopy';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MOTION_DISABLED = process.env.NODE_ENV === 'test';
const EASE = Easing.out(Easing.cubic);

function dateLabel(): string {
  const now = new Date();
  return `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

function fraction(completed: number, target: number): `${number}%` {
  if (target <= 0) {
    return '0%';
  }
  const ratio = Math.min(1, Math.max(0, completed / target));
  return `${Math.round(ratio * 100)}%`;
}

function isDone(completed: number, target: number): boolean {
  return target > 0 && completed >= target;
}

interface TodayTask {
  key: string;
  icon: IconName;
  primary: string;
  sub: string;
  why: string[];
  unitTitle?: string;
  unitProgress?: string;
  width: `${number}%`;
  done: boolean;
  status: 'ready' | 'unavailable';
  cta?: string;
  go?: () => void;
}

const STEP_ICONS: Record<PlanStep['kind'], IconName> = {
  reviews: 'albums',
  relearning: 'refresh',
  new_items: 'sparkles',
  reading: 'book',
  exercises: 'clipboard',
  exam: 'timer',
};

const STEP_LABELS: Record<PlanStep['kind'], string> = {
  reviews: 'Reviews',
  relearning: 'Relearning',
  new_items: 'New words',
  reading: 'Reading',
  exercises: 'Exercises',
  exam: 'Exam practice',
};

function planStepTask(
  step: PlanStep,
  go: () => void,
): TodayTask {
  const payload = step.payload ?? {};
  const count = typeof payload.count === 'number' ? payload.count : null;
  const completed = typeof payload.completed === 'number' ? payload.completed : null;
  const target = typeof payload.target === 'number' ? payload.target : null;
  const grammarOnly = payload.grammar_only === true;
  const label = STEP_LABELS[step.kind];
  const primary = grammarOnly
    ? 'Grammar practice'
    : count === null ? label : `${count} ${step.kind === 'new_items' ? 'new words' : label.toLowerCase()}`;
  const unitTitle = typeof payload.unit_title === 'string' ? payload.unit_title : undefined;
  const unitProgress = typeof payload.unit_progress === 'string' ? payload.unit_progress : undefined;
  const why = step.why?.map(reasonToText) ?? [];
  const unitProgressMatch = unitProgress?.match(/^(\d+)\/(\d+)$/);
  const unitCompleted = unitProgressMatch ? Number(unitProgressMatch[1]) : null;
  const unitTarget = unitProgressMatch ? Number(unitProgressMatch[2]) : null;
  const progressCompleted = completed ?? unitCompleted;
  const progressTarget = target ?? unitTarget;
  const progressSub = step.kind === 'reviews' && completed !== null && target !== null
    ? `Reviewed ${completed} of ${target} today`
    : '';

  return {
    key: step.kind,
    icon: STEP_ICONS[step.kind],
    primary,
    sub: step.status === 'unavailable'
      ? unavailableToText(step.reason, step.kind)
      : progressSub,
    why,
    unitTitle,
    unitProgress,
    width: progressCompleted !== null && progressTarget !== null
      ? fraction(progressCompleted, progressTarget)
      : '0%',
    done: progressCompleted !== null && progressTarget !== null
      ? isDone(progressCompleted, progressTarget)
      : false,
    status: step.status,
    cta: step.status === 'ready'
      ? grammarOnly ? 'Open grammar' : `Start ${step.kind === 'new_items' ? 'learning' : step.kind}`
      : undefined,
    go: step.status === 'ready' ? go : undefined,
  };
}

function Reveal({ index = 0, children }: { index?: number; children: ReactNode }) {
  const value = useRef(new Animated.Value(MOTION_DISABLED ? 1 : 0)).current;
  const reduceMotion = useRef(false);
  const [ready, setReady] = useState(MOTION_DISABLED);

  useEffect(() => {
    if (MOTION_DISABLED) {
      return;
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotion.current = enabled;
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (MOTION_DISABLED || !ready) {
      return;
    }
    if (reduceMotion.current) {
      value.setValue(1);
      return;
    }
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: 260,
      delay: index * 70,
      easing: EASE,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [ready, index, value]);

  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [streak, setStreak] = useState<StreakPayload>({ current: 0, longest: 0 });
  const [cards, setCards] = useState<FlashcardStats['by_status']>({});
  const [cardTotal, setCardTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState<ReviewSessionSnapshot | null>(null);

  const load = useCallback(async () => {
    setError('');

    const data = getData();

    try {
      const payload = (await data.today.getToday()) as TodayPayload;
      setToday(payload);
    } catch (caught) {
      setError(toUserMessage(caught));
      setLoading(false);
      return;
    }

    try {
      const dashboard = (await data.stats.getDashboard()) as {
        streak: StreakPayload;
        cards: { total: number; by_status: FlashcardStats['by_status'] };
      };
      setStreak(dashboard.streak ?? { current: 0, longest: 0 });
      setCards(dashboard.cards?.by_status ?? {});
      setCardTotal(dashboard.cards?.total ?? 0);
    } catch {
      setStreak({ current: 0, longest: 0 });
    }

    setSessionSnapshot(await loadReviewSession());
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load();
      }
    });
    return () => sub.remove();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !today) {
    return (
      <Screen>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={[styles.skeleton, { width: 190, height: 26, backgroundColor: colors.border }]} />
          </View>
        </View>
        <View style={[styles.skeletonHero, { backgroundColor: colors.surface }]} />
        <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]} />
        <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]} />
      </Screen>
    );
  }

  const blocks = today?.progress.total_blocks ?? 0;
  const blocksDone = today?.progress.completed_blocks ?? 0;
  const allDone = blocks > 0 && blocksDone >= blocks;

  const legacyTasks: TodayTask[] = today
    ? [
        {
          key: 'review',
          icon: 'albums',
          primary: `${today.flashcards.due} cards due`,
          sub: `Reviewed ${today.flashcards.completed} of ${today.flashcards.review_target} today`,
          why: [],
          width: fraction(today.flashcards.completed, today.flashcards.review_target),
          done: isDone(today.flashcards.completed, today.flashcards.review_target),
          status: 'ready',
          cta: 'Start review',
          go: () => router.push('/cards'),
        },
        {
          key: 'exercises',
          icon: 'clipboard',
          primary: `Exercises ${today.exercises.completed}/${today.exercises.target}`,
          sub: 'Grammar and sentence drills',
          why: [],
          width: fraction(today.exercises.completed, today.exercises.target),
          done: isDone(today.exercises.completed, today.exercises.target),
          status: 'ready',
          cta: 'Start exercises',
          go: () => router.push('/practice/exercises'),
        },
        {
          key: 'reading',
          icon: 'book',
          primary: `Reading ${today.reading.completed}/${today.reading.target}`,
          sub: today.reading.next?.title ? `Up next: ${today.reading.next.title}` : 'One short passage',
          why: [],
          width: fraction(today.reading.completed, today.reading.target),
          done: isDone(today.reading.completed, today.reading.target),
          status: 'ready',
          cta: 'Start reading',
          go: () => router.push('/practice/readings'),
        },
      ]
    : [];

  const planSteps = Array.isArray((today as (TodayPayload & { steps?: unknown }) | null)?.steps)
    ? (today as TodayPayload).steps
    : null;
  const tasks: TodayTask[] = today && planSteps
    ? planSteps.map((step) => planStepTask(step, () => {
        const payload = step.payload ?? {};
        if (step.kind === 'new_items' && typeof payload.grammar_id === 'number') {
          router.push({
            pathname: '/library/grammar/[id]',
            params: {
              id: String(payload.grammar_id),
              level: String(typeof payload.unit_level === 'number' ? payload.unit_level : today.profile.current_level),
            },
          });
        } else if (step.kind === 'exercises') {
          router.push('/practice/exercises');
        } else if (step.kind === 'reading') {
          router.push('/practice/readings');
        } else {
          router.push('/cards');
        }
      }))
    : legacyTasks;

  const nextPendingKey = tasks.find((task) => task.status === 'ready' && !task.done)?.key;

  return (
    <Screen
      testID="today-scroll"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.vermilion}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.heading, { color: colors.text }]}>{dateLabel()}</Text>
        </View>
        {today ? (
          <Badge label={`HSK${today.profile.current_level ?? 2}`} />
        ) : null}
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {today ? (
        <>
          <ActiveSessionBanner
            snapshot={sessionSnapshot}
            onContinue={() => router.push('/cards')}
            onDiscard={() => {
              void clearReviewSession().then(() => setSessionSnapshot(null));
            }}
          />

          <Reveal index={0}>
            <View style={[styles.hero, { backgroundColor: colors.vermilion }]}>
              <View style={styles.heroTop}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroLabel, { color: colors.onAccent + 'E6' }]}>
                    Current streak
                  </Text>
                  <Text style={[styles.heroMetric, { color: colors.onAccent }]}>
                    {`${streak.current} day streak`}
                  </Text>
                  <Text style={[styles.heroMuted, { color: colors.onAccent + 'E6' }]}>
                    {`Longest ${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}`}
                  </Text>
                </View>
                <View style={[styles.heroIcon, { backgroundColor: colors.onAccent + '1F' }]}>
                  <Ionicons name="flame" size={24} color={colors.gold} />
                </View>
              </View>

              <View style={[styles.heroDivider, { backgroundColor: colors.onAccent + '33' }]} />

              <Text style={[styles.heroMuted, { color: colors.onAccent + 'E6' }]}>
                {`${blocksDone} of ${blocks} blocks completed today`}
              </Text>
              <ProgressRing
                segments={blocks}
                completed={blocksDone}
                fillColor={colors.onAccent}
                trackColor={colors.onAccent + '33'}
              />
            </View>
          </Reveal>

          <Reveal index={1}>
            {allDone ? (
              <Card style={styles.completedCard}>
                <View style={styles.completedHeader}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.gold} />
                  <Text style={[styles.completedTitle, { color: colors.text }]}>
                    Session complete! Well done.
                  </Text>
                  <Text style={[styles.completedSub, { color: colors.textMuted }]}>
                    You fulfilled all daily study goals. Want to do extra practice?
                  </Text>
                </View>
                <View style={styles.extraPracticeRow}>
                  <Button label="Quick review" variant="outline" onPress={() => router.push('/cards')} />
                  <Button label="Free reading" variant="outline" onPress={() => router.push('/practice/readings')} />
                  <Button label="Browse grammar" variant="outline" onPress={() => router.push('/library/grammar')} />
                </View>
              </Card>
            ) : (
              <Card>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Your plan for today</Text>

                {tasks.map((task, index) => (
                  <View key={task.key}>
                    {index > 0 ? (
                      <View style={[styles.taskDivider, { backgroundColor: colors.border }]} />
                    ) : null}

                    <View
                      style={[
                        styles.task,
                        task.status === 'unavailable' ? styles.unavailableTask : null,
                      ]}
                    >
                      <View style={styles.taskHead}>
                        <View
                          style={[
                            styles.taskIcon,
                            {
                              backgroundColor:
                                (task.status === 'unavailable'
                                  ? colors.textMuted
                                  : task.done
                                    ? colors.gold
                                    : colors.vermilion) + '1A',
                            },
                          ]}
                        >
                          <Ionicons
                            name={task.icon}
                            size={20}
                            color={
                              task.status === 'unavailable'
                                ? colors.textMuted
                                : task.done
                                  ? colors.gold
                                  : colors.vermilion
                            }
                          />
                        </View>
                        <View style={styles.taskText}>
                          <Text
                            style={[
                              styles.taskPrimary,
                              { color: task.status === 'unavailable' ? colors.textMuted : colors.text },
                            ]}
                          >
                            {task.primary}
                          </Text>
                          {task.unitTitle ? (
                            <Text style={[styles.taskSub, { color: colors.text }]}>{task.unitTitle}</Text>
                          ) : null}
                          {task.unitProgress ? (
                            <Text style={[styles.taskSub, { color: colors.textMuted }]}>{task.unitProgress}</Text>
                          ) : null}
                          {task.sub ? (
                            <Text style={[styles.taskSub, { color: colors.textMuted }]}>{task.sub}</Text>
                          ) : null}
                          {task.why.map((reason, reasonIndex) => (
                            <Text key={`${task.key}-reason-${reasonIndex}`} style={[styles.taskSub, { color: colors.textMuted }]}> 
                              {reason}
                            </Text>
                          ))}
                        </View>
                        {task.status === 'ready' && task.done ? (
                          <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
                        ) : null}
                      </View>

                      {task.status === 'ready' ? (
                        <>
                          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                            <View
                              style={[
                                styles.progressFill,
                                { backgroundColor: colors.vermilion, width: task.width },
                              ]}
                            />
                          </View>

                          <Button
                            label={task.done ? 'Done' : task.cta ?? 'Start'}
                            variant={task.done ? 'outline' : task.key === nextPendingKey ? 'primary' : 'outline'}
                            onPress={task.go ?? (() => undefined)}
                            disabled={task.done}
                          />
                        </>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </Reveal>

          <Reveal index={2}>
            <Card style={{ gap: tokens.spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Progreso real</Text>
                <Button
                  label="Ver analítica"
                  variant="outline"
                  onPress={() => router.push('/progress')}
                />
              </View>
              <Text style={[styles.taskSub, { color: colors.textMuted }]}>
                Retención observada, dominio por habilidad y velocidad de lectura.
              </Text>
            </Card>
          </Reveal>

          <Reveal index={3}>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Deck breakdown</Text>
              <StatusBarChart byStatus={cards} total={cardTotal} />
            </Card>
          </Reveal>
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
  headerText: { gap: tokens.spacing.xs },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },

  hero: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  heroCopy: { gap: tokens.spacing.xs, flexShrink: 1 },
  heroLabel: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroMetric: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMuted: { fontSize: tokens.fontSize.sm },
  heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: tokens.spacing.sm },

  sectionTitle: { fontSize: tokens.fontSize.md, fontWeight: '600' },

  task: { gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  unavailableTask: { opacity: 0.72 },
  taskDivider: { height: StyleSheet.hairlineWidth, marginTop: tokens.spacing.sm },
  taskHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskText: { flex: 1, gap: 2 },
  taskPrimary: { fontSize: tokens.fontSize.md, fontWeight: '700' },
  taskSub: { fontSize: tokens.fontSize.sm },

  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },

  completedCard: {
    paddingVertical: tokens.spacing.xl,
    gap: tokens.spacing.lg,
    alignItems: 'center',
  },
  completedHeader: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  completedTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  completedSub: {
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
  },
  extraPracticeRow: {
    gap: tokens.spacing.sm,
    width: '100%',
  },

  skeleton: { borderRadius: tokens.radius.sm },
  skeletonHero: { height: 168, borderRadius: tokens.radius.xl },
  skeletonCard: {
    height: 220,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
  },
});
