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
  testID?: string;
}

/**
 * Segmented progress bar component that renders clean, horizontal progress pills.
 */
export function ProgressRing({
  segments = 3,
  completed = 0,
  children,
  testID = 'progress-ring',
}: ProgressRingProps) {
  const { colors } = useTheme();
  const numSegments = Math.max(1, segments);

  return (
    <View style={styles.container} testID={testID}>
      {children ? <View style={styles.topContent}>{children}</View> : null}

      <View style={styles.segmentsRow}>
        {Array.from({ length: numSegments }).map((_, i) => {
          const isCompleted = i < completed;
          const strokeColor = isCompleted
            ? colors.vermilion
            : colors.border;

          return (
            <View
              key={i}
              testID={`progress-segment-${i}`}
              stroke={strokeColor}
              style={[
                styles.segmentBar,
                {
                  backgroundColor: strokeColor,
                },
              ]}
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
