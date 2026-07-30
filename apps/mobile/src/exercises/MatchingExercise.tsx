import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { ExerciseRendererProps } from './types';

type Prompt = Extract<ExercisePrompt, { kind: 'matching' }>;

export function MatchingExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const matches =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, string>
      : {};

  const selectRight = (right: string) => {
    if (!selectedLeft) {
      return;
    }
    onChange({ ...matches, [selectedLeft]: right });
    setSelectedLeft(null);
  };

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textMuted }}>Select a Chinese word, then its meaning</Text>
      <View style={styles.columns}>
        <View style={styles.column}>
          {prompt.pairs.map(pair => (
            <Pressable
              key={pair.left}
              accessibilityRole="button"
              accessibilityLabel={`Select ${pair.left}`}
              accessibilityState={{ selected: selectedLeft === pair.left, disabled }}
              disabled={disabled}
              onPress={() => setSelectedLeft(pair.left)}
              style={[styles.item, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text }}>{pair.left}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.column}>
          {prompt.pairs.map(pair => (
            <Pressable
              key={pair.right}
              accessibilityRole="button"
              accessibilityLabel={`Match ${pair.right}`}
              accessibilityState={{ disabled: disabled || !selectedLeft }}
              disabled={disabled || !selectedLeft}
              onPress={() => selectRight(pair.right)}
              style={[styles.item, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text }}>{pair.right}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md },
  columns: { flexDirection: 'row', gap: tokens.spacing.md },
  column: { flex: 1, gap: tokens.spacing.sm },
  item: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
