import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';

export function LibraryHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Library</Text>
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Words</Text>
        <Text style={{ color: colors.textMuted }}>Search HSK words</Text>
        <Button label="Words" onPress={() => router.push('/library/words')} />
      </Card>
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Grammar</Text>
        <Text style={{ color: colors.textMuted }}>Browse grammar patterns</Text>
        <Button label="Grammar" onPress={() => router.push('/library/grammar')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  title: { fontSize: tokens.fontSize.lg, fontWeight: '600' },
});
