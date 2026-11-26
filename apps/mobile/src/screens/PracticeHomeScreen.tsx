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
        <Text style={[styles.heading, { color: colors.text }]}>Práctica</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Ejercicios y lecturas graduadas
        </Text>
      </View>

      <HubTile
        icon="create-outline"
        title="Ejercicios"
        description="Cinco tipos de ejercicio"
        actionLabel="Ejercicios"
        onPress={() => router.push('/practice/exercises')}
      />

      <HubTile
        icon="reader-outline"
        title="Lecturas"
        description="Lee y consulta las palabras"
        actionLabel="Lecturas"
        onPress={() => router.push('/practice/readings')}
      />

      <HubTile
        icon="alert-circle-outline"
        title="Cuaderno de errores"
        description="Practica las palabras que todavía fallas"
        actionLabel="Cuaderno de errores"
        onPress={() => router.push('/practice/mistakes')}
      />

      <HubTile
        icon="mic-outline"
        title="Expresión"
        description="Escribir caracteres, pronunciar y responder en situaciones"
        actionLabel="Expresión"
        onPress={() => router.push('/practice/expression')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  subtitle: { fontSize: tokens.fontSize.sm },
});
