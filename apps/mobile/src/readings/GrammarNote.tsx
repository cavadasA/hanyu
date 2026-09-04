import { StyleSheet, Text, View } from 'react-native';
import type { GrammarPoint } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../ui/Card';

export function GrammarNote({ points }: { points: Pick<GrammarPoint, 'code' | 'title' | 'category'>[] }) {
  const { colors } = useTheme();

  if (points.length === 0) {
    return null;
  }

  return (
    <Card>
      <Text style={[styles.heading, { color: colors.text }]}>Grammar focus</Text>
      {points.map(point => (
        <View key={point.code} style={styles.point}>
          <Text style={[styles.title, { color: colors.text }]}>{point.title}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {point.code}{point.category ? ` · ${point.category}` : ''}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.md, fontWeight: '800' },
  point: { gap: tokens.spacing.xs },
  title: { fontSize: tokens.fontSize.md, fontWeight: '700' },
  meta: { fontSize: tokens.fontSize.xs },
});
