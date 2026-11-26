import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type GrammarPoint, type GrammarReading, type HskLevel } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function GrammarDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; level?: string | string[] }>();
  const id = parseNumber(Array.isArray(params.id) ? params.id[0] : params.id);
  const level = parseLevel(Array.isArray(params.level) ? params.level[0] : params.level);
  const grammarApi = useRef(getData().grammar);
  const router = useRouter();
  const { colors } = useTheme();
  const [point, setPoint] = useState<GrammarPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [studied, setStudied] = useState(false);
  const [readings, setReadings] = useState<GrammarReading[]>([]);

  async function load() {
    if (!id || !level) {
      setError('Punto de gramática no válido');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loadedPoint = await grammarApi.current.getGrammarPoint(level, id);
      setPoint(loadedPoint);
      setReadings(await grammarApi.current.getGrammarReadings(loadedPoint.hsk_level, loadedPoint.code));
      try {
        setStudied(await grammarApi.current.getGrammarStudyState(id));
      } catch {
        // El contenido sigue siendo útil aunque el estado aún no esté disponible.
        setStudied(false);
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function markStudied() {
    if (!point || saving || studied) return;
    setSaving(true);
    setError(null);
    try {
      await getData().grammar.markGrammarStudied(point.id);
      setStudied(true);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id, level]);

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const examples = point?.examples ?? [];
  const commonErrors = point?.common_errors ?? [];
  const seeAlso = point?.see_also ?? [];

  return (
    <Screen>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {point ? (
        <>
          <View>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Gramática</Text>
            <Text style={[styles.title, { color: colors.text }]}>{point.title}</Text>
          </View>
          <Badge label={`HSK ${point.hsk_level}`} />
          <Button
            label={saving ? 'Guardando…' : studied ? 'Estudiado' : 'Marcar como estudiado'}
            variant="outline"
            onPress={() => void markStudied()}
            disabled={saving || studied}
          />

          {point.pattern ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Estructura</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>{point.pattern}</Text>
            </Card>
          ) : null}

          {point.explanation ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Explicación</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>{point.explanation}</Text>
            </Card>
          ) : null}

          {examples.length > 0 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ejemplos</Text>
              {examples.map((example, index) => (
                <View key={`${point.id}-${index}`} style={styles.example}>
                  {example.zh ? (
                    <Text style={[styles.chinese, { color: colors.text }]}>{example.zh}</Text>
                  ) : null}
                  {example.pinyin ? (
                    <Text style={[styles.body, { color: colors.textMuted }]}>{example.pinyin}</Text>
                  ) : null}
                  {example.es ? (
                    <Text style={[styles.body, { color: colors.textMuted }]}>{example.es}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          ) : null}

          {commonErrors.length > 0 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Errores típicos</Text>
              {commonErrors.map((item, index) => (
                <View key={`${point.id}-err-${index}`} style={styles.example}>
                  <Text style={[styles.chinese, styles.wrong, { color: colors.textMuted }]}>{item.wrong}</Text>
                  <Text style={[styles.chinese, { color: colors.text }]}>{item.right}</Text>
                  <Text style={[styles.body, { color: colors.textMuted }]}>{item.why}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {seeAlso.length > 0 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ver también</Text>
              {seeAlso.map((ref) => (
                <Text key={`${ref.hsk_level}-${ref.code}`} style={[styles.body, { color: colors.textMuted }]}>
                  {`${ref.code} · HSK ${ref.hsk_level}`}
                </Text>
              ))}
            </Card>
          ) : null}

          {readings.length > 0 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>En lecturas</Text>
              {readings.map((reading) => (
                <Pressable
                  key={reading.slug}
                  accessibilityRole="button"
                  accessibilityLabel={reading.title}
                  onPress={() => router.push(`/practice/readings/${reading.slug}`)}
                  style={styles.example}
                >
                  <Text style={[styles.body, { color: colors.text }]}>{reading.title}</Text>
                  {reading.sentence ? (
                    <Text style={[styles.chinese, { color: colors.textMuted }]}>{reading.sentence}</Text>
                  ) : null}
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function parseNumber(value: string | undefined) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseLevel(value: string | undefined): HskLevel | null {
  const parsed = parseNumber(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
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
  sectionTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  body: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  example: {
    gap: tokens.spacing.xs,
  },
  wrong: {
    textDecorationLine: 'line-through',
  },
  chinese: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
});
