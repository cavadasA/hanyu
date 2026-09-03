import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { sentenceOf } from '../lib/sentenceOf';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { WordSheet } from './WordSheet';

export function ReadingText({
  tokens,
  showPinyin,
  readingId,
}: {
  tokens: ReadingToken[];
  showPinyin: boolean;
  readingId: string;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<ReadingToken | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.tokens}>
        {tokens.map(token => {
          if (token.type === 'punctuation') {
            return (
              <Text key={token.id} style={[styles.token, { color: colors.text }]}>
                {token.text}
              </Text>
            );
          }

          return (
            <Pressable
              key={token.id}
              accessibilityRole="button"
              accessibilityLabel={token.text}
              accessibilityState={{ selected: selected?.id === token.id }}
              onPress={() => setSelected(token)}
            >
              <View style={styles.tokenBlock}>
                <Text style={[styles.token, { color: colors.vermilion }]}>{token.text}</Text>
                {showPinyin && token.word ? (
                  <Text style={[styles.pinyin, { color: colors.textMuted }]}>{token.word.pinyin}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <WordSheet
          text={selected.text}
          word={selected.word}
          sentence={sentenceOf(tokens, selected.id)}
          readingId={readingId}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing.md,
  },
  tokens: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  tokenBlock: {
    alignItems: 'center',
    marginRight: tokens.spacing.xs,
    marginBottom: tokens.spacing.xs,
  },
  token: {
    fontSize: tokens.fontSize.xl,
    lineHeight: 38,
  },
  pinyin: {
    fontSize: tokens.fontSize.xs,
  },
});
