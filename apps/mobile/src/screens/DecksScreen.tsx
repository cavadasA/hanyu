import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type DeckSummary } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function DecksScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await getData().decks.getDecks();
      setDecks(list);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleActive(deck: DeckSummary) {
    const next = !deck.is_active;
    const previous = decks;
    setDecks((current) =>
      (current ?? []).map((d) => (d.id === deck.id ? { ...d, is_active: next } : d)),
    );
    try {
      await getData().decks.updateDeck(deck.id, { is_active: next });
    } catch (caught) {
      setDecks(previous);
      setError(toUserMessage(caught));
    }
  }

  async function createNewDeck() {
    setCreating(true);
    setError(null);
    try {
      const deck = await getData().decks.createDeck({ name: 'Mazo nuevo' });
      setCreating(false);
      router.push(`/library/decks/${deck.id}`);
    } catch (caught) {
      setError(toUserMessage(caught));
      setCreating(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Biblioteca</Text>
          <Text style={[styles.title, { color: colors.text }]}>Mazos</Text>
        </View>
        <Button
          label="Catálogo"
          variant="secondary"
          onPress={() => router.push('/library/decks/catalog')}
        />
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {decks === null ? <ActivityIndicator /> : null}

      {decks !== null && decks.length === 0 ? (
        <EmptyState
          title="Todavía no tienes mazos"
          body="Añade un mazo del catálogo para empezar."
          actionLabel="Añadir del catálogo"
          onAction={() => router.push('/library/decks/catalog')}
        />
      ) : null}

      {(decks ?? []).map((deck) => (
        <Card key={deck.id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${deck.name}`}
            onPress={() => router.push(`/library/decks/${deck.id}`)}
            style={styles.deckMain}
          >
            <Text style={[styles.deckName, { color: colors.text }]}>{deck.name}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {deck.word_count} words · {deck.due_count} due
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${deck.is_active ? 'Pausar' : 'Activar'} ${deck.name}`}
            accessibilityState={{ selected: deck.is_active }}
            onPress={() => toggleActive(deck)}
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
              style={[
                styles.toggleLabel,
                { color: deck.is_active ? colors.text : colors.textMuted },
              ]}
            >
              {deck.is_active ? 'Activo' : 'En pausa'}
            </Text>
          </Pressable>
        </Card>
      ))}

      <Button label="Nuevo mazo" variant="secondary" onPress={createNewDeck} busy={creating} />
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
  headerCopy: {
    flex: 1,
  },
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
  deckMain: {
    gap: tokens.spacing.xs,
  },
  deckName: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  meta: {
    fontSize: tokens.fontSize.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    alignSelf: 'flex-start',
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
});