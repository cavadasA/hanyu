import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  refreshControl,
  testID = 'screen-scroll',
}: {
  children: ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  testID?: string;
}) {
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
    <ScrollView
      testID={testID}
      scrollEnabled={scrollEnabled}
      refreshControl={refreshControl}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={style}
    >
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
