import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { resolveGloss, toUserMessage, type DeckSummary, type HskLevel, type Word } from '@hanyu/data';
import { getData } from '../lib/data';
import { useSupportLanguage } from '../lib/useSupportLanguage';
import { useWords } from '../words/useWords';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const LEVELS: Array<{ label: string; value: HskLevel | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'HSK 1', value: 1 },
  { label: 'HSK 2', value: 2 },
  { label: 'HSK 3', value: 3 },
];

export function WordsScreen() {
  const { colors } = useTheme();
  const supportLanguage = useSupportLanguage();
  const router = useRouter();
  const words = useWords();
  const flashcards = useRef(getData().flashcards);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState<Record<number, boolean>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    getData()
      .decks.getDecks()
      .then((list) => {
        if (disposed) return;
        setDecks(list);
        const fallback = list.find((deck) => deck.is_default) ?? list[0] ?? null;
        setSelectedDeckId(fallback?.id ?? null);
      })
      .catch(() => {
        if (!disposed) setDecks([]);
      });

    return () => {
      disposed = true;
    };
  }, []);

  async function addWord(word: Word) {
    if (added[word.id] || adding[word.id] || word.in_srs) {
      return;
    }

    setAdding(current => ({ ...current, [word.id]: true }));
    setAddError(null);
    try {
      if (selectedDeckId) {
        await flashcards.current.addCard(word.id, selectedDeckId);
      } else {
        await flashcards.current.addCard(word.id);
      }
      setAdded(current => ({ ...current, [word.id]: true }));
    } catch (caught) {
      const message = toUserMessage(caught);
      if (message.toLowerCase().includes('already')) {
        setAdded(current => ({ ...current, [word.id]: true }));
      } else {
        setAddError(message);
      }
    } finally {
      setAdding(current => ({ ...current, [word.id]: false }));
    }
  }

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Library</Text>
        <Text style={[styles.title, { color: colors.text }]}>Words</Text>
      </View>

      <TextInput
        placeholder="Search words"
        placeholderTextColor={colors.textMuted}
        value={words.query}
        onChangeText={words.setQuery}
        autoCapitalize="none"
        style={[styles.search, { color: colors.text, borderColor: colors.border }]}
      />

      <View style={styles.filters}>
        {LEVELS.map(level => (
          <Pressable
            key={level.label}
            accessibilityRole="button"
            accessibilityLabel={level.label}
            accessibilityState={{ selected: words.level === level.value }}
            onPress={() => words.setLevel(level.value)}
            style={[
              styles.filter,
              {
                borderColor: words.level === level.value ? colors.vermilion : colors.border,
                backgroundColor: words.level === level.value ? colors.surface : colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{level.label}</Text>
          </Pressable>
        ))}
      </View>

      {decks !== null && decks.length > 0 ? (
        <View style={styles.filters}>
          {decks.map(deck => {
            const selected = deck.id === selectedDeckId;
            return (
              <Pressable
                key={deck.id}
                accessibilityRole="button"
                accessibilityLabel={`Deck ${deck.name}`}
                accessibilityState={{ selected }}
                onPress={() => setSelectedDeckId(deck.id)}
                style={[
                  styles.filter,
                  {
                    borderColor: selected ? colors.vermilion : colors.border,
                    backgroundColor: selected ? colors.surface : colors.bg,
                  },
                ]}
              >
                <Text style={{ color: selected ? colors.text : colors.textMuted }}>{deck.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {decks !== null && decks.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a deck to store words"
          onPress={() => router.push('/library/decks')}
          style={[styles.noDeckHint, { borderColor: colors.border }]}
        >
          <Text style={[styles.noDeckText, { color: colors.textMuted }]}>
            No decks yet. Create one to organize these words.
          </Text>
        </Pressable>
      ) : null}

      {words.error ? <ErrorBanner message={words.error} onRetry={words.reload} /> : null}
      {addError ? <ErrorBanner message={addError} /> : null}
      {words.loading ? <ActivityIndicator /> : null}

      <Text style={[styles.count, { color: colors.textMuted }]}>
        {words.total} results · page {words.page}
      </Text>

      {!words.loading && words.words.length === 0 ? (
        <EmptyState title="No words found" body="Try another search or HSK level." />
      ) : null}

      {words.words.map(word => {
        const isAdded = added[word.id] || word.in_srs;
        const isAdding = adding[word.id];
        return (
          <Card key={word.id}>
            <View style={styles.wordHeader}>
              <View style={styles.wordTitle}>
                <Text style={[styles.hanzi, { color: colors.text }]}>{word.hanzi}</Text>
                <Text style={[styles.pinyin, { color: colors.textMuted }]}>{word.pinyin}</Text>
              </View>
              <Badge label={`HSK ${word.hsk_level}`} />
            </View>
            <Text style={[styles.meaning, { color: colors.text }]}>
              {resolveGloss(word, supportLanguage)}
            </Text>
            {word.pos ? <Badge label={word.pos} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${word.hanzi} to Cards`}
              accessibilityState={{ disabled: isAdded || isAdding }}
              disabled={isAdded || isAdding}
              onPress={() => addWord(word)}
              style={[
                styles.addButton,
                {
                  borderColor: colors.border,
                  backgroundColor: isAdded ? colors.surface : colors.vermilion,
                  opacity: isAdding ? 0.5 : 1,
                },
              ]}
            >
              <Text style={{ color: isAdded ? colors.text : colors.onAccent }}>
                {isAdded ? 'Added' : isAdding ? 'Adding...' : 'Add'}
              </Text>
            </Pressable>
          </Card>
        );
      })}

      <View style={styles.pager}>
        <Button
          label="Previous page"
          variant="secondary"
          onPress={words.previousPage}
          disabled={!words.canPrevious}
        />
        <Button
          label="Next page"
          variant="secondary"
          onPress={words.nextPage}
          disabled={!words.canNext}
        />
      </View>
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
  search: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    padding: tokens.spacing.md,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  filter: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDeckHint: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  noDeckText: {
    fontSize: tokens.fontSize.sm,
  },
  count: {
    fontSize: tokens.fontSize.sm,
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  wordTitle: {
    flex: 1,
  },
  hanzi: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
  },
  pinyin: {
    fontSize: tokens.fontSize.md,
  },
  meaning: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  addButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  pager: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
});
