import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage, type Deck } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

interface DeckWord {
  word_id: number;
  hanzi: string;
  pinyin: string | null;
  meaning_en: string | null;
  hsk_level: number | null;
}

export function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [words, setWords] = useState<DeckWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const decks = await getData().decks.getDecks();
      const found = decks.find((d) => d.id === id) ?? null;
      setDeck(found);
      const cards = await getData().decks.getDeckCards(id);
      setWords(cards.map((card: any) => card));
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveName() {
    if (!id || !nameDraft.trim()) {
      setRenaming(false);
      return;
    }
    try {
      const updated = await getData().decks.updateDeck(id, { name: nameDraft.trim() });
      setDeck((current) => (current ? { ...current, name: updated.name } : current));
      setError(null);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setRenaming(false);
    }
  }

  async function toggleActive() {
    if (!deck) return;
    const next = !deck.is_active;
    setDeck({ ...deck, is_active: next });
    try {
      await getData().decks.updateDeck(id, { is_active: next });
    } catch (caught) {
      setError(toUserMessage(caught));
      await load();
    }
  }

  async function removeWord(word: DeckWord) {
    setWords((current) => (current ?? []).filter((w) => w.word_id !== word.word_id));
    setError(null);
    try {
      await getData().decks.removeWordFromDeck(id, word.word_id);
    } catch (caught) {
      setError(toUserMessage(caught));
      await load();
    }
  }

  function confirmDelete() {
    Alert.alert('Delete deck', `Permanently delete ${deck?.name ?? 'this deck'}? Your review progress is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteDeck() },
    ]);
  }

  async function deleteDeck() {
    setDeleting(true);
    setError(null);
    try {
      await getData().decks.deleteDeck(id);
      router.back();
    } catch (caught) {
      setError(toUserMessage(caught));
      setDeleting(false);
    }
  }

  const nameText = renaming ? nameDraft : deck?.name;
  const wordsToShow = words ?? [];

  return (
    <Screen>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {deck === null ? <ActivityIndicator /> : null}

      {deck ? (
        <>
          <View style={styles.header}>
            <TextInput
              testID="deck-name-input"
              value={nameText}
              onChangeText={(value) => {
                setRenaming(true);
                setNameDraft(value);
              }}
              onSubmitEditing={saveName}
              onBlur={renaming ? saveName : undefined}
              placeholder="Deck name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              style={[styles.title, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={deck.is_active ? 'Pause' : 'Activate'}
              onPress={toggleActive}
              style={[
                styles.toggle,
                {
                  borderColor: colors.border,
                  backgroundColor: deck.is_active ? colors.surface : colors.bg,
                },
              ]}
            >
              <View
                style={[
                  styles.toggleDot,
                  { backgroundColor: deck.is_active ? colors.vermilion : colors.border },
                ]}
              />
              <Text
                style={[styles.toggleLabel, { color: deck.is_active ? colors.text : colors.textMuted }]}
              >
                {deck.is_active ? 'Active' : 'Paused'}
              </Text>
            </Pressable>
          </View>

          <Button
            label="Review this deck"
            variant="primary"
            onPress={() => router.push('/cards?deckId=' + id)}
          />

          {wordsToShow.length === 0 ? (
            <EmptyState
              title="No words yet"
              body="Add words from the Library to build this deck."
            />
          ) : (
            wordsToShow.map((word) => (
              <Card key={word.word_id}>
                <View style={styles.wordRow}>
                  <View style={styles.wordCopy}>
                    <Text style={[styles.hanzi, { color: colors.text }]}>{word.hanzi}</Text>
                    <Text style={[styles.pinyin, { color: colors.textMuted }]}>{word.pinyin}</Text>
                    <Text style={[styles.meaning, { color: colors.text }]}>{word.meaning_en}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${word.hanzi}`}
                    onPress={() => removeWord(word)}
                    style={[styles.removeButton, { borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.vermilion }}>Remove</Text>
                  </Pressable>
                </View>
              </Card>
            ))
          )}

          <Button
            label="Delete deck"
            variant="outline"
            onPress={confirmDelete}
            disabled={deleting}
            busy={deleting}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  title: {
    flex: 1,
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    paddingVertical: tokens.spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    minHeight: 44,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: tokens.radius.pill,
  },
  toggleLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  wordCopy: {
    flex: 1,
    gap: 2,
  },
  hanzi: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  pinyin: {
    fontSize: tokens.fontSize.sm,
  },
  meaning: {
    fontSize: tokens.fontSize.sm,
  },
  removeButton: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});