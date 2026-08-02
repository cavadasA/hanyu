import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Positive / informational banner (e.g. "Check your email"). Uses the gold
 * secondary accent to read clearly apart from the red ErrorBanner.
 */
export function NoticeBanner({ message }: { message: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.message, { color: colors.text }]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  message: { fontSize: tokens.fontSize.sm, lineHeight: 20 },
});
