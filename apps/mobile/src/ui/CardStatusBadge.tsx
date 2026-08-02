import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface CardStatusBadgeProps {
  status: 'new' | 'learning' | 'review' | 'mastered' | string;
}

export function CardStatusBadge({ status }: CardStatusBadgeProps) {
  const { colors } = useTheme();

  let color = colors.info ?? '#3b82f6';
  let label = 'New';

  if (status === 'learning') {
    color = colors.vermilion;
    label = 'Learning';
  } else if (status === 'review') {
    color = colors.gold;
    label = 'Review';
  } else if (status === 'mastered') {
    color = '#10b981';
    label = 'Mastered';
  }

  return (
    <View style={[styles.badge, { backgroundColor: color + '1F', borderColor: color + '40' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: 3,
    paddingHorizontal: tokens.spacing.sm,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: tokens.radius.pill,
  },
  label: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
  },
});
