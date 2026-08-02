import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface AuthSubmitProps {
  /** Idle label; also the accessible name the tests press against. */
  label: string;
  /** Label shown while `busy` is true. */
  busyLabel: string;
  busy: boolean;
  onPress: () => void;
}

/** Full-width primary action for auth screens, with spinner + press feedback. */
export function AuthSubmit({ label, busyLabel, busy, onPress }: AuthSubmitProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.vermilion,
          opacity: busy ? 0.85 : 1,
          transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
        },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : null}
      <Text style={[styles.label, { color: colors.onAccent }]}>{busy ? busyLabel : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.sm,
  },
  label: { fontSize: tokens.fontSize.md, fontWeight: '700' },
});
