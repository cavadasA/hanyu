import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { toUserMessage, type Mistake } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function MistakesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setMistakes(await getData().exercises.getMistakes());
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function practise() {
    router.push({
      pathname: '/practice/exercises',
      params: { mistakes: mistakes.map((mistake) => String(mistake.target_id)).join(',') },
    });
  }

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Repaso</Text>
        <Text style={[styles.title, { color: colors.text }]}>Cuaderno de errores</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Vuelve a lo que todavía no está asentado.</Text>
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {loading ? <ActivityIndicator /> : null}

      {!loading && mistakes.length === 0 ? (
        <Card>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No hay errores pendientes</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Dos aciertos en días distintos sacan una palabra de esta cola.</Text>
        </Card>
      ) : null}

      {!loading && mistakes.length > 0 ? (
        <>
          {mistakes.map((mistake) => (
            <Card key={mistake.target_id}>
              <Text style={[styles.word, { color: colors.text }]}>
                {mistake.word?.hanzi ?? 'Palabra sin ficha'}
              </Text>
              {mistake.word?.pinyin ? (
                <Text style={[styles.pinyin, { color: colors.textMuted }]}>{mistake.word.pinyin}</Text>
              ) : null}
              {mistake.word?.meaning_es ? (
                <Text style={[styles.meaning, { color: colors.textMuted }]}>{mistake.word.meaning_es}</Text>
              ) : null}
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`${mistake.misses} fallos · ${mistake.hits_since} acierto${mistake.hits_since === 1 ? '' : 's'} desde entonces`}
              </Text>
            </Card>
          ))}
          <Button label="Practicar" onPress={practise} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    marginTop: tokens.spacing.xs,
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
    marginTop: tokens.spacing.sm,
  },
  word: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
  meta: {
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing.xs,
  },
  pinyin: {
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing.xs,
  },
  meaning: {
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing.xs,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
    marginTop: tokens.spacing.xs,
  },
});
