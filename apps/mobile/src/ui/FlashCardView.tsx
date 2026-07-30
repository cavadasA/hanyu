import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DueCard } from '@hanyu/data';
import { useSpeech } from '../audio/useSpeech';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AudioButton } from './AudioButton';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';

export type ReviewMode = 'recognition' | 'recall' | 'listening';

interface FlashCardViewProps {
  card: DueCard;
  mode: ReviewMode;
  revealed: boolean;
  onReveal: () => void;
  onRate: (quality: number) => void | Promise<void>;
  ratingDisabled?: boolean;
}

const RATINGS = [
  { label: 'Again', quality: 1 },
  { label: 'Hard', quality: 3 },
  { label: 'Good', quality: 4 },
  { label: 'Easy', quality: 5 },
];

export function FlashCardView({
  card,
  mode,
  revealed,
  onReveal,
  onRate,
  ratingDisabled = false,
}: FlashCardViewProps) {
  const { colors } = useTheme();
  const { speak, stop } = useSpeech();

  useEffect(() => {
    if (mode === 'listening' && !revealed && card.hanzi) {
      speak(card.hanzi);
      return stop;
    }

    return undefined;
  }, [card.id, card.hanzi, mode, revealed, speak, stop]);

  return (
    <Card>
      <Badge label={`HSK ${card.hsk_level ?? '-'}`} />

      <View style={styles.face}>
        {mode === 'recognition' && !revealed ? (
          <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
        ) : null}

        {mode === 'recall' && !revealed ? (
          <Text style={[styles.prompt, { color: colors.text }]}>{card.meaning_en}</Text>
        ) : null}

        {mode === 'listening' && !revealed ? (
          <>
            <Text style={[styles.prompt, { color: colors.textMuted }]}>
              Listen and identify the word
            </Text>
            <AudioButton text={card.hanzi ?? ''} label="Play again" />
          </>
        ) : null}

        {revealed ? (
          <>
            <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
            <Text style={[styles.pinyin, { color: colors.gold }]}>{card.pinyin}</Text>
            <Text style={[styles.meaning, { color: colors.text }]}>{card.meaning_en}</Text>
            <AudioButton text={card.hanzi ?? ''} />
          </>
        ) : null}
      </View>

      {revealed ? (
        <View style={styles.ratings}>
          {RATINGS.map((rating) => (
            <View key={rating.label} style={styles.rating}>
              <Button
                label={rating.label}
                variant={rating.quality >= 4 ? 'primary' : 'secondary'}
                onPress={() => onRate(rating.quality)}
                disabled={ratingDisabled}
              />
            </View>
          ))}
        </View>
      ) : (
        <Button label="Show answer" onPress={onReveal} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xl },
  hanzi: { fontSize: tokens.fontSize.hanzi, fontWeight: '700' },
  pinyin: { fontSize: tokens.fontSize.lg },
  meaning: { fontSize: tokens.fontSize.md },
  prompt: { fontSize: tokens.fontSize.lg, textAlign: 'center' },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  rating: { flexGrow: 1, flexBasis: '45%' },
});
