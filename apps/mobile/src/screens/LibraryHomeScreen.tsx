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
        <Text style={[styles.heading, { color: colors.text }]}>Biblioteca</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Palabras y gramática de tu nivel
        </Text>
      </View>

      <HubTile
        icon="book-outline"
        title="Palabras"
        description="Busca palabras del HSK"
        actionLabel="Palabras"
        onPress={() => router.push('/library/words')}
      />

      <HubTile
        icon="language-outline"
        title="Gramática"
        description="Explora las estructuras gramaticales"
        actionLabel="Gramática"
        onPress={() => router.push('/library/grammar')}
      />

      <HubTile
        icon="albums-outline"
        title="Mazos"
        description="Gestiona tus mazos de estudio"
        actionLabel="Mazos"
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
