// El simulacro HSK 2 (formato 3.0) entero: descarga, 听力 (~17 min, al ritmo del audio),
// 3 minutos de hoja de respuestas, 阅读 (25 min), 书写 (10 min), entrega y resultado.
// Las fases las decide el reloj de pared, no un temporizador que se para en segundo plano.
// Es el modo Exam: sin ayudas, con tiempo y sin tocar ninguna tarjeta.
// Quien acaba antes puede cerrar la hoja de respuestas, 阅读 o 书写 (como en el examen por
// ordenador); 听力 no, porque va al ritmo del audio. El tiempo sobrante no pasa a la siguiente.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { answersByIndex, type ExamAttempt, type ServedExamForm } from '@hanyu/data';
import { getData } from '../lib/data';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { ExamResult } from './ExamResult';
import { ListeningSection } from './ListeningSection';
import { EXAM_MINUTES, listeningEndMs, mediaUrls, questionKey, questionNumbers } from './examModel';
import { BankGroup, HandwriteBlank, ImageChoiceGroup, pickInGroup, TextChoice, type Picks } from './parts';
import { useExamDownload } from './useExamDownload';

type Phase = 'loading' | 'empty' | 'error' | 'ready' | 'listening' | 'answer_sheet' | 'reading' | 'writing' | 'submitting' | 'result';
type TimedPhase = 'listening' | 'answer_sheet' | 'reading' | 'writing';

const NEXT: Record<TimedPhase, TimedPhase | 'submit'> = {
  listening: 'answer_sheet',
  answer_sheet: 'reading',
  reading: 'writing',
  writing: 'submit',
};
const TITLES: Record<TimedPhase, string> = {
  listening: '听力',
  answer_sheet: 'Hoja de respuestas de 听力',
  reading: '阅读',
  writing: '书写',
};
/** Botón para cerrar la fase antes de que acabe su tiempo. 听力 no tiene. */
const FINISH_EARLY: Partial<Record<TimedPhase, { label: string; title: string; confirm: string }>> = {
  answer_sheet: { label: 'Pasar a 阅读', title: '¿Pasar ya a 阅读?', confirm: 'Pasar' },
  reading: { label: 'Terminar 阅读', title: '¿Terminar 阅读?', confirm: 'Terminar' },
  writing: { label: 'Entregar', title: '¿Entregar el simulacro?', confirm: 'Entregar' },
};
/** En los grupos de banco común cada opción se usa una vez. */
const EXCLUSIVE = new Set(['L2', 'R1', 'R2', 'R3', 'W1']);

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function ExamRunner({ formCode }: { formCode: string | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<ServedExamForm | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [phaseStart, setPhaseStart] = useState(0);
  const [startedAt, setStartedAt] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [picks, setPicks] = useState<Picks>({});
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = useMemo(() => (form ? mediaUrls(form) : null), [form]);
  const download = useExamDownload(urls);
  const numbers = useMemo(() => (form ? questionNumbers(form) : {}), [form]);

  useEffect(() => {
    let cancelled = false;
    getData()
      .exam.getExamForm(2, formCode)
      .then(served => {
        if (cancelled) return;
        setForm(served);
        setPhase(served ? 'ready' : 'empty');
      })
      .catch(reason => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [formCode]);

  const running = phase === 'listening' || phase === 'answer_sheet' || phase === 'reading' || phase === 'writing';
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 500);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [running]);

  const duration = useCallback(
    (timed: TimedPhase) => (timed === 'listening' ? (form ? listeningEndMs(form) : 0) : EXAM_MINUTES[timed] * 60_000),
    [form],
  );

  const submit = useCallback(async () => {
    if (!form) return;
    setPhase('submitting');
    try {
      const graded = await getData().exam.submitExamAttempt({
        level: form.level,
        form_code: form.code,
        scope: 'full',
        started_at: startedAt,
        answers: answersByIndex(form, picks),
      });
      setAttempt(graded);
      setPhase('result');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase('error');
    }
  }, [form, picks, startedAt]);

  useEffect(() => {
    if (!running) return;
    const timed = phase as TimedPhase;
    const end = phaseStart + duration(timed);
    if (now < end) return;
    const next = NEXT[timed];
    if (next === 'submit') {
      void submit();
      return;
    }
    // La siguiente fase empieza cuando acabó esta, no cuando se notó: tras un rato en
    // segundo plano, el examen sigue donde tocaría por reloj.
    setPhaseStart(end);
    setPhase(next);
  }, [now, phase, phaseStart, running, duration, submit]);

  const begin = () => {
    const at = Date.now();
    setStartedAt(new Date(at).toISOString());
    setPhaseStart(at);
    setNow(at);
    setPhase('listening');
  };

  // Función normal y no useCallback: así añadirla no cambia la lista de hooks.
  const finishEarly = (timed: TimedPhase) => {
    const copy = FINISH_EARLY[timed];
    if (!copy) return;
    Alert.alert(copy.title, 'No podrás volver a esta sección.', [
      { text: 'Seguir', style: 'cancel' },
      {
        text: copy.confirm,
        style: 'destructive',
        onPress: () => {
          const next = NEXT[timed];
          if (next === 'submit') {
            void submit();
            return;
          }
          const at = Date.now();
          setPhaseStart(at);
          setNow(at);
          setPhase(next);
        },
      },
    ]);
  };

  const onPick = useCallback((slug: string, index: number, value: number | string | null) => {
    setPicks(previous => {
      const group = form?.content.groups.find(entry => entry.slug === slug);
      return pickInGroup(previous, slug, index, value, EXCLUSIVE.has(group?.part ?? ''));
    });
  }, [form]);

  if (phase === 'loading') return <Screen><Text style={{ color: colors.textMuted }}>Cargando el simulacro…</Text></Screen>;
  if (phase === 'empty') return <Screen><Text style={{ color: colors.text }}>Todavía no hay ninguna forma del simulacro publicada.</Text></Screen>;
  if (phase === 'error' || !form) return <Screen><Text style={{ color: colors.vermilion }}>{error ?? 'No se pudo cargar el simulacro.'}</Text></Screen>;
  if (phase === 'result' && attempt) return <Screen><ExamResult attempt={attempt} onClose={() => router.back()} /></Screen>;
  if (phase === 'submitting') return <Screen><Text style={{ color: colors.textMuted }}>Entregando…</Text></Screen>;

  if (phase === 'ready') {
    return (
      <Screen>
        <View style={styles.gap}>
          <Text style={[styles.title, { color: colors.text }]}>Simulacro HSK 2 · forma {form.code}</Text>
          <Text style={{ color: colors.textMuted }}>
            听力 unos 17 min (sin pausas), 3 min de hoja de respuestas, 阅读 25 min y 书写 10 min. Sin pinyin al tocar ni traducción.
          </Text>
          {form.repeated ? (
            <Text style={{ color: colors.textMuted }}>Ya hiciste esta forma: el resultado no contará como estimación de nivel.</Text>
          ) : null}
          <Text style={{ color: colors.text }}>Descarga: {Math.round(download.progress * 100)} %</Text>
          {download.failed ? (
            <>
              <Text style={{ color: colors.vermilion }}>La descarga no ha terminado. Sin ella no se puede empezar.</Text>
              <Button label="Reintentar descarga" variant="outline" onPress={download.retry} />
            </>
          ) : null}
          <Button label="Empezar" onPress={begin} disabled={!download.ready} />
        </View>
      </Screen>
    );
  }

  const timed = phase as TimedPhase;
  const remaining = phaseStart + duration(timed) - now;
  const groupsOf = (prefix: string) => form.content.groups.filter(group => group.part.startsWith(prefix));
  const answered = (slug: string, index: number) => picks[slug]?.[index] !== undefined && picks[slug]?.[index] !== null;

  return (
    <Screen>
      <View style={styles.gap}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{TITLES[timed]}</Text>
          <Text style={[styles.clock, { color: colors.text }]}>{clock(remaining)}</Text>
        </View>

        {timed === 'listening' || timed === 'answer_sheet' ? (
          <ListeningSection
            form={form}
            elapsedMs={timed === 'listening' ? now - phaseStart : -1}
            numbers={numbers}
            picks={picks}
            onPick={onPick}
            localUri={download.localUri}
          />
        ) : null}

        {timed === 'reading' ? (
          <>
            <View style={styles.grid}>
              {groupsOf('R').flatMap(group =>
                group.items.map((_, index) => (
                  <Text
                    key={questionKey(group.slug, index)}
                    style={[styles.cell, { borderColor: colors.border, backgroundColor: answered(group.slug, index) ? colors.vermilion : colors.surface, color: answered(group.slug, index) ? colors.onAccent : colors.text }]}
                  >
                    {numbers[questionKey(group.slug, index)]}
                  </Text>
                )),
              )}
            </View>
            {groupsOf('R').map(group => {
              const common = { numbers, picks, onPick };
              if (group.part === 'R1') return <ImageChoiceGroup key={group.slug} group={group} images={form.media.images} localUri={download.localUri} {...common} />;
              if (group.part === 'R4') return <TextChoice key={group.slug} group={group} {...common} />;
              return <BankGroup key={group.slug} group={group as Extract<typeof group, { part: 'R2' | 'R3' }>} characters={form.media.characters} {...common} />;
            })}
          </>
        ) : null}

        {timed === 'writing'
          ? groupsOf('W').map(group =>
              group.part === 'W1' ? (
                <BankGroup key={group.slug} group={group} characters={form.media.characters} numbers={numbers} picks={picks} onPick={onPick} />
              ) : (
                <HandwriteBlank key={group.slug} group={group as Extract<typeof group, { part: 'W2' }>} numbers={numbers} picks={picks} onPick={onPick} />
              ),
            )
          : null}

        {FINISH_EARLY[timed] ? (
          <Button label={FINISH_EARLY[timed]!.label} variant="outline" onPress={() => finishEarly(timed)} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  clock: { fontSize: 20, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 34, height: 30, borderWidth: 1, borderRadius: 6, textAlign: 'center', lineHeight: 28, overflow: 'hidden' },
});
