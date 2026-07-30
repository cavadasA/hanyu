import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { ExerciseRendererProps } from './types';

type Prompt = Extract<ExercisePrompt, { kind: 'reorder' }>;

export function ReorderExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();
  const ordered = Array.isArray(value) ? value.map(String) : [];
  const available = prompt.tokens.filter(token => !ordered.includes(token));

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textMuted }}>Build the sentence</Text>
      <View style={styles.row}>
        {ordered.map((token, index) => (
          <Pressable
            key={`${token}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${token}`}
            disabled={disabled}
            onPress={() => onChange(ordered.filter((_, itemIndex) => itemIndex !== index))}
            style={[styles.token, { borderColor: colors.vermilion }]}
          >
            <Text style={{ color: colors.text }}>{token}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {available.map(token => (
          <Pressable
            key={token}
            accessibilityRole="button"
            accessibilityLabel={`Add ${token}`}
            disabled={disabled}
            onPress={() => onChange([...ordered, token])}
            style={[styles.token, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text }}>{token}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear order"
        disabled={disabled || ordered.length === 0}
        onPress={() => onChange([])}
      >
        <Text style={{ color: colors.vermilion }}>Clear order</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  token: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
