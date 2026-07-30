import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import {
  toUserMessage,
  type FlashcardStats,
  type StreakPayload,
  type TodayPayload,
} from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';
import { StatusBarChart } from '../ui/StatusBarChart';

export default function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [streak, setStreak] = useState<StreakPayload>({ current: 0, longest: 0 });
  const [cards, setCards] = useState<FlashcardStats['by_status']>({});
  const [cardTotal, setCardTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();

      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void load();
        }
      });

      return () => subscription.remove();
    }, [load]),
  );

  if (loading && !today) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Today</Text>
      <Badge label={`HSK${today?.profile.current_level ?? 2} consolidation`} />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {today ? (
        <>
          <Card>
            <Text style={[styles.metric, { color: colors.text }]}>
              {`${streak.current} day streak`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`Longest ${streak.longest} days`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`${today.progress.completed_blocks} of ${today.progress.total_blocks} blocks done`}
            </Text>
          </Card>

          <Card>
            <Text style={[styles.metric, { color: colors.text }]}>
              {`${today.flashcards.due} cards due`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`Reviewed ${today.flashcards.completed} of ${today.flashcards.target} today · deck ${today.flashcards.deck_size}`}
            </Text>
            <Button label="Start review" onPress={() => router.push('/cards')} />
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Deck breakdown</Text>
            <StatusBarChart byStatus={cards} total={cardTotal} />
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Rest of the session</Text>
            <View style={styles.row}>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {`Exercises ${today.exercises.completed}/${today.exercises.target}`}
              </Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {`Reading ${today.reading.completed}/${today.reading.target}`}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Start exercises" onPress={() => router.push('/practice/exercises')} />
              <Button
                label="Start reading"
                variant="secondary"
                onPress={() => router.push('/practice/readings')}
              />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  sectionTitle: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  metric: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  muted: { fontSize: tokens.fontSize.sm },
  row: { flexDirection: 'row', gap: tokens.spacing.lg },
  actions: { gap: tokens.spacing.sm },
});
