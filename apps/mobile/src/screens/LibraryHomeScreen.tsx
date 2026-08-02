import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { HubTile } from '../ui/HubTile';
import { Screen } from '../ui/Screen';

export function LibraryHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Library</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Words and grammar for your level
        </Text>
      </View>

      <HubTile
        icon="book-outline"
        title="Words"
        description="Search HSK words"
        actionLabel="Words"
        onPress={() => router.push('/library/words')}
      />

      <HubTile
        icon="language-outline"
        title="Grammar"
        description="Browse grammar patterns"
        actionLabel="Grammar"
        onPress={() => router.push('/library/grammar')}
      />

      <HubTile
        icon="albums-outline"
        title="Decks"
        description="Manage your study decks"
        actionLabel="Decks"
        onPress={() => router.push('/library/decks')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  subtitle: { fontSize: tokens.fontSize.sm },
});
