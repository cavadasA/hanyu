import { Pressable, StyleSheet, Text } from 'react-native';
import { useSpeech } from '../audio/useSpeech';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function AudioButton({ text, label = 'Play audio' }: { text: string; label?: string }) {
  const { colors } = useTheme();
  const { speak } = useSpeech();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => speak(text)}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    justifyContent: 'center',
    minHeight: 44,
  },
  label: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
});
