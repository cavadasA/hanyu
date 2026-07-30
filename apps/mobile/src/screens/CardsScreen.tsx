import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type DueCard, type DueCardsPayload } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { FlashCardView, type ReviewMode } from '../ui/FlashCardView';
import { Screen } from '../ui/Screen';

const MODES: ReviewMode[] = ['recognition', 'recall', 'listening'];

export default function CardsScreen() {
  const { colors } = useTheme();
  const [cards, setCards] = useState<DueCard[]>([]);
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ReviewMode>('recognition');
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [retryQuality, setRetryQuality] = useState<number | null>(null);
  const [error, setError] = useState('');
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = (await getData().flashcards.getDueCards(50)) as DueCardsPayload;
      setCards(payload.cards ?? []);
      setDeckSize(payload.deck_size ?? 0);
      setIndex(0);
      setReviewed(0);
      setRevealed(false);
      setDone(false);
      setRetryQuality(null);
      sessionStartedAt.current = Date.now();
      cardStartedAt.current = Date.now();
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rate(quality: number) {
    const current = cards[index];
    if (!current || reviewing) {
      return;
    }

    setReviewing(true);
    setError('');

    try {
      await getData().flashcards.reviewCard(
        current.id,
        quality,
        Date.now() - cardStartedAt.current,
      );
    } catch (caught) {
      setError(toUserMessage(caught));
      setRetryQuality(quality);
      setReviewing(false);
      return;
    }

    setRetryQuality(null);
    setReviewing(false);
    setReviewed((count) => count + 1);

    if (index + 1 >= cards.length) {
      setDone(true);

      try {
        await getData().stats.logTime(Date.now() - sessionStartedAt.current);
      } catch {
        // Study time is not worth blocking the summary for.
      }

      return;
    }

    setIndex((value) => value + 1);
    setRevealed(false);
    cardStartedAt.current = Date.now();
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

  if (loading && !cards.length && deckSize === null) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <Text style={[styles.heading, { color: colors.text }]}>Session complete</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          {`You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}.`}
        </Text>
        <Button label="Review again" onPress={load} />
      </Screen>
    );
  }

  const current = cards[index];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Cards</Text>
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {cards.length ? `${Math.min(index + 1, cards.length)}/${cards.length}` : '0/0'}
        </Text>
      </View>

      <View style={styles.modes}>
        {MODES.map((item) => (
          <View key={item} style={styles.mode}>
            <Button
              label={item[0].toUpperCase() + item.slice(1)}
              variant={mode === item ? 'primary' : 'secondary'}
              onPress={() => setMode(item)}
            />
          </View>
        ))}
      </View>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={retryQuality === null ? load : () => rate(retryQuality)}
        />
      ) : null}

      {current ? (
        <FlashCardView
          card={current}
          mode={mode}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onRate={rate}
          ratingDisabled={reviewing}
        />
      ) : deckSize === null ? null : deckSize === 0 ? (
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
          body="You have reviewed everything due today. Come back tomorrow to keep the streak."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  counter: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  modes: { flexDirection: 'row', gap: tokens.spacing.sm },
  mode: { flexGrow: 1 },
  muted: { fontSize: tokens.fontSize.sm },
});
