import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

const ORDER = ['new', 'learning', 'review', 'mastered'] as const;

export function StatusBarChart({
  byStatus,
  total,
}: {
  byStatus: Partial<Record<string, number>>;
  total: number;
}) {
  const { colors } = useTheme();
  const palette: Record<string, string> = {
    new: colors.vermilion,
    learning: colors.gold,
    review: colors.textMuted,
    mastered: colors.text,
  };

  if (!total) {
    return <Text style={{ color: colors.textMuted }}>No cards in your deck yet</Text>;
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.bar, { backgroundColor: colors.border }]}>
        {ORDER.map((status) => {
          const count = byStatus[status] ?? 0;
          if (!count) {
            return null;
          }

          return (
            <View
              key={status}
              testID={`segment-${status}`}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: palette[status] }}
            />
          );
        })}
      </View>

      <View style={styles.legend}>
        {ORDER.map((status) => {
          const count = byStatus[status] ?? 0;
          if (!count) {
            return null;
          }

          return (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: palette[status] }]} />
              <Text style={[styles.legendItemLabel, { color: colors.textMuted }]}>
                {`${status} ${count}`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: tokens.spacing.sm },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: tokens.radius.pill },
  legendItemLabel: { fontSize: tokens.fontSize.xs },
});
