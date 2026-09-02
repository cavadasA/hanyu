import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveGloss, toUserMessage, type Word } from '@hanyu/data';
import { getData } from '../lib/data';
import { useSupportLanguage } from '../lib/useSupportLanguage';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface Props {
  word: Word | null;
  text: string;
  onClose(): void;
}

export function WordSheet({ word, text, onClose }: Props) {
  const { colors } = useTheme();
  const supportLanguage = useSupportLanguage();
  const flashcards = useRef(getData().flashcards);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(Boolean(word?.in_srs));
  const [error, setError] = useState<string | null>(null);

  async function addCard() {
    if (!word || added || adding) {
      return;
    }

    setAdding(true);
    setError(null);
    try {
      await flashcards.current.addCard(word.id);
      setAdded(true);
    } catch (caught) {
      if (toUserMessage(caught).toLowerCase().includes('already')) {
        setAdded(true);
      } else {
        setError(toUserMessage(caught));
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.hanzi, { color: colors.text }]}>{text}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close word" onPress={onClose}>
          <Text style={[styles.close, { color: colors.textMuted }]}>Close</Text>
        </Pressable>
      </View>

      {word ? (
        <>
          <Text style={[styles.pinyin, { color: colors.text }]}>{word.pinyin}</Text>
          <Text style={[styles.meaning, { color: colors.textMuted }]}>
            {resolveGloss(word, supportLanguage)}
          </Text>
          <View style={styles.badges}>
            <Badge label={`HSK ${word.hsk_level}`} />
            {word.pos ? <Badge label={word.pos} /> : null}
            {word.traditional ? <Badge label={`繁 ${word.traditional}`} /> : null}
            {word.classifier ? <Badge label={`量 ${word.classifier}`} /> : null}
          </View>
          <Button
            label={added ? 'Added' : adding ? 'Adding...' : 'Add to Cards'}
            onPress={addCard}
            disabled={added || adding}
          />
          {error ? <Text style={[styles.error, { color: colors.vermilion }]}>{error}</Text> : null}
        </>
      ) : (
        <Text style={[styles.meaning, { color: colors.textMuted }]}>Unknown word</Text>
      )}
    </Card>
  );
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  error: {
    fontSize: tokens.fontSize.sm,
  },
});
