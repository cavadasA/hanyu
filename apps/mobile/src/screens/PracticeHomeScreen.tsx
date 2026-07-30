import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';

export function PracticeHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Practice</Text>
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
        <Text style={{ color: colors.textMuted }}>Five focused exercise types</Text>
        <Button label="Exercises" onPress={() => router.push('/practice/exercises')} />
      </Card>
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Readings</Text>
        <Text style={{ color: colors.textMuted }}>Read and inspect words</Text>
        <Button label="Readings" onPress={() => router.push('/practice/readings')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  title: { fontSize: tokens.fontSize.lg, fontWeight: '600' },
});
