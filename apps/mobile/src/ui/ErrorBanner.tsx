import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.banner, { borderColor: colors.vermilion, backgroundColor: colors.surface }]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.message, { color: colors.text }]}
      >
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retryButton}
        >
          <Text style={[styles.retry, { color: colors.vermilion }]}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  message: { fontSize: tokens.fontSize.sm },
  retryButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  retry: { fontSize: tokens.fontSize.sm, fontWeight: '700' },
});
