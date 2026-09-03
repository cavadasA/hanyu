import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Badge({ label, accessibilityLabel }: { label: string; accessibilityLabel?: string }) {
  const { colors } = useTheme();

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  label: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
});
