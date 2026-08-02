import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface ProgressRingProps {
  segments?: number;
  completed?: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
  /** Fill color for completed segments. Defaults to the vermilion accent. */
  fillColor?: string;
  /** Track color for incomplete segments. Defaults to the neutral border. */
  trackColor?: string;
  testID?: string;
}

/**
 * Segmented progress bar component that renders clean, horizontal progress pills.
 * Colors are overridable so it can sit on the vermilion streak hero (pass
 * onAccent-derived colors) as well as on neutral surfaces (the defaults).
 */
export function ProgressRing({
  segments = 3,
  completed = 0,
  children,
  fillColor,
  trackColor,
  testID = 'progress-ring',
}: ProgressRingProps) {
  const { colors } = useTheme();
  const numSegments = Math.max(1, segments);
  const fill = fillColor ?? colors.vermilion;
  const track = trackColor ?? colors.border;

  return (
    <View style={styles.container} testID={testID}>
      {children ? <View style={styles.topContent}>{children}</View> : null}

      <View style={styles.segmentsRow}>
        {Array.from({ length: numSegments }).map((_, i) => {
          const isCompleted = i < completed;
          const strokeColor = isCompleted ? fill : track;

          return (
            <View
              key={i}
              testID={`progress-segment-${i}`}
              // @ts-expect-error `stroke` is not a View prop; it is a test hook
              // that ProgressRing.test reads to assert each segment's color.
              stroke={strokeColor}
              style={[styles.segmentBar, { backgroundColor: strokeColor }]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: tokens.spacing.md,
  },
  topContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    width: '100%',
  },
  segmentBar: {
    flex: 1,
    height: 8,
    borderRadius: tokens.radius.pill,
  },
});
