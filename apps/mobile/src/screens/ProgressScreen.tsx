import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  toUserMessage,
  type LearningReport,
  type LearningReportReview,
  type LearningReportSkillState,
} from '@hanyu/data';
import {
  comprehensionAnswersMissing,
  comprehensionByKind,
  MIN_ANSWERS_PER_KIND,
  lookupsPer100Chars,
  masteryBySkill,
  observedRetention,
  readingSpeed,
  syllabusCoverage,
  type ReadingSession,
  type ComprehensionRatio,
  type Retention,
  type RetentionReview,
  type SkillMastery,
  type SkillStateRow,
} from '@hanyu/domain';
import { ExamReadinessCard } from '../exam/ExamReadinessCard';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const SKILL_LABELS: Record<string, string> = {
  recognition: 'Reconocimiento',
  recall: 'Recuerdo',
  listening: 'Escucha',
  reading: 'Lectura',
  production: 'Producción',
  pronunciation: 'Pronunciación',
  writing: 'Escritura',
};

function formatPercent(rate: number | null): string {
  if (rate === null) return '';
  return `${Math.round(rate * 100)} %`;
}

function formatGap(gap: number | null): string {
  if (gap === null) return '';
  const rounded = Math.round(gap * 100);
  if (rounded > 0) return `+${rounded} %`;
  return `${rounded} %`;
}

function interpretRetention(retention: Retention): string | null {
  if (retention.rate === null || retention.target_gap === null) return null;
  const gap = retention.target_gap;
  if (gap > 0.02) {
    return 'Por encima del objetivo: se está repasando de más o con intervalos demasiado conservadores.';
  }
  if (gap < -0.02) {
    return 'Por debajo del objetivo: se está repasando demasiado tarde o con intervalos excesivos.';
  }
  return 'En línea con la retención objetivo.';
}

export function ProgressScreen() {
  const { colors } = useTheme();
  const [report, setReport] = useState<LearningReport | null>(null);
  const [targetRetention, setTargetRetention] = useState<number>(0.9);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [reportData, settingsData] = await Promise.all([
        getData().stats.getLearningReport(),
        getData().settings.getSettings().catch(() => ({})),
      ]);
      setReport(reportData);
      if (typeof (settingsData as any)?.request_retention === 'number') {
        setTargetRetention((settingsData as any).request_retention);
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    if (!report) return null;
    const now = new Date();

    // Bloque 1: Memoria (retención observada a 7 y 30 días)
    const retentionReviews: RetentionReview[] = (report.reviews ?? []).map((r: LearningReportReview) => ({
      occurred_at: r.occurred_at,
      grade: r.grade,
      phase_before: r.phase_before ?? '',
    }));
    const retention7 = observedRetention(retentionReviews, now, 7, targetRetention);
    const retention30 = observedRetention(retentionReviews, now, 30, targetRetention);

    // Bloque 2: Vocabulario y sílabo
    const skillStates: SkillStateRow[] = (report.skill_states ?? []).map((s: LearningReportSkillState) => ({
      target_id: s.target_id,
      skill: s.skill,
      stability: s.stability,
      suspended: s.suspended,
      last_reviewed_at: s.last_reviewed_at,
      in_scope: s.in_scope,
    }));
    const mastery = masteryBySkill(skillStates, now, targetRetention);
    const coverageScope = report.syllabus_words_count ?? 0;
    const coverage = syllabusCoverage(skillStates, coverageScope, now, targetRetention);

    // Bloque 3: Gramática
    const units = report.units ?? [];
    const completedUnits = units.filter((u) => u.completed).length;
    const totalUnits = units.length;

    // Bloque 4: Habilidades activas y evaluación
    const attempts = report.attempts ?? [];
    const dictationAttempts = attempts.filter((a) => a.skill === 'listening');
    const dictationCorrect = dictationAttempts.filter((a) => a.correct).length;
    const dictationTotal = dictationAttempts.length;

    const prodAttempts = attempts.filter((a) => a.skill === 'production' || a.skill === 'recall');
    const prodCorrect = prodAttempts.filter((a) => a.correct).length;
    const prodTotal = prodAttempts.length;

    const examAttempts = attempts.filter((a) => a.mode === 'exam');
    const examCorrect = examAttempts.filter((a) => a.correct).length;
    const examTotal = examAttempts.length;

    const mistakesCount = report.mistakes_count ?? 0;

    // Bloque 5: Lectura y esfuerzo
    const rawSessions = report.reading_sessions ?? [];
    const readingSessions: ReadingSession[] = rawSessions.map((s) => ({
      chars: s.chars,
      seconds: s.seconds,
      pinyin_shown: s.pinyin_shown,
    }));
    const speed = readingSpeed(readingSessions);
    const totalTokens = rawSessions.reduce((acc, s) => acc + s.chars, 0);
    const lookups = report.lookups ?? 0;
    const lookupRate = totalTokens > 0 ? lookupsPer100Chars(lookups, totalTokens) : null;

    // Comprensión literal e inferencial, por separado (reading_attempts)
    const comprehension = comprehensionByKind(report.reading_attempts ?? []);
    const comprehensionMissing = comprehensionAnswersMissing(report.reading_attempts ?? []);

    return {
      retention7,
      retention30,
      mastery,
      coverage,
      completedUnits,
      totalUnits,
      dictationCorrect,
      dictationTotal,
      prodCorrect,
      prodTotal,
      examCorrect,
      examTotal,
      mistakesCount,
      speed,
      totalTokens,
      lookups,
      lookupRate,
      comprehension,
      comprehensionMissing,
    };
  }, [report, targetRetention]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.vermilion} />
        </View>
      </Screen>
    );
  }

  if ((error && !report) || !metrics) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <ErrorBanner message={error ?? 'No se pudieron cargar los datos de progreso.'} />
          <Button
            label="Reintentar"
            onPress={() => {
              setLoading(true);
              void loadData();
            }}
            variant="primary"
          />
        </View>
      </Screen>
    );
  }

  const {
    retention7,
    retention30,
    mastery,
    coverage,
    completedUnits,
    totalUnits,
    dictationCorrect,
    dictationTotal,
    prodCorrect,
    prodTotal,
    examCorrect,
    examTotal,
    mistakesCount,
    speed,
    totalTokens,
    lookups,
    lookupRate,
    comprehension,
    comprehensionMissing,
  } = metrics;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Progreso real</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Qué sabes, con qué evidencia y desde cuándo
          </Text>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <ExamReadinessCard />

        {/* BLOQUE 1: MEMORIA */}
        <Card style={styles.sectionCard}>
          <View testID="section-header" style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Memoria y retención</Text>
            <Badge label={`Objetivo: ${Math.round(targetRetention * 100)} %`} />
          </View>
          <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
            Medido exclusivamente sobre repasos con registro de fase (los repasos anteriores a la migración
            quedan excluidos para no mezclar aprendizaje con repaso consolidado).
          </Text>

          {/* Ventana a 7 días */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Retención a 7 días</Text>
              {retention7.rate !== null ? (
                <>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatPercent(retention7.rate)}{' '}
                    <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                      sobre {retention7.sample} repasos
                    </Text>
                  </Text>
                  {retention7.target_gap !== null ? (
                    <Text style={[styles.gapText, { color: colors.textMuted }]}>
                      Distancia al objetivo: {formatGap(retention7.target_gap)}
                    </Text>
                  ) : null}
                  {interpretRetention(retention7) ? (
                    <Text style={[styles.interpretationText, { color: colors.textMuted }]}>
                      {interpretRetention(retention7)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay repasos suficientes en los últimos 7 días.
                </Text>
              )}
            </View>
          </View>

          {/* Ventana a 30 días */}
          <View style={styles.metricRow}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Retención a 30 días</Text>
              {retention30.rate !== null ? (
                <>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatPercent(retention30.rate)}{' '}
                    <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                      sobre {retention30.sample} repasos
                    </Text>
                  </Text>
                  {retention30.target_gap !== null ? (
                    <Text style={[styles.gapText, { color: colors.textMuted }]}>
                      Distancia al objetivo: {formatGap(retention30.target_gap)}
                    </Text>
                  ) : null}
                  {interpretRetention(retention30) ? (
                    <Text style={[styles.interpretationText, { color: colors.textMuted }]}>
                      {interpretRetention(retention30)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay repasos suficientes en los últimos 30 días.
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* BLOQUE 2: VOCABULARIO Y SÍLABO */}
        <Card style={styles.sectionCard}>
          <View testID="section-header" style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Vocabulario demostrado</Text>
            <Badge label="Estabilidad ≥ 30 d y retención activa" />
          </View>
          <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
            Demostrado por competencia individual con retención vigente según tu objetivo ({Math.round(targetRetention * 100)} %).
          </Text>

          {/* Cobertura del vocabulario */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Cobertura del vocabulario</Text>
              {coverage.in_scope > 0 ? (
                <>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {coverage.percent_demonstrated} %{' '}
                    <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                      ({coverage.demonstrated} de {coverage.in_scope} palabras del catálogo en este nivel)
                    </Text>
                  </Text>
                  <Text style={[styles.gapText, { color: colors.textMuted }]}>
                    {coverage.started} palabras en estudio activo
                  </Text>
                </>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  No hay palabras registradas en el alcance del nivel actual.
                </Text>
              )}
            </View>
          </View>

          {Object.entries(SKILL_LABELS).map(([skillKey, skillName]) => {
            const m: SkillMastery | undefined = mastery[skillKey];
            const hasDemonstrated = Boolean(m && m.demonstrated > 0);
            return (
              <View
                key={skillKey}
                style={[styles.skillRow, { borderBottomColor: colors.border }]}
              >
                <View style={styles.skillHeader}>
                  <Text style={[styles.skillName, { color: colors.text }]}>{skillName}</Text>
                  {hasDemonstrated ? (
                    <Text style={[styles.demonstratedCount, { color: colors.vermilion }]}>
                      {m!.demonstrated} {skillKey === 'writing' ? 'caracteres' : 'palabras'}
                    </Text>
                  ) : null}
                </View>

                {hasDemonstrated ? (
                  <Text style={[styles.evidenceText, { color: colors.textMuted }]}>
                    {m!.oldest_days !== null
                      ? `La más antigua hace ${m!.oldest_days} días`
                      : 'Demostración reciente sin antigüedad calculable'}
                  </Text>
                ) : (
                  <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                    Aún no hay palabras demostradas en esta habilidad (requiere repasos con estabilidad suficiente).
                  </Text>
                )}
              </View>
            );
          })}
        </Card>

        {/* BLOQUE 3: GRAMÁTICA */}
        <Card style={styles.sectionCard}>
          <View testID="section-header" style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gramática y unidades</Text>
          </View>
          <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
            Unidades del nivel con su vocabulario y gramática consolidados.
          </Text>

          <View style={styles.metricRow}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Unidades completadas</Text>
              {totalUnits > 0 ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {completedUnits} de {totalUnits} unidades{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({Math.round((completedUnits / totalUnits) * 100)} %)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay unidades registradas en el nivel actual.
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* BLOQUE 4: PRECISIÓN Y EVALUACIÓN */}
        <Card style={styles.sectionCard}>
          <View testID="section-header" style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Precisión y evaluación</Text>
          </View>

          {/* Precisión de dictado */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Precisión de dictado</Text>
              {dictationTotal > 0 ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {Math.round((dictationCorrect / dictationTotal) * 100)} %{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({dictationCorrect} de {dictationTotal} ejercicios)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay ejercicios de escucha realizados.
                </Text>
              )}
            </View>
          </View>

          {/* Precisión de producción */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Precisión de producción</Text>
              {prodTotal > 0 ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {Math.round((prodCorrect / prodTotal) * 100)} %{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({prodCorrect} de {prodTotal} ejercicios)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay ejercicios de producción realizados.
                </Text>
              )}
            </View>
          </View>

          {/* Rendimiento en simulacros */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Rendimiento en simulacros</Text>
              {examTotal > 0 ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {Math.round((examCorrect / examTotal) * 100)} %{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({examCorrect} de {examTotal} preguntas de examen)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no has realizado simulacros de examen.
                </Text>
              )}
            </View>
          </View>

          {/* Errores recurrentes */}
          <View style={styles.metricRow}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Errores recurrentes pendientes</Text>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {mistakesCount}{' '}
                <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                  {mistakesCount === 1 ? 'error en cola de consolidación' : 'errores en cola de consolidación'}
                </Text>
              </Text>
            </View>
          </View>
        </Card>

        {/* BLOQUE 5: LECTURA Y ESFUERZO */}
        <Card style={styles.sectionCard}>
          <View testID="section-header" style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Lectura y esfuerzo</Text>
          </View>

          {/* Velocidad de lectura */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Velocidad sin pinyin</Text>
              {speed.chars_per_minute !== null ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {speed.chars_per_minute} car./min
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay sesiones de lectura terminadas sin pinyin visible.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Velocidad con pinyin visible</Text>
              {speed.with_pinyin_chars_per_minute !== null ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {speed.with_pinyin_chars_per_minute} car./min
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay sesiones de lectura con pinyin visible.
                </Text>
              )}
            </View>
          </View>

          {/* Consultas de vocabulario */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Consultas por 100 caracteres</Text>
              {lookupRate !== null ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {lookupRate} consultas / 100 car.{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({lookups} consultas en {totalTokens} caracteres chinos leídos)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay lecturas finalizadas para calcular la tasa de consultas.
                </Text>
              )}
            </View>
          </View>

          <ComprehensionRow
            name="Comprensión literal"
            value={comprehension.literal}
            missing={comprehensionMissing.literal}
            colors={colors}
            bordered
          />
          <ComprehensionRow
            name="Comprensión inferencial"
            value={comprehension.inferential}
            missing={comprehensionMissing.inferential}
            colors={colors}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ComprehensionRow({
  name,
  value,
  missing,
  colors,
  bordered = false,
}: {
  name: string;
  value: ComprehensionRatio | null;
  /** Respuestas que faltan para calcularla; con alguna ya dada, se dice cuántas. */
  missing: number;
  colors: ReturnType<typeof useTheme>['colors'];
  bordered?: boolean;
}) {
  return (
    <View style={[styles.metricRow, bordered ? { borderBottomColor: colors.border } : null]}>
      <View style={styles.metricTextContainer}>
        <Text style={[styles.metricName, { color: colors.text }]}>{name}</Text>
        {value ? (
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {Math.round(value.ratio * 100)} %{' '}
            <Text style={[styles.sampleText, { color: colors.textMuted }]}>
              ({value.correct} de {value.total} preguntas acertadas)
            </Text>
          </Text>
        ) : (
          <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
            {missing > 0 && missing < MIN_ANSWERS_PER_KIND
              ? `Faltan ${missing} ${missing === 1 ? 'respuesta' : 'respuestas'} para calcularla`
              : 'Sin datos todavía'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  header: {
    gap: tokens.spacing.xs,
  },
  title: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
  },
  sectionCard: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    // Una etiqueta larga («Estabilidad ≥ 30 d y retención activa») baja de línea
    // en vez de salirse por la derecha.
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
  },
  sectionCaption: {
    fontSize: tokens.fontSize.xs,
    marginTop: -tokens.spacing.xs,
  },
  metricRow: {
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metricTextContainer: {
    gap: tokens.spacing.xs,
  },
  metricName: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  sampleText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '400',
  },
  gapText: {
    fontSize: tokens.fontSize.xs,
  },
  interpretationText: {
    fontSize: tokens.fontSize.xs,
    fontStyle: 'italic',
  },
  emptyNotice: {
    fontSize: tokens.fontSize.xs,
    fontStyle: 'italic',
  },
  skillRow: {
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: tokens.spacing.xs,
  },
  skillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillName: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  demonstratedCount: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  evidenceText: {
    fontSize: tokens.fontSize.xs,
  },
});
