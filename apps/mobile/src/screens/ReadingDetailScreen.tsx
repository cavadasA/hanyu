import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type ReadingDetail, type ReadingProgress, type ReadingResult } from '@hanyu/data';
import { getData } from '../lib/data';
import { useSpeech } from '../audio/useSpeech';
import { useSentencePlayer, type ReadingRate } from '../readings/useSentencePlayer';
import { ReadingQuestions } from '../readings/ReadingQuestions';
import { GrammarNote } from '../readings/GrammarNote';
import { ReadingText } from '../readings/ReadingText';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
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
  const speech = useSpeech();
  const submitting = useRef(false);
  const [reading, setReading] = useState<ReadingDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [showPinyin, setShowPinyin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [speechRate, setSpeechRate] = useState<ReadingRate>(1);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const progressSaveIndex = useRef<number | null>(null);
  // El audio por frase: clips si la lectura los tiene, voz del dispositivo si no.
  const player = useSentencePlayer({
    sentences: reading?.sentences.map(sentence => sentence.zh) ?? [],
    clips: reading?.sentence_audio ?? [],
    recorded: reading ? reading.audio_kind !== 'tts' : false,
    rate: speechRate,
    onSentence: index => saveSentenceProgress(index),
  });
  const activeSentenceIndex = player.activeIndex;

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
      if (typeof readingsApi.current.getReadingProgress === 'function') {
        setProgress(await readingsApi.current.getReadingProgress(id));
      } else {
        setProgress(null);
      }
      setAnswers({});
      setResult(null);
      progressSaveIndex.current = null;
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    player.stop();
    speech.stop();
    progressSaveIndex.current = null;

    return () => {
      player.stop();
      speech.stop();
    };
  }, [id]);

  function saveSentenceProgress(index: number) {
    const nextIndex = Math.max(progress?.last_sentence ?? 0, progressSaveIndex.current ?? 0, index);
    const updatedAt = new Date().toISOString();
    setProgress(current => current ? {
      ...current,
      last_sentence: Math.max(current.last_sentence, nextIndex),
      started_at: current.started_at ?? updatedAt,
      updated_at: updatedAt,
    } : current);
    if (!id || typeof readingsApi.current.saveReadingProgress !== 'function') return;
    if (progressSaveIndex.current === nextIndex) return;
    progressSaveIndex.current = nextIndex;
    void Promise.resolve(readingsApi.current.saveReadingProgress(id, nextIndex)).catch(caught => {
      setError(toUserMessage(caught));
    });
  }

  function playFrom(index: number) {
    if (!reading) return;
    player.playFrom(index);
  }

  function stopSpeech() {
    player.stop();
  }

  async function changeBookmark() {
    if (!id || typeof readingsApi.current.toggleBookmark !== 'function') return;
    try {
      const next = await readingsApi.current.toggleBookmark(id);
      setProgress(next);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }

  async function markReadingRead() {
    if (!id || typeof readingsApi.current.markRead !== 'function' || progress?.finished_at) return;
    setIsMarkingRead(true);
    setError(null);
    try {
      setProgress(await readingsApi.current.markRead(id, { pinyinShown: showPinyin }));
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setIsMarkingRead(false);
    }
  }

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
      if (typeof readingsApi.current.markRead === 'function') {
        await readingsApi.current.markRead(id, { pinyinShown: showPinyin });
      }
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

      <GrammarNote points={reading.grammar_points ?? []} />

      <View style={styles.meta}>
        <Badge label={`HSK ${reading.hsk_level}`} />
        <Badge label={reading.format.replace('_', ' ')} />
      </View>

      <View style={styles.actions}>
          <Button
            label={activeSentenceIndex === null ? 'Reproducir' : 'Detener'}
            onPress={activeSentenceIndex === null ? () => playFrom(0) : stopSpeech}
          />
          {[0.75, 1, 1.25].map(rate => (
            <Button
              key={rate}
              label={`${rate}x`}
              variant="secondary"
              selected={speechRate === rate}
              onPress={() => setSpeechRate(rate as ReadingRate)}
            />
          ))}
        {reading.audio_kind === 'human' ? null : (
          <Text style={[styles.audioNote, { color: colors.textMuted }]}>
            {reading.audio_kind === 'neural' ? 'Voz neuronal' : 'Voz sintética'}
          </Text>
        )}
        {player.missingClip !== null ? (
          <Text style={[styles.audioNote, { color: colors.textMuted }]}>
            {`Falta el audio de la frase ${player.missingClip + 1}: conéctate para descargarlo.`}
          </Text>
        ) : null}
        {progress ? (
          <Button
            label={progress.bookmarked ? 'Quitar marcador' : 'Marcar marcador'}
            variant="secondary"
            onPress={() => void changeBookmark()}
          />
        ) : null}
        <Button
          label={progress?.finished_at ? 'Leída' : 'Marcar como leída'}
          variant="secondary"
          disabled={Boolean(progress?.finished_at)}
          busy={isMarkingRead}
          onPress={() => void markReadingRead()}
        />
        {progress && (progress.started_at || progress.last_sentence > 0) && !progress.finished_at ? (
          <Button label="Continuar" variant="secondary" onPress={() => playFrom(progress.last_sentence)} />
        ) : null}
        {reading.sentences.some(sentence => Boolean(sentence.pinyin)) ? (
          <Button
            label={showPinyin ? 'Hide pinyin' : 'Show pinyin'}
            variant="secondary"
            onPress={() => setShowPinyin(value => !value)}
          />
        ) : null}
      </View>

      <Card>
        <ReadingText
          sentences={reading.sentences}
          showPinyin={showPinyin}
          readingId={reading.id}
          activeSentenceIndex={activeSentenceIndex}
          onPlaySentence={playFrom}
          onSentenceRead={saveSentenceProgress}
        />
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
  audioNote: {
    fontSize: tokens.fontSize.sm,
  },
});
