import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { ExerciseRendererProps } from './types';

type Prompt = Extract<ExercisePrompt, { kind: 'multiple_choice' }>;

export function MultipleChoiceExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.prompt, { color: colors.text }]}>{prompt.question}</Text>
      {prompt.options.map(option => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{
            selected: value.kind === 'multiple_choice' && value.option === option,
            disabled,
          }}
          disabled={disabled}
          onPress={() => onChange({ kind: 'multiple_choice', option })}
          style={[
            styles.option,
            {
              borderColor:
                value.kind === 'multiple_choice' && value.option === option
                  ? colors.vermilion
                  : colors.border,
              backgroundColor: colors.surface,
            },
          ]}
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
  option: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
