// Sesión de expresión (Plan 13, Tarea 6): escritura de caracteres en quiz, pronunciación
// de palabras y, como mucho, una tarea comunicativa al final. Qué entra lo decide
// planExpressionSession; aquí se carga lo vencido, se corrige y se registra.
//
// - Escritura: apply_skill_review del carácter, con la nota de writingGrade. Después del
//   quiz se puede practicar con el contorno (guided), que no registra nada.
// - Pronunciación: apply_review de la habilidad pronunciation de la palabra. Si el
//   dispositivo no puede corregirla, no se ofrece; si el permiso se deniega a mitad, sale
//   de la sesión sin nota.
// - Tarea comunicativa: solo una corregida deja un evento; «sin corregir» no cuenta.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import {
  applyReview,
  planExpressionSession,
  schedulingParams,
  writingGrade,
  type CommunicativeContext,
  type CommunicativeTask as Task,
  type ExpressionItem,
  type Grade,
} from '@hanyu/domain';
import { toUserMessage, type VersionedCard, type WritingItem } from '@hanyu/data';
import { getData } from '../lib/data';
import { CharacterWriting, type WritingResult } from '../expression/CharacterWriting';
import { CommunicativeTask, type CommunicativeResult } from '../expression/CommunicativeTask';
import { PronunciationExercise } from '../expression/PronunciationExercise';
import { useSpeechCheck } from '../expression/useSpeechCheck';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

type Item = ExpressionItem<WritingItem, VersionedCard, Task>;

const GRADE_NUMBER: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };
const WRITING_LIMIT = 8;
const WRITING_NEW = 3;
const PRONUNCIATION_LIMIT = 5;

/**
 * El corrector de tareas comunicativas respondió «no configurado» (falta la clave en
 * Supabase). Mientras la app siga abierta no se vuelven a ofrecer: no se pueden corregir.
 */
let communicativeNotConfigured = false;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** «学生» con 学 → «□生»: se pide el carácter sin enseñarlo. */
function blanked(word: string, hanzi: string): string {
  return word.split(hanzi).join('□');
}

export function ExpressionSessionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const speech = useSpeechCheck();
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);
  const [context, setContext] = useState<CommunicativeContext | null>(null);
  const [retention, setRetention] = useState(0.9);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [writing, setWriting] = useState<{ result: WritingResult; grade: Grade; guided: boolean } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const data = getData();
      const settings = await data.settings.getSettings();
      const [writingQueue, pronunciationQueue, tasks] = await Promise.all([
        data.expression.getWritingQueue({ limit: WRITING_LIMIT, newLimit: WRITING_NEW }),
        speech.available
          ? data.flashcards.buildQueue({ skill: 'pronunciation', mode: 'learn', limit: PRONUNCIATION_LIMIT })
          : Promise.resolve({ cards: [] as VersionedCard[], deck_size: null }),
        data.expression.getCommunicativeTasks(settings.current_level),
      ]);
      const plan = planExpressionSession<WritingItem, VersionedCard, Task>({
        mode: 'learn',
        pronunciationAvailable: speech.available,
        communicativeAvailable: !communicativeNotConfigured,
        writing: writingQueue,
        pronunciation: pronunciationQueue.cards,
        communicative: shuffle(tasks),
      });
      const communicative = plan.find((item) => item.kind === 'communicative');
      if (communicative?.kind === 'communicative') {
        setContext(await data.expression.getCommunicativeContext(communicative.task.hsk_level));
      }
      setRetention(Number(settings.request_retention) || 0.9);
      setIndex(0);
      setItems(plan);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
    // speech.available solo cambia cuando termina la comprobación del reconocedor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.available]);

  useEffect(() => {
    if (speech.status === 'checking') return;
    void load();
  }, [speech.status, load]);

  const next = () => {
    setWriting(null);
    setSaveError(null);
    setIndex((current) => current + 1);
  };

  const save = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (caught) {
      setSaveError(`No se pudo guardar: ${toUserMessage(caught)}`);
    }
  };

  const current = items?.[index] ?? null;

  const onQuiz = (item: WritingItem) => (result: WritingResult) => {
    const grade = writingGrade(result);
    setWriting({ result, grade, guided: false });
    void save(() =>
      getData().expression.reviewWriting({ item, grade, mistakes: result.mistakes, hints: result.hints, review_id: randomUUID() }),
    );
  };

  const onPronounced = (card: VersionedCard) => async ({ grade }: { grade: Grade }) => {
    const now = new Date();
    const outcome = applyReview(card.scheduling, grade, now, schedulingParams({ request_retention: retention }));
    await save(() =>
      getData().flashcards.reviewCardEvent({
        card_id: card.id,
        grade: GRADE_NUMBER[grade],
        skill: 'pronunciation',
        time_ms: null,
        review_id: randomUUID(),
        reviewed_at: now.toISOString(),
        expected_version: card.version,
        state: outcome.state,
        prior: card.scheduling,
      }),
    );
    next();
  };

  const onPronunciationUnavailable = () => {
    // No es un fallo del alumno: la pronunciación sale de lo que queda, sin nota.
    setItems((all) => all && all.filter((item, position) => position < index || item.kind !== 'pronunciation'));
  };

  const onCommunicative = (task: Task) => async (result: CommunicativeResult) => {
    if (result.status === 'unavailable' && result.reason === 'not_configured') communicativeNotConfigured = true;
    if (result.status === 'graded') {
      await save(() =>
        getData().events.recordEvent({
          kind: 'exercise_attempted',
          skill: 'production',
          client_event_id: randomUUID(),
          payload: { communicative_task: task.slug, passed: result.passed },
        }),
      );
    }
    next();
  };

  const unavailableNote = speech.status === 'unsupported'
    ? 'Este dispositivo no tiene reconocimiento de voz en chino, así que no hay ejercicios de pronunciación.'
    : speech.status === 'denied'
      ? 'Sin permiso de micrófono y reconocimiento de voz no hay ejercicios de pronunciación. Puedes activarlo en Ajustes.'
      : null;

  // La pantalla no tiene cabecera: sin esto, la única salida era el gesto desde el borde.
  const header = (
    <View style={styles.header}>
      <Text style={[styles.heading, { color: colors.text }]}>Expresión</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Salir"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/practice'))}
      >
        <Text style={[styles.exit, { color: colors.vermilion }]}>Salir</Text>
      </Pressable>
    </View>
  );

  if (error) {
    return (
      <Screen>
        {header}
        <ErrorBanner message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!items) {
    return (
      <Screen>
        {header}
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen scrollEnabled={current?.kind !== 'writing'}>
      {header}
      {unavailableNote ? <Text style={[styles.note, { color: colors.textMuted }]}>{unavailableNote}</Text> : null}
      {saveError ? <ErrorBanner message={saveError} /> : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nada de expresión para hoy"
          body="La escritura y la pronunciación de una palabra se abren cuando su reconocimiento se asienta en las tarjetas. Vuelve después de repasar."
        />
      ) : !current ? (
        <EmptyState title="Sesión terminada" body={`Has hecho ${items.length} ejercicios de expresión.`} actionLabel="Otra sesión" onAction={() => void load()} />
      ) : (
        <View style={styles.item}>
          <Text style={[styles.progress, { color: colors.textMuted }]}>{index + 1} / {items.length}</Text>

          {current.kind === 'writing' ? (
            <View style={styles.item}>
              {current.item.example ? (
                <View style={styles.prompt}>
                  <Text style={[styles.promptWord, { color: colors.text }]}>{blanked(current.item.example.word, current.item.hanzi)}</Text>
                  <Text style={[styles.note, { color: colors.textMuted }]}>
                    {current.item.example.pinyin} · {current.item.example.meaning}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.note, { color: colors.textMuted }]}>Escribe el carácter que falta, trazo a trazo.</Text>
              {writing?.guided ? (
                <CharacterWriting key="guided" mode="guided" hanzi={current.item.hanzi} onResult={() => undefined} />
              ) : !writing ? (
                <CharacterWriting key="quiz" mode="quiz" hanzi={current.item.hanzi} onResult={onQuiz(current.item)} onContentError={next} />
              ) : null}
              {writing ? (
                <View style={styles.item}>
                  <Text style={[styles.verdict, { color: writing.grade === 'good' ? colors.success : colors.vermilion }]}>
                    {writing.result.mistakes === 0 && writing.result.hints === 0
                      ? `${current.item.hanzi}: sin errores`
                      : `${current.item.hanzi}: ${writing.result.mistakes} ${writing.result.mistakes === 1 ? 'error' : 'errores'}${writing.result.hints ? `, ${writing.result.hints} ${writing.result.hints === 1 ? 'pista' : 'pistas'}` : ''}`}
                  </Text>
                  {!writing.guided ? (
                    <Button label="Practicar con el contorno" variant="outline" onPress={() => setWriting({ ...writing, guided: true })} />
                  ) : null}
                  <Button label="Siguiente" onPress={next} />
                </View>
              ) : null}
            </View>
          ) : current.kind === 'pronunciation' ? (
            <PronunciationExercise
              key={current.item.id}
              word={{
                hanzi: current.item.hanzi ?? '',
                pinyin: current.item.pinyin ?? '',
                meaning: current.item.meaning_es ?? current.item.meaning_en ?? null,
              }}
              onGraded={onPronounced(current.item)}
              onUnavailable={onPronunciationUnavailable}
            />
          ) : context ? (
            <CommunicativeTask
              key={current.task.slug}
              task={current.task}
              context={context}
              grade={(input) => getData().expression.gradeCommunicative(input)}
              onFinished={onCommunicative(current.task)}
            />
          ) : (
            <ActivityIndicator />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  exit: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  note: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
  item: { gap: tokens.spacing.md },
  progress: { fontSize: tokens.fontSize.sm },
  prompt: { alignItems: 'center', gap: tokens.spacing.xs },
  promptWord: { fontSize: 40, fontWeight: '500' },
  verdict: { fontSize: tokens.fontSize.md, fontWeight: '700', textAlign: 'center' },
});
