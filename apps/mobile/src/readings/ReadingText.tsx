import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ReadingToken } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { ReadingSentence, type Sentence } from './ReadingSentence';
import { WordSheet, type ReadingSense } from './WordSheet';

export function ReadingText({
  sentences,
  showPinyin,
  readingId,
  activeSentenceIndex = null,
  onPlaySentence,
  onSentenceRead,
}: {
  sentences?: Sentence[];
  showPinyin: boolean;
  readingId: string;
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

      {/* La ficha va en una hoja sobre el texto: en línea aparecía al final de
          la lectura y quien tocaba una palabra de arriba no veía nada. */}
      {selected ? (
        <Modal
          visible
          transparent
          animationType="slide"
          testID="word-sheet-modal"
          onRequestClose={() => setSelected(null)}
        >
          <View style={styles.overlay}>
            <Pressable
              style={styles.backdrop}
              accessibilityRole="button"
              accessibilityLabel="Cerrar la ficha de la palabra"
              onPress={() => setSelected(null)}
            />
            <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
              <WordSheet
                key={selected.token.id}
                text={selected.token.text}
                word={selected.token.word}
                senses={(selected.token.senses ?? (selected.token.word ? [selected.token.word] : [])) as ReadingSense[]}
                sentence={{ text: selected.sentence.zh, tokens: selected.sentence.tokens }}
                readingId={readingId}
                onClose={() => setSelected(null)}
              />
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing.md,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    maxHeight: '70%',
  },
  sheetContent: {
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
});
