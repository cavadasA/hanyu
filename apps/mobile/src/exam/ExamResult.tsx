// Resultado del simulacro: porcentaje por sección y total, aciertos por parte y la parte
// que más arrastra. El HSK 3.0 no ha publicado su escala, así que no hay «aprobado».
import { StyleSheet, Text, View } from 'react-native';
import type { ExamAttempt } from '@hanyu/data';
import type { ExamPartCode } from '@hanyu/domain';
import { Button } from '../ui/Button';
import { useTheme } from '../theme/ThemeProvider';

const SECTION_TITLES = { listening: '听力', reading: '阅读', writing: '书写' } as const;
const PART_TITLES: Record<ExamPartCode, string> = {
  L1: '听力 1', L2: '听力 2', L3: '听力 3', R1: '阅读 1', R2: '阅读 2', R3: '阅读 3', R4: '阅读 4', W1: '书写 1', W2: '书写 2',
};

export function ExamResult({ attempt, onClose }: { attempt: ExamAttempt; onClose(): void }) {
  const { colors } = useTheme();
  const parts = Object.entries(attempt.part_scores) as Array<[ExamPartCode, { correct: number; total: number; percent: number }]>;
  const weakest = parts.reduce<[ExamPartCode, number] | null>(
    (lowest, [part, score]) => (lowest === null || score.percent < lowest[1] ? [part, score.percent] : lowest),
    null,
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.total, { color: colors.text }]}>{attempt.total_percent} %</Text>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        El HSK 3.0 aún no ha publicado su escala de puntuación; esto es tu porcentaje de aciertos.
      </Text>
      {attempt.repeated ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Esta forma ya la habías hecho: el resultado no cuenta como estimación de tu nivel.
        </Text>
      ) : null}
      {(Object.keys(SECTION_TITLES) as Array<keyof typeof SECTION_TITLES>).map(section => {
        const score = attempt.section_scores[section];
        return score ? (
          <Text key={section} style={[styles.line, { color: colors.text }]}>
            {SECTION_TITLES[section]}: {score.percent} % ({score.correct}/{score.total})
          </Text>
        ) : null;
      })}
      <View style={styles.parts}>
        {parts.map(([part, score]) => (
          <Text key={part} style={[styles.part, { color: colors.textMuted }]}>
            {PART_TITLES[part]}: {score.correct}/{score.total}
          </Text>
        ))}
      </View>
      {weakest ? (
        <Text style={[styles.line, { color: colors.vermilion }]}>La parte que más te arrastra: {PART_TITLES[weakest[0]]}</Text>
      ) : null}
      <Button label="Cerrar" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  total: { fontSize: 48, fontWeight: '700' },
  note: { fontSize: 14 },
  line: { fontSize: 17, fontWeight: '600' },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  part: { fontSize: 14 },
});
