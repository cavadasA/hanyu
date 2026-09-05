import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { tokens as t } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export interface Sentence {
  zh: string;
  pinyin: string;
  es: string;
  tokens: ReadingToken[];
}

interface Props {
  sentence: Sentence;
  showPinyin: boolean;
  onSelectToken(token: ReadingToken): void;
  onPlay?(): void;
  onSentenceRead?(): void;
  active?: boolean;
  testID?: string;
}

export function ReadingSentence({
  sentence,
  showPinyin,
  onSelectToken,
  onPlay,
  onSentenceRead,
  active = false,
  testID,
}: Props) {
  const { colors } = useTheme();
  const [translated, setTranslated] = useState(false);
  const sentenceTokens = sentence.tokens ?? [];

  return (
    <View
      testID={testID}
      accessibilityState={{ selected: active }}
      style={styles.sentence}
    >
      <View style={styles.line}>
        {sentenceTokens.map((token) =>
          token.type === 'punctuation' ? (
            <Text key={token.id} style={[styles.token, { color: colors.text }]}>
              {token.text}
            </Text>
          ) : (
            <Pressable
              key={token.id}
              accessibilityRole="button"
              accessibilityLabel={token.text}
              accessibilityHint={
                token.status === 'unknown' || token.type === 'unknown'
                  ? 'Esta palabra no está en tus tarjetas.'
                  : undefined
              }
              onPress={() => onSelectToken(token)}
            >
              <Text
                style={[
                  styles.token,
                  { color: colorForToken(token, colors) },
                  token.status === 'unknown' || token.type === 'unknown' ? styles.unknown : null,
                ]}
              >
                {token.text}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Traducir la frase"
        accessibilityState={{ selected: translated }}
        onPress={() => {
          onSentenceRead?.();
          setTranslated(value => !value);
        }}
      >
        <Text style={[styles.translate, { color: colors.textMuted }]}>Traducir</Text>
      </Pressable>

      {onPlay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Leer desde aquí: ${sentence.zh}`}
          onPress={onPlay}
        >
          <Text style={[styles.play, { color: colors.vermilion }]}>Leer desde aquí</Text>
        </Pressable>
      ) : null}

      {showPinyin ? (
        <Text style={[styles.pinyin, { color: colors.textMuted }]}>{sentence.pinyin}</Text>
      ) : null}
      {translated ? (
        <Text style={[styles.translation, { color: colors.textMuted }]}>{sentence.es}</Text>
      ) : null}
    </View>
  );
}

function colorForToken(
  token: ReadingToken,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  switch (token.status) {
    case 'known':
      return colors.textMuted;
    case 'learning':
      return colors.gold;
    case 'target':
      return colors.vermilion;
    case 'unknown':
      return colors.text;
    default:
      return token.type === 'unknown' ? colors.text : colors.vermilion;
  }
}

const styles = StyleSheet.create({
  sentence: { marginBottom: t.spacing.md },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  token: { fontSize: t.fontSize.xl, lineHeight: 38, marginRight: t.spacing.xs },
  unknown: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  translate: { fontSize: t.fontSize.xs, marginTop: t.spacing.xs, fontWeight: '700' },
  play: { fontSize: t.fontSize.xs, marginTop: t.spacing.xs, fontWeight: '700' },
  pinyin: { fontSize: t.fontSize.xs, marginTop: 2 },
  translation: { fontSize: t.fontSize.md, lineHeight: 22, marginTop: t.spacing.xs },
});
