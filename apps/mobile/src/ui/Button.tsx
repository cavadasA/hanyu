import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface ButtonProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  selected?: boolean;
  busy?: boolean;
}

export function Button({
  label,
  sublabel,
  onPress,
  variant = 'primary',
  disabled = false,
  selected = false,
  busy = false,
}: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';

  const backgroundColor = isPrimary ? colors.vermilion : isOutline ? 'transparent' : colors.surface;
  const borderColor = isPrimary || isOutline ? colors.vermilion : colors.border;
  const spinnerColor = isPrimary ? colors.onAccent : isOutline ? colors.vermilion : colors.text;
  const labelColor = isPrimary ? colors.onAccent : isOutline ? colors.vermilion : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, selected, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        isOutline ? styles.outline : null,
        {
          backgroundColor,
          borderColor,
          opacity: disabled && !busy ? 0.5 : pressed ? 0.85 : 1,
          ...(pressed ? { transform: [{ scale: 0.98 }] } : {}),
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
          {sublabel ? <Text style={[styles.sublabel, { color: colors.textMuted }]}>{sublabel}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  outline: { borderWidth: 1.5 },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  sublabel: { fontSize: tokens.fontSize.xs, marginTop: 2 },
});
