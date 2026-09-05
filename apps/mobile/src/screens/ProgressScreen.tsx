import { useCallback, useEffect, useState } from 'react';
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
  lookupsPer100Tokens,
  masteryBySkill,
  observedRetention,
  readingSpeed,
  type ReadingSession,
  type Retention,
  type RetentionReview,
  type SkillMastery,
  type SkillStateRow,
} from '@hanyu/domain';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const SKILL_LABELS: Record<string, string> = {
  recognition: 'Reconocimiento',
  recall: 'Recuerdo',
  listening: 'Escucha',
  reading: 'Lectura',
  production: 'Producción',
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

  if (loading) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.vermilion} />
        </View>
      </Screen>
    );
  }

  const now = new Date();

  // Bloque 1: Memoria (retención observada a 7 y 30 días)
  const retentionReviews: RetentionReview[] = (report?.reviews ?? []).map((r: LearningReportReview) => ({
    occurred_at: r.occurred_at,
    grade: r.grade,
    phase_before: r.phase_before ?? '',
  }));
  const retention7 = observedRetention(retentionReviews, now, 7, targetRetention);
  const retention30 = observedRetention(retentionReviews, now, 30, targetRetention);

  // Bloque 2: Competencias (dominio demostrado por habilidad)
  const skillStates: SkillStateRow[] = (report?.skill_states ?? []).map((s: LearningReportSkillState) => ({
    target_id: s.target_id,
    skill: s.skill,
    stability: s.stability,
    suspended: s.suspended,
    last_reviewed_at: s.last_reviewed_at,
  }));
  const mastery = masteryBySkill(skillStates, now);

  // Bloque 3: Lectura
  const rawSessions = report?.reading_sessions ?? [];
  const readingSessions: ReadingSession[] = rawSessions.map((s) => ({
    chars: (s as any).chars ?? 100,
    seconds: s.seconds,
    pinyin_shown: s.pinyin_shown,
  }));
  const speed = readingSpeed(readingSessions);
  const totalTokens = rawSessions.reduce((acc, s) => acc + ((s as any).chars ?? 100), 0);
  const lookups = report?.lookups ?? 0;
  const lookupRate = totalTokens > 0 ? lookupsPer100Tokens(lookups, totalTokens) : null;

  // Comprensión literal
  const readingAttempts = (report?.attempts ?? []).filter((a) => a.skill === 'reading');
  const literalCorrect = readingAttempts.filter((a) => a.correct).length;
  const literalTotal = readingAttempts.length;

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

        {/* BLOQUE 1: MEMORIA */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Memoria y retención</Text>
            <Badge label={`Objetivo: ${Math.round(targetRetention * 100)} %`} />
          </View>
          <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
            Medido exclusivamente sobre tarjetas en fase de repaso consolidado.
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

        {/* BLOQUE 2: COMPETENCIAS */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Vocabulario demostrado</Text>
            <Badge label="Estabilidad ≥ 30 días" />
          </View>
          <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
            Demostrado por competencia individual con la fecha del repaso más antiguo.
          </Text>

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
                      {m!.demonstrated} palabras
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

        {/* BLOQUE 3: LECTURA */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
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
              <Text style={[styles.metricName, { color: colors.text }]}>Consultas por 100 tokens</Text>
              {lookupRate !== null ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {lookupRate} consultas / 100 tokens{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({lookups} consultas en {totalTokens} tokens leídos)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no hay lecturas finalizadas para calcular la tasa de consultas.
                </Text>
              )}
            </View>
          </View>

          {/* Comprensión literal */}
          <View style={[styles.metricRow, { borderBottomColor: colors.border }]}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Comprensión literal</Text>
              {literalTotal > 0 ? (
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {Math.round((literalCorrect / literalTotal) * 100)} %{' '}
                  <Text style={[styles.sampleText, { color: colors.textMuted }]}>
                    ({literalCorrect} de {literalTotal} preguntas acertadas)
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                  Aún no se han completado preguntas de comprensión literal.
                </Text>
              )}
            </View>
          </View>

          {/* Comprensión inferencial (ausente declarada con motivo) */}
          <View style={styles.metricRow}>
            <View style={styles.metricTextContainer}>
              <Text style={[styles.metricName, { color: colors.text }]}>Comprensión inferencial</Text>
              <Text style={[styles.emptyNotice, { color: colors.textMuted }]}>
                No disponible: todas las preguntas del catálogo son literales por construcción
                al exigir evidencia textual explícita en cada respuesta.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
