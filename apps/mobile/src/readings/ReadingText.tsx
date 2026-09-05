import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { ReadingSentence, type Sentence } from './ReadingSentence';
import { WordSheet, type ReadingSense } from './WordSheet';

export function ReadingText({
  sentences,
  showPinyin,
  readingId,
  readingLevel,
  activeSentenceIndex = null,
  onPlaySentence,
  onSentenceRead,
}: {
  sentences?: Sentence[];
  showPinyin: boolean;
  readingId: string;
  readingLevel?: number;
  activeSentenceIndex?: number | null;
  onPlaySentence?: (index: number) => void;
  onSentenceRead?: (index: number) => void;
}) {
  const [selected, setSelected] = useState<{ token: ReadingToken; sentence: Sentence } | null>(null);
  const displaySentences = sentences ?? [];

  return (
    <View style={styles.container}>
      {displaySentences.map((sentence, index) => (
        <ReadingSentence
          key={`${sentence.zh}-${index}`}
          sentence={sentence}
          showPinyin={showPinyin}
          active={activeSentenceIndex === index}
          onPlay={onPlaySentence ? () => onPlaySentence(index) : undefined}
          onSentenceRead={onSentenceRead ? () => onSentenceRead(index) : undefined}
          testID={`sentence-${index}`}
          onSelectToken={token => setSelected({ token, sentence })}
        />
      ))}

      {selected ? (
        <WordSheet
          key={selected.token.id}
          text={selected.token.text}
          senses={(selected.token.senses ?? (selected.token.word ? [selected.token.word] : [])) as ReadingSense[]}
          sentence={{ text: selected.sentence.zh, tokens: selected.sentence.tokens }}
          readingLevel={readingLevel}
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
