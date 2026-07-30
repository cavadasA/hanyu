import { StyleSheet, TextInput, View } from 'react-native';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AudioButton } from '../ui/AudioButton';
import type { ExerciseRendererProps } from './types';

type Prompt = Extract<ExercisePrompt, { kind: 'dictation' }>;

export function DictationExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <AudioButton text={prompt.audio_text} label="Play dictation" />
      <TextInput
        placeholder="Type what you hear"
        placeholderTextColor={colors.textMuted}
        value={typeof value === 'string' ? value : ''}
        editable={!disabled}
        onChangeText={onChange}
        autoCapitalize="none"
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});
