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
      <AudioButton text={prompt.audio_text} label="Reproducir el dictado" />
      <TextInput
        placeholder="Escribe lo que oyes"
        placeholderTextColor={colors.textMuted}
        value={value.kind === 'dictation' ? value.text : ''}
        editable={!disabled}
        onChangeText={(text) => onChange({ kind: 'dictation', text })}
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
