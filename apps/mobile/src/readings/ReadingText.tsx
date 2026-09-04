import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { ReadingSentence, type Sentence } from './ReadingSentence';
import { WordSheet, type ReadingSense } from './WordSheet';

export function ReadingText({
  sentences,
  tokens: legacyTokens,
  showPinyin,
  readingId,
  activeSentenceIndex = null,
}: {
  sentences?: Sentence[];
  tokens?: ReadingToken[];
  showPinyin: boolean;
  readingId: string;
  activeSentenceIndex?: number | null;
}) {
  const [selected, setSelected] = useState<{ token: ReadingToken; sentence: Sentence } | null>(null);
  const displaySentences = sentences ?? (legacyTokens ? [{
    zh: legacyTokens.map(token => token.text).join(''),
    pinyin: '',
    es: '',
    tokens: legacyTokens,
  }] : []);

  return (
    <View style={styles.container}>
      {displaySentences.map((sentence, index) => (
        <ReadingSentence
          key={`${sentence.zh}-${index}`}
          sentence={sentence}
          showPinyin={showPinyin}
          active={activeSentenceIndex === index}
          testID={`sentence-${index}`}
          onSelectToken={token => setSelected({ token, sentence })}
        />
      ))}

      {selected ? (
        <WordSheet
          text={selected.token.text}
          senses={(selected.token.senses ?? (selected.token.word ? [selected.token.word] : [])) as ReadingSense[]}
          sentence={{ text: selected.sentence.zh, tokens: selected.sentence.tokens }}
          readingLevel={selected.token.word?.hsk_level}
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
});
