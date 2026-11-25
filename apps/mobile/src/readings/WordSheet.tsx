import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type Word, type WordContext } from '@hanyu/data';
import { getData } from '../lib/data';
import type { Sentence } from '../lib/sentenceOf';
import { useSupportLanguage } from '../lib/useSupportLanguage';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface Props {
  word?: Word | null;
  senses?: ReadingSense[];
  text: string;
  sentence: Sentence | null;
  readingId: string;
  onClose(): void;
}

export interface ReadingSense {
  id: number;
  hanzi: string;
  pinyin: string;
  meaning_en?: string | null;
  meaning_es?: string | null;
  hsk_level?: number | null;
  sense_index?: number | null;
  traditional?: string | null;
  pos?: string | null;
  classifier?: string | null;
  in_srs?: boolean;
}

export function WordSheet({
  word,
  senses: providedSenses,
  text,
  sentence,
  readingId,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const supportLanguage = useSupportLanguage();
  const flashcards = useRef(getData().flashcards);
  const senses = providedSenses ?? (word ? [word] : []);
  // La acepción del token la decide la lectura (anotada y validada en la
  // build); la ficha no adivina por nivel. Las demás quedan plegadas.
  const firstSense = (word ? senses.find(sense => sense.id === word.id) ?? word : senses[0]) ?? null;
  const otherSenses = firstSense ? senses.filter(sense => sense.id !== firstSense.id) : [];
  const [showOthers, setShowOthers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(() => new Set(senses.filter(sense => sense.in_srs).map(sense => sense.id)));
  const [error, setError] = useState<string | null>(null);
  const looked = useRef<string | null>(null);

  useEffect(() => {
    const first = firstSense;
    // La clave es la palabra, no el render: sin esto, cualquier re-render
    // volvería a contar la consulta e inflaría la métrica en silencio.
    if (!first || looked.current === String(first.id)) return;
    looked.current = String(first.id);

    void Promise.resolve(
      getData().events.recordEvent({
        kind: 'word_looked_up',
        target_kind: 'word',
        target_id: first.id,
        skill: 'reading',
        payload: { reading_slug: readingId, form: text },
      }),
    ).catch(() => {});
  }, [firstSense, readingId, text]);

  async function addCard(sense: ReadingSense) {
    if (added.has(sense.id) || adding) {
      return;
    }

    setAdding(true);
    setError(null);
    try {
      const context: WordContext | undefined = sentence
        ? { sentence: sentence.text, source_kind: 'reading', source_id: readingId }
        : undefined;
      await flashcards.current.addCard(sense.id, { context });
      setAdded(current => new Set(current).add(sense.id));
    } catch (caught) {
      if (toUserMessage(caught).toLowerCase().includes('already')) {
        setAdded(current => new Set(current).add(sense.id));
      } else {
        setError(toUserMessage(caught));
      }
    } finally {
      setAdding(false);
    }
  }

  const legacyMode = !providedSenses && Boolean(word);

  function renderSense(sense: ReadingSense) {
    const gloss = glossFor(sense, supportLanguage);
    return (
      <View key={sense.id} style={styles.sense}>
        <Text style={[styles.pinyin, { color: colors.text }]}>{sense.pinyin}</Text>
        <Text style={[styles.meaning, { color: colors.textMuted }]}>{gloss}</Text>
        <View style={styles.badges}>
          {sense.hsk_level ? <Badge label={`HSK ${sense.hsk_level}`} /> : null}
          {sense.pos ? <Badge label={sense.pos} /> : null}
          {sense.traditional ? <Badge label={`繁 ${sense.traditional}`} /> : null}
          {sense.classifier ? <Badge label={`量 ${sense.classifier}`} /> : null}
        </View>
        <Button
          label={legacyMode ? (added.has(sense.id) ? 'Added' : adding ? 'Adding...' : 'Add to Cards') : `Añadir a Cards: ${sense.pinyin}, ${gloss}`}
          onPress={() => addCard(sense)}
          disabled={added.has(sense.id) || adding}
        />
      </View>
    );
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.hanzi, { color: colors.text }]}>{text}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close word" onPress={onClose}>
          <Text style={[styles.close, { color: colors.textMuted }]}>Close</Text>
        </Pressable>
      </View>

      {firstSense ? (
        <>
          {renderSense(firstSense)}
          {otherSenses.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showOthers }}
              onPress={() => setShowOthers(current => !current)}
            >
              <Text style={[styles.others, { color: colors.textMuted }]}>Otros significados</Text>
            </Pressable>
          ) : null}
          {showOthers ? otherSenses.map(renderSense) : null}
          {sentence ? (
            <Text style={[styles.context, { color: colors.textMuted }]}>{sentence.text}</Text>
          ) : null}
          {error ? <Text style={[styles.error, { color: colors.vermilion }]}>{error}</Text> : null}
        </>
      ) : (
        <Text style={[styles.meaning, { color: colors.textMuted }]}>Unknown word</Text>
      )}
    </Card>
  );
}

function glossFor(sense: ReadingSense, language: 'es' | 'en') {
  if (language === 'es') return sense.meaning_es ?? sense.meaning_en ?? '—';
  return sense.meaning_en ?? sense.meaning_es ?? '—';
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  hanzi: {
    fontSize: tokens.fontSize.hanzi,
    fontWeight: '800',
  },
  close: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  pinyin: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  meaning: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  sense: {
    gap: tokens.spacing.xs,
  },
  others: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  context: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  error: {
    fontSize: tokens.fontSize.sm,
  },
});
