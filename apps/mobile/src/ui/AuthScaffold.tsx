import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

// Deep vermilion header block, held constant across light/dark so the seal zone
// stays a recognizable brand surface. Interactive accents still follow the tokens.
const BRAND_INK = '#c93624';

/**
 * Shared chrome for every auth screen (sign in / sign up / reset password):
 * the vermilion "seal" hero with the 汉语 watermark and wordmark, plus a card
 * that rises over the color to carry the form. Screens supply only a title and
 * their form controls as children.
 */
export function AuthScaffold({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { paddingTop: insets.top + tokens.spacing.xl }]}>
            <View style={styles.seal}>
              <View style={styles.sealInner} />
            </View>
            <Text style={styles.han} importantForAccessibility="no" accessibilityElementsHidden>
              汉语
            </Text>
            <Text style={styles.wordmark}>Hanyu</Text>
            <Text style={styles.tag}>LEARN MANDARIN</Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.bg, paddingBottom: insets.bottom + tokens.spacing.xl },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: BRAND_INK,
    minHeight: 260,
    paddingHorizontal: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xxl + tokens.spacing.lg,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  seal: {
    position: 'absolute',
    right: tokens.spacing.xl,
    top: 96,
    width: 130,
    height: 130,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-6deg' }],
  },
  sealInner: {
    position: 'absolute',
    top: 9,
    left: 9,
    right: 9,
    bottom: 9,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  han: {
    position: 'absolute',
    right: 12,
    top: 44,
    fontSize: 104,
    lineHeight: 112,
    letterSpacing: -4,
    color: 'rgba(255,255,255,0.14)',
  },
  wordmark: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tag: {
    marginTop: tokens.spacing.xs,
    color: 'rgba(255,255,255,0.72)',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1.6,
  },
  card: {
    flex: 1,
    marginTop: -tokens.spacing.xxl,
    borderTopLeftRadius: tokens.radius.xl + tokens.radius.sm,
    borderTopRightRadius: tokens.radius.xl + tokens.radius.sm,
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: tokens.spacing.xs,
  },
});
