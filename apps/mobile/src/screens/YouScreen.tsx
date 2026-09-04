import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  toUserMessage,
  isValidExamDate,
  type CardOrder,
  type LearnerSkillState,
  type ThemePreference,
  type UserSettings,
} from '@hanyu/data';
import { getData } from '../lib/data';
import { useOfflineReview } from '../offline/OfflineReviewProvider';
import { useSession } from '../session/SessionProvider';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { NumberRow } from '../ui/NumberRow';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const ORDERS: readonly CardOrder[] = ['due', 'frequency'];
const LEVELS = ['1', '2', '3', '4', '5', '6'] as const;
const SUPPORT_LANGUAGES = ['es', 'en'] as const;
const RETENTION_OPTIONS = [
  { value: 0.85, label: 'Relajado (0,85)' },
  { value: 0.9, label: 'Equilibrado (0,90)' },
  { value: 0.95, label: 'Exigente (0,95)' },
] as const;

interface HeroStats {
  mastered: number;
  accuracy: number | null;
}

export default function YouScreen() {
  const { colors, setPreference } = useTheme();
  const { session, signOut } = useSession();
  const { updateReviewSettings } = useOfflineReview();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [heroStats, setHeroStats] = useState<HeroStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leeches, setLeeches] = useState<LearnerSkillState[]>([]);
  const [draftExamDate, setDraftExamDate] = useState('');
  const [examDateError, setExamDateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const loaded = (await getData().settings.getSettings()) as UserSettings;
      setSettings(loaded);
      setDraftExamDate(loaded.exam_date ?? '');
      setExamDateError('');
    } catch (caught) {
      setError(toUserMessage(caught));
      setLoading(false);
      return;
    }

    // Best-effort dashboard stats for the hero
    try {
      const dashboard = (await getData().stats.getDashboard()) as {
        cards: { by_status: Partial<Record<string, number>> };
        exercise_stats: { accuracy: number | null };
      };
      setHeroStats({
        mastered: dashboard.cards?.by_status?.mastered ?? 0,
        accuracy: dashboard.exercise_stats?.accuracy ?? null,
      });
    } catch {
      // Dashboard is non-critical — hero degrades gracefully
    }

    try {
      const skills = getData().skills;
      if (typeof skills?.getLeechStates === 'function') {
        setLeeches(await skills.getLeechStates('recognition'));
      }
    } catch {
      // Leech management is non-critical — settings remain usable offline.
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<UserSettings>) {
    if (saving) {
      return;
    }

    const previous = settings;
    const previousTheme = previous?.theme;
    setSaving(true);
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setError('');

    if (patch.theme) {
      setPreference(patch.theme);
    }

    try {
      const saved = (await getData().settings.updateSettings(patch)) as UserSettings;
      setSettings(saved);
      if (patch.exam_date !== undefined) {
        setDraftExamDate(saved.exam_date ?? '');
      }
      if (patch.request_retention !== undefined) {
        updateReviewSettings({ request_retention: saved.request_retention });
      }
    } catch (caught) {
      setSettings(previous);
      if (patch.theme && previousTheme) {
        setPreference(previousTheme);
      }
      setError(toUserMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function reactivate(state: LearnerSkillState) {
    try {
      const skills = getData().skills;
      if (typeof skills?.clearLeech !== 'function') return;
      await skills.clearLeech({
        target_kind: state.target_kind,
        target_id: state.target_id,
        skill: state.skill,
      });
      setLeeches((current) => current.filter((entry) => entry.id !== state.id));
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }

  if (loading && !settings) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const userEmail = session?.user?.email ?? '-';
  const userInitials = userEmail !== '-' ? userEmail.slice(0, 2).toUpperCase() : 'HY';
  const currentLevel = settings?.current_level ?? 2;

  return (
    <Screen>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: colors.text }]}>You</Text>
        <View style={[styles.sealBadge, { backgroundColor: colors.vermilion }]}>
          <Text style={[styles.sealText, { color: colors.onAccent }]}>漢</Text>
        </View>
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {/* Hero — vermilion achievement card */}
      <View style={[styles.hero, { backgroundColor: colors.vermilion }]}>
        <Text style={[styles.heroMetric, { color: colors.onAccent }]}>
          {heroStats ? String(heroStats.mastered) : '—'}
        </Text>
        <Text style={[styles.heroLabel, { color: colors.onAccent + 'E6' }]}>words mastered</Text>
        <View style={[styles.heroDivider, { backgroundColor: colors.onAccent + '33' }]} />
        <Text style={[styles.heroMuted, { color: colors.onAccent + 'E6' }]}>
          {heroStats?.accuracy != null
            ? `HSK ${currentLevel} · ${Math.round(heroStats.accuracy)}% accuracy`
            : `HSK ${currentLevel}`}
        </Text>
      </View>

      {/* Compact profile row */}
      <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.vermilion }]}>{userInitials}</Text>
        </View>
        <View style={styles.profileDetails}>
          <Text style={[styles.userEmail, { color: colors.text }]}>{userEmail}</Text>
          <Text style={[styles.userRole, { color: colors.textMuted }]}>Independent Learner</Text>
        </View>
      </View>

      {settings ? (
        /* Grouped Settings Panel */
        <View
          style={[
            styles.groupedPanel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Section 1: Study Targets */}
          <View style={styles.panelSection}>
            <Text style={[styles.sectionTitle, { color: colors.vermilion }]}>STUDY TARGETS</Text>
            <OptionRow
              label="Current level"
              value={String(settings.current_level) as (typeof LEVELS)[number]}
              options={LEVELS}
              onChange={(level) => save({ current_level: Number(level) })}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <OptionRow
              label="Support language"
              value={settings.support_language}
              options={SUPPORT_LANGUAGES}
              onChange={(support_language) => save({ support_language })}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <NumberRow
              label="New cards per day"
              value={settings.new_cards_per_day}
              min={0}
              max={100}
              step={5}
              onChange={(new_cards_per_day) => save({ new_cards_per_day })}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <NumberRow
              label="Review limit per day"
              value={settings.review_limit_per_day}
              min={10}
              max={999}
              step={10}
              onChange={(review_limit_per_day) => save({ review_limit_per_day })}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <NumberRow
              label="Session size"
              value={settings.session_size}
              min={5}
              max={200}
              step={5}
              onChange={(session_size) => save({ session_size })}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.examDateRow}>
              <View style={styles.examDateCopy}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Exam date</Text>
                <Text style={[styles.rowHint, { color: colors.textMuted }]}>YYYY-MM-DD</Text>
              </View>
              <TextInput
                accessibilityLabel="Exam date"
                value={draftExamDate}
                onChangeText={(value) => {
                  setDraftExamDate(value);
                  setExamDateError('');
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                editable={!saving}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={[styles.examDateInput, { color: colors.text, borderColor: colors.border }]}
              />
              {examDateError ? (
                <Text style={[styles.examDateError, { color: colors.vermilion }]}>{examDateError}</Text>
              ) : null}
              <Button
                label="Save exam date"
                variant="outline"
                onPress={() => {
                  const value = draftExamDate.trim();
                  if (value && !isValidExamDate(value)) {
                    setExamDateError('Usa una fecha real con formato YYYY-MM-DD');
                    return;
                  }
                  void save({ exam_date: value || null });
                }}
                disabled={saving}
              />
            </View>
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

          {/* Section 2: Algorithm */}
          <View style={styles.panelSection}>
            <Text style={[styles.sectionTitle, { color: colors.vermilion }]}>DECK ALGORITHM</Text>
            <OptionRow
              label="Target retention"
              value={
                RETENTION_OPTIONS.find((option) => option.value === settings.request_retention)?.label
                  ?? RETENTION_OPTIONS[1].label
              }
              options={RETENTION_OPTIONS.map((option) => option.label)}
              onChange={(label) => {
                const option = RETENTION_OPTIONS.find((entry) => entry.label === label);
                if (option) void save({ request_retention: option.value });
              }}
              disabled={saving}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <OptionRow
              label="Card order"
              value={settings.card_order}
              options={ORDERS}
              onChange={(card_order) => save({ card_order })}
              disabled={saving}
            />
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

          {/* Section 3: Appearance */}
          <View style={styles.panelSection}>
            <Text style={[styles.sectionTitle, { color: colors.vermilion }]}>APPEARANCE</Text>
            <OptionRow
              label="Theme"
              value={settings.theme}
              options={THEMES}
              onChange={(theme) => save({ theme })}
              disabled={saving}
            />
          </View>
        </View>
      ) : null}

      {leeches.length > 0 ? (
        <View
          style={[
            styles.groupedPanel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.panelSection}>
            <Text style={[styles.sectionTitle, { color: colors.vermilion }]}>NEEDS ATTENTION</Text>
            <Text style={[styles.leechBody, { color: colors.textMuted }]}>These cards were difficult repeatedly.</Text>
            {leeches.map((state) => (
              <View key={state.id} style={styles.leechRow}>
                <Text style={[styles.leechLabel, { color: colors.text }]}>
                  {state.word?.hanzi ?? `Word ${state.target_id}`} · {state.lapses} lapses
                </Text>
                <Button label="Reactivate" variant="outline" onPress={() => void reactivate(state)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xs,
  },
  heading: {
    fontSize: tokens.fontSize.xl,
    fontWeight: '700',
  },
  sealBadge: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '800',
  },
  hero: {
    borderRadius: tokens.radius.xl,
    paddingVertical: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.xl,
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.md,
  },
  heroMetric: {
    fontSize: tokens.fontSize.hanzi,
    fontWeight: '700',
  },
  heroLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.xs,
  },
  heroMuted: {
    fontSize: tokens.fontSize.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: tokens.spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  profileDetails: {
    flex: 1,
    gap: 2,
  },
  examDateRow: {
    gap: tokens.spacing.sm,
  },
  examDateCopy: {
    gap: 2,
  },
  rowLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  rowHint: {
    fontSize: tokens.fontSize.xs,
  },
  examDateInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    fontSize: tokens.fontSize.sm,
  },
  examDateError: {
    fontSize: tokens.fontSize.xs,
  },
  userEmail: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  userRole: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '500',
  },
  groupedPanel: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  panelSection: {
    gap: tokens.spacing.sm,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.xs,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
  },
  actionRow: {
    marginTop: tokens.spacing.md,
  },
  leechBody: { fontSize: tokens.fontSize.sm },
  leechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  leechLabel: { flex: 1, fontSize: tokens.fontSize.sm },
});
