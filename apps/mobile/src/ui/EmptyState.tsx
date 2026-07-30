import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function EmptyState({ title, body, actionLabel, onAction, actionDisabled }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} disabled={actionDisabled} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    alignItems: 'center',
  },
  title: { fontSize: tokens.fontSize.lg, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
});
