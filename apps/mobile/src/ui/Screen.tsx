import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const style = [
    styles.base,
    { backgroundColor: colors.bg, paddingTop: insets.top + tokens.spacing.lg },
  ];

  if (!scroll) {
    return <View style={style}>{children}</View>;
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={style}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  base: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
    gap: tokens.spacing.md,
  },
});
