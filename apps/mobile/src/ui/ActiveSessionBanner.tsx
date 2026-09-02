import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { ReviewSessionSnapshot } from '../lib/reviewSessionStore';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Card } from './Card';

interface ActiveSessionBannerProps {
  snapshot: ReviewSessionSnapshot | null;
  onContinue: () => void;
  onDiscard: () => void;
}

export function ActiveSessionBanner({ snapshot, onContinue, onDiscard }: ActiveSessionBannerProps) {
  const { colors } = useTheme();

  if (!snapshot) {
    return null;
  }

  const remaining = Math.max(0, snapshot.card_ids.length - snapshot.reviewed);
  if (remaining <= 0) {
    return null;
  }

  return (
    <Card style={[styles.bannerCard, { backgroundColor: colors.vermilion + '12', borderColor: colors.vermilion + '33' }]}>
      <View style={styles.content}>
        <View style={styles.left}>
          <Ionicons name="play-circle" size={24} color={colors.vermilion} />
          <View style={styles.textGroup}>
            <Text style={[styles.title, { color: colors.text }]}>Continue review</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {`${remaining} ${remaining === 1 ? 'card' : 'cards'} left in session`}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button label="Continue" variant="primary" onPress={onContinue} />
          <Button label="Discard" variant="outline" onPress={onDiscard} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bannerCard: {
    padding: tokens.spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  actions: {
    gap: tokens.spacing.xs,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    flex: 1,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  sub: {
    fontSize: tokens.fontSize.xs,
  },
});
