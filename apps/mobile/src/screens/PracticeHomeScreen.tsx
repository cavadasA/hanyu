import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { HubTile } from '../ui/HubTile';
import { Screen } from '../ui/Screen';

export function PracticeHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Practice</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Exercises and graded readings
        </Text>
      </View>

      <HubTile
        icon="create-outline"
        title="Exercises"
        description="Five focused exercise types"
        actionLabel="Exercises"
        onPress={() => router.push('/practice/exercises')}
      />

      <HubTile
        icon="reader-outline"
        title="Readings"
        description="Read and inspect words"
        actionLabel="Readings"
        onPress={() => router.push('/practice/readings')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  subtitle: { fontSize: tokens.fontSize.sm },
});
