import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { toUserMessage, type Word } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const TARGET_LEVELS = [1, 2];
const SAMPLE_SIZE = 12;

type DiagnosticAnswer = { word_id: number; known: boolean };

export default function DiagnosticScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [words, setWords] = useState<Word[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // El plan se crea antes de preguntar nada: si el usuario se salta el
      // diagnóstico, la app ya tiene con qué trabajar.
      await getData().flashcards.createStudyPlan(TARGET_LEVELS);
      const page = await getData().words.getWords({ level: 2, page_size: SAMPLE_SIZE });
      setWords(page.items ?? []);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function finish(results: DiagnosticAnswer[]) {
    try {
      await getData().flashcards.submitDiagnostic(results);
      router.replace('/cards');
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }

  function answer(known: boolean) {
    const current = words?.[index];
    if (!current) return;

    const next = [...answers, { word_id: current.id, known }];
    setAnswers(next);

    if (index + 1 >= (words?.length ?? 0)) {
      void finish(next);
      return;
    }

    setIndex(index + 1);
  }

  if (error) {
    return (
      <Screen>
        <ErrorBanner message={error} onRetry={load} />
      </Screen>
    );
  }

  if (!words) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const current = words[index];

  return (
    <Screen>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        {`¿Reconoces esta palabra? ${index + 1} de ${words.length}`}
      </Text>

      <Card>
        <Text style={[styles.hanzi, { color: colors.text }]}>{current?.hanzi}</Text>
      </Card>

      <View style={styles.actions}>
        <Button label="No la sé" variant="outline" onPress={() => answer(false)} />
        <Button label="Ya la sé" onPress={() => answer(true)} />
      </View>

      {/* Obligar a un cuestionario antes del primer valor es una de las
          anti-referencias de PRODUCT.md. */}
      <Button label="Saltar" variant="outline" onPress={() => void finish([])} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
  hanzi: { fontSize: tokens.fontSize.hanzi, fontWeight: '800', textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.md },
});
