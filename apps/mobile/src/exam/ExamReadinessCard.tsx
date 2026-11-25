// Preparación para el examen en Progreso: último simulacro completo, evolución y la parte
// que más arrastra. Sin simulacros completos (no repetidos) no se muestra nada: ninguna
// métrica sin datos enseña un cero (regla del Plan 9).
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { examReadiness, type ExamPartCode, type ExamReadiness } from '@hanyu/domain';
import { getData } from '../lib/data';
import { Card } from '../ui/Card';
import { useTheme } from '../theme/ThemeProvider';

const PART_TITLES: Record<ExamPartCode, string> = {
  L1: '听力 1', L2: '听力 2', L3: '听力 3', R1: '阅读 1', R2: '阅读 2', R3: '阅读 3', R4: '阅读 4', W1: '书写 1', W2: '书写 2',
};

export function ExamReadinessCard() {
  const { colors } = useTheme();
  const [readiness, setReadiness] = useState<ExamReadiness | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getData().exam.listExamAttempts(2))
      .then(attempts => {
        if (!cancelled) setReadiness(examReadiness(attempts));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <Text style={[styles.line, { color: colors.textMuted }]}>No se pudieron cargar tus simulacros.</Text>;
  }
  if (!readiness) return null;
  return (
    <Card>
      <Text style={[styles.title, { color: colors.text }]}>Último simulacro: {readiness.last_percent} %</Text>
      {readiness.trend.length > 1 ? (
        <Text style={[styles.line, { color: colors.textMuted }]}>Evolución: {readiness.trend.map(value => `${value} %`).join(' → ')}</Text>
      ) : null}
      {readiness.weakest_part ? (
        <Text style={[styles.line, { color: colors.vermilion }]}>Parte más floja: {PART_TITLES[readiness.weakest_part]}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700' },
  line: { fontSize: 14, marginTop: 4 },
});
