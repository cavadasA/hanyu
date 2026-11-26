import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface AuthFieldProps extends TextInputProps {
  /** Visible label above the input; also drives the accessibility label. */
  label: string;
  /** Optional element rendered on the right of the label row (e.g. a "¿La olvidaste?" link). */
  trailing?: ReactNode;
  /** When true, masks input and shows a Show/Hide toggle. */
  secure?: boolean;
}

/**
 * Labeled text field with a visible label (never placeholder-as-label), a
 * vermilion focus ring, and an optional password reveal toggle. Any extra
 * TextInput props pass straight through.
 */
export function AuthField({ label, trailing, secure = false, style, ...rest }: AuthFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {trailing}
      </View>
      <View
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: focused ? colors.vermilion : colors.border },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !reveal}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.control, { color: colors.text }, style]}
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={8}
            onPress={() => setReveal((prev) => !prev)}
          >
            <Text style={[styles.toggle, { color: colors.textMuted }]}>{reveal ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: tokens.spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: 1.5,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    minHeight: 50,
  },
  control: { flex: 1, fontSize: tokens.fontSize.md, paddingVertical: tokens.spacing.md },
  toggle: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
});
