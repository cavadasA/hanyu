// Tarea comunicativa (Plan 13, Tarea 5). Dos capas: las reglas deterministas
// (checkAnswerRules: idioma, longitud, vocabulario del nivel, estructura pedida) se aplican
// aquí, sin red, y rechazan con el motivo concreto antes de llamar a nadie. Si pasan, la
// Edge Function grade-communicative decide si la respuesta cumple cada intención.
//
// Si el corrector no responde o no está configurado, la tarea queda «sin corregir» y no
// cuenta: nunca se inventa una nota. En modo `speak`, la respuesta pasa antes por el
// reconocedor de voz y se corrige como texto.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { checkAnswerRules, type AnswerRulesResult, type CommunicativeContext, type CommunicativeTask as Task } from '@hanyu/domain';
import type { GradeOutcome } from '@hanyu/data';
import { Button } from '../ui/Button';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useSpeechCheck } from './useSpeechCheck';

export type CommunicativeResult =
  | { status: 'graded'; passed: boolean }
  | { status: 'ungraded' }
  | { status: 'unavailable'; reason: string };

interface Props {
  task: Task;
  context: CommunicativeContext;
  grade: (input: { task_slug: string; answer: string }) => Promise<GradeOutcome>;
  onFinished: (result: CommunicativeResult) => void;
}

function markersFor(task: Task, context: CommunicativeContext): string[] {
  return task.required_markers.map((required) => {
    const point = context.grammar_points.find((entry) => entry.code === required.code && entry.hsk_level === required.hsk_level);
    return (point?.markers ?? []).join(' / ');
  }).filter(Boolean);
}

function ruleMessages(rules: AnswerRulesResult, task: Task, markers: string[]): string[] {
  return rules.reasons.map((reason) => {
    switch (reason) {
      case 'not_chinese':
        return 'Escribe la respuesta en caracteres chinos, sin pinyin ni español.';
      case 'too_short':
        return `Es demasiado corta: escribe al menos ${task.min_chars} caracteres.`;
      case 'too_long':
        return `Es demasiado larga: como mucho ${task.max_chars} caracteres.`;
      case 'unknown_vocabulary':
        return `Usa vocabulario de HSK ${task.hsk_level} o inferior. Fuera del nivel: ${rules.unknown_words.join('、')}`;
      case 'marker_missing':
        return `Falta la estructura que se pide: ${markers.join('; ')}`;
    }
  });
}

export function CommunicativeTask({ task, context, grade, onFinished }: Props) {
  const { colors } = useTheme();
  const speech = useSpeechCheck();
  const [answer, setAnswer] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<'listening' | 'grading' | null>(null);
  const [outcome, setOutcome] = useState<GradeOutcome | null>(null);
  const markers = markersFor(task, context);
  const speaking = task.mode === 'speak';

  const submit = async () => {
    const text = answer.trim();
    const rules = checkAnswerRules(text, task, context);
    if (!rules.ok) {
      setProblems(ruleMessages(rules, task, markers));
      return;
    }
    setProblems([]);
    setBusy('grading');
    const result = await grade({ task_slug: task.slug, answer: text }).catch(
      (): GradeOutcome => ({ status: 'unavailable', reason: 'network' }),
    );
    setBusy(null);
    if (result.status === 'rejected') {
      setProblems(result.reasons.map(() => 'El corrector rechazó la respuesta: revisa que esté en chino y tenga la longitud pedida.'));
      return;
    }
    setOutcome(result);
  };

  const listen = async () => {
    setBusy('listening');
    const result = await speech.transcribe();
    setBusy(null);
    if (result.status === 'transcribed') setAnswer(result.transcript);
    else if (result.status === 'error') setProblems(['El reconocedor de voz falló. Prueba otra vez.']);
  };

  const finish = () => {
    if (!outcome) return;
    if (outcome.status === 'graded') onFinished({ status: 'graded', passed: outcome.passed });
    else if (outcome.status === 'unavailable') onFinished({ status: 'unavailable', reason: outcome.reason });
    else onFinished({ status: 'ungraded' });
  };

  if (speaking && (speech.status === 'denied' || speech.status === 'unsupported')) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Esta tarea se responde hablando, y en este dispositivo no hay reconocimiento de voz en chino disponible.
        </Text>
        <Button label="Continuar" onPress={() => onFinished({ status: 'unavailable', reason: `speech_${speech.status}` })} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.situation, { color: colors.text }]}>{task.situation_es}</Text>

      {outcome?.status === 'graded' ? (
        <View style={styles.list}>
          {task.intent.map((intent, index) => (
            <Text
              key={intent}
              accessibilityLabel={`${intent}: ${outcome.intents[index] ? 'cumplida' : 'no cumplida'}`}
              style={[styles.item, { color: outcome.intents[index] ? colors.success : colors.vermilion }]}
            >
              {outcome.intents[index] ? '✓' : '✗'} {intent}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Tu respuesta debe:</Text>
          {task.intent.map((intent) => (
            <Text key={intent} style={[styles.item, { color: colors.text }]}>{intent}</Text>
          ))}
          {markers.length > 0 ? (
            <Text style={[styles.label, { color: colors.textMuted }]}>Usa la estructura: {markers.join('; ')}</Text>
          ) : null}
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Entre {task.min_chars} y {task.max_chars} caracteres.
          </Text>
        </View>
      )}

      {speaking ? (
        <View style={[styles.input, { borderColor: colors.border }]}>
          <Text style={[styles.answer, { color: answer ? colors.text : colors.textMuted }]}>
            {answer || 'Pulsa «Hablar» y responde en voz alta.'}
          </Text>
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Tu respuesta"
          value={answer}
          onChangeText={(text) => {
            setAnswer(text);
            // Los avisos son del envío anterior: al cambiar el texto ya no aplican.
            setProblems([]);
          }}
          editable={!outcome && busy === null}
          multiline
          placeholder="用中文写…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.answer, { borderColor: colors.border, color: colors.text }]}
        />
      )}

      {problems.map((problem) => (
        <Text key={problem} style={[styles.problem, { color: colors.vermilion }]}>{problem}</Text>
      ))}

      {outcome ? (
        <View style={styles.list}>
          {outcome.status === 'graded' ? (
            <>
              <Text style={[styles.verdict, { color: outcome.passed ? colors.success : colors.vermilion }]}>
                {outcome.passed ? 'Cumple lo que pedía la situación' : 'Aún no cumple todo lo que pedía la situación'}
              </Text>
              <Text style={[styles.item, { color: colors.text }]}>{outcome.feedback_es}</Text>
            </>
          ) : (
            <Text style={[styles.verdict, { color: colors.textMuted }]}>
              {outcome.status === 'unavailable' && outcome.reason === 'not_configured'
                ? 'Sin corregir: la corrección de tareas comunicativas no está activada. Esta respuesta no cuenta.'
                : 'Sin corregir: el corrector no respondió. Esta respuesta no cuenta.'}
            </Text>
          )}
          <Text style={[styles.label, { color: colors.textMuted }]}>Una respuesta posible:</Text>
          <Text style={[styles.answer, { color: colors.text }]}>{task.model_answer.zh}</Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>{task.model_answer.pinyin}</Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>{task.model_answer.es}</Text>
          <Button label="Continuar" onPress={finish} />
        </View>
      ) : (
        <View style={styles.actions}>
          {speaking ? (
            <View style={styles.action}>
              <Button
                label={busy === 'listening' ? 'Escuchando…' : 'Hablar'}
                variant="outline"
                onPress={busy === 'listening' ? speech.stop : () => void listen()}
              />
            </View>
          ) : null}
          <View style={styles.action}>
            <Button
              label={busy === 'grading' ? 'Corrigiendo…' : 'Enviar'}
              onPress={() => void submit()}
              disabled={busy !== null || !answer.trim()}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.spacing.md },
  situation: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  list: { gap: tokens.spacing.xs },
  label: { fontSize: tokens.fontSize.sm },
  item: { fontSize: tokens.fontSize.md },
  input: { borderWidth: 1, borderRadius: 10, padding: tokens.spacing.md, minHeight: 88 },
  answer: { fontSize: tokens.fontSize.lg },
  problem: { fontSize: tokens.fontSize.sm },
  verdict: { fontSize: tokens.fontSize.md, fontWeight: '700' },
  note: { fontSize: tokens.fontSize.md, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: tokens.spacing.md },
  action: { flex: 1 },
});
