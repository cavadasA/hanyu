import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface HubTileProps {
  icon: IconName;
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
}

export function HubTile({ icon, title, description, actionLabel, onPress }: HubTileProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={actionLabel}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
          // Always an array: RN 0.86 crashes with "Cannot read property
          // 'forEach' of null" in processTransform when `transform` is
          // undefined/null inside a Pressable style function.
          transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.vermilion + '14' }]}>
        <Ionicons name={icon} size={22} color={colors.vermilion} />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.lg,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: tokens.spacing.xs },
  title: { fontSize: tokens.fontSize.lg, fontWeight: '600' },
  description: { fontSize: tokens.fontSize.sm },
});
