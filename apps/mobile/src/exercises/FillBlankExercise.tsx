import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExerciseRendererProps } from './types';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

type Prompt = Extract<ExercisePrompt, { kind: 'fill_blank' }>;

export function FillBlankExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.prompt, { color: colors.text }]}>{prompt.sentence}</Text>
      <TextInput
        placeholder="Type your answer"
        placeholderTextColor={colors.textMuted}
        value={typeof value === 'string' ? value : ''}
        editable={!disabled}
        onChangeText={onChange}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      {prompt.options?.map(option => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option, disabled }}
          disabled={disabled}
          onPress={() => onChange(option)}
          style={[styles.option, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text }}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm },
  prompt: { fontSize: tokens.fontSize.lg },
  input: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  option: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
