import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type ReadingDetail, type ReadingResult } from '@hanyu/data';
import { getData } from '../lib/data';
import { ReadingQuestions } from '../readings/ReadingQuestions';
import { ReadingText } from '../readings/ReadingText';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AudioButton } from '../ui/AudioButton';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

export function ReadingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colors } = useTheme();
  const readingsApi = useRef(getData().readings);
  const submitting = useRef(false);
  const [reading, setReading] = useState<ReadingDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [showPinyin, setShowPinyin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    if (!id) {
      setError('Reading not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const detail = await readingsApi.current.getReading(id);
      setReading(detail);
      setAnswers({});
      setResult(null);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function submit() {
    if (!id || !reading || submitting.current || result || !allAnswered(reading, answers)) {
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const completion = await readingsApi.current.completeReading(id, answers);
      setResult(completion);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!reading) {
    return (
      <Screen>
        {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      </Screen>
    );
  }

  const canSubmit = allAnswered(reading, answers) && !isSubmitting && !result;

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Reading</Text>
        <Text style={[styles.title, { color: colors.text }]}>{reading.title}</Text>
      </View>

      <View style={styles.meta}>
        <Badge label={`HSK ${reading.hsk_level}`} />
        <Badge label={reading.format.replace('_', ' ')} />
      </View>

      <View style={styles.actions}>
        <AudioButton text={reading.content} audioUrl={reading.audio_url} label="Play reading" />
        {reading.audio_kind === 'tts' ? (
          <Text style={[styles.audioNote, { color: colors.textMuted }]}>Voz sintética</Text>
        ) : null}
        {reading.pinyin_text ? (
          <Button
            label={showPinyin ? 'Hide pinyin' : 'Show pinyin'}
            variant="secondary"
            onPress={() => setShowPinyin(value => !value)}
          />
        ) : null}
      </View>

      {showPinyin && reading.pinyin_text ? (
        <Card>
          <Text style={[styles.pinyinText, { color: colors.textMuted }]}>{reading.pinyin_text}</Text>
        </Card>
      ) : null}

      <Card>
        <ReadingText tokens={reading.tokens} showPinyin={showPinyin} readingId={reading.id} />
      </Card>

      <Card>
        <ReadingQuestions
          questions={reading.questions}
          answers={answers}
          disabled={Boolean(result)}
          result={result}
          onAnswer={(questionId, optionId) =>
            setAnswers(current => ({ ...current, [questionId]: optionId }))
          }
        />
        <Button
          label={isSubmitting ? 'Submitting...' : 'Submit answers'}
          onPress={submit}
          disabled={!canSubmit}
        />
      </Card>

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}

function allAnswered(reading: ReadingDetail, answers: Record<string, string>) {
  return reading.questions.length > 0 && reading.questions.every(question => Boolean(answers[question.id]));
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
  meta: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    alignItems: 'center',
  },
  pinyinText: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
  audioNote: {
    fontSize: tokens.fontSize.sm,
  },
});
