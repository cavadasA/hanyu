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
  /** Nombre accesible si no basta con `label` (p. ej. para incluir el `sublabel`). */
  accessibilityLabel?: string;
  /**
   * Para botones estrechos (las columnas de OptionRow): la etiqueta va en una línea
   * y encoge para caber, en vez de partir una palabra a la mitad («Equilibra/do»).
   */
  fitLabel?: boolean;
}

export function Button({
  label,
  sublabel,
  onPress,
  variant = 'primary',
  disabled = false,
  selected = false,
  busy = false,
  accessibilityLabel,
  fitLabel = false,
}: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';

  // Un secundario seleccionado (p. ej. la velocidad activa del lector) se marca en
  // bermellón; antes `selected` sólo llegaba a la accesibilidad.
  const accent = isPrimary || isOutline || selected;
  const backgroundColor = isPrimary ? colors.vermilion : isOutline ? 'transparent' : colors.surface;
  const borderColor = accent ? colors.vermilion : colors.border;
  const spinnerColor = isPrimary ? colors.onAccent : accent ? colors.vermilion : colors.text;
  const labelColor = isPrimary ? colors.onAccent : accent ? colors.vermilion : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, selected, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        fitLabel ? styles.fit : null,
        isOutline || (selected && !isPrimary) ? styles.outline : null,
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
          <Text
            style={[styles.label, { color: labelColor }]}
            {...(fitLabel ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 } : null)}
          >
            {label}
          </Text>
          {sublabel ? (
            <Text style={[styles.sublabel, { color: isPrimary ? colors.onAccentMuted : colors.textMuted }]}>{sublabel}</Text>
          ) : null}
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
  fit: { paddingHorizontal: tokens.spacing.sm },
  outline: { borderWidth: 1.5 },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  sublabel: { fontSize: tokens.fontSize.xs, marginTop: 2 },
});
