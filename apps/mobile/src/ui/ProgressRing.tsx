import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ProgressRingProps {
  segments?: number;
  completed?: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
  testID?: string;
}

export function ProgressRing({
  segments = 3,
  completed = 0,
  size = 140,
  strokeWidth = 12,
  children,
  testID = 'progress-ring',
}: ProgressRingProps) {
  const { colors } = useTheme();

  const numSegments = Math.max(1, segments);
  const radius = (size - strokeWidth) / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]} testID={testID}>
      {Array.from({ length: numSegments }).map((_, i) => {
        const isCompleted = i < completed;
        const strokeColor = isCompleted
          ? colors.vermilion
          : colors.vermilion + '33';

        // Calculate rotation angle for each segment pill around the circle
        const angle = (360 / numSegments) * i - 90;
        // Arc segment pill size
        const pillWidth = strokeWidth;
        const pillHeight = Math.max(16, (2 * Math.PI * radius) / numSegments - 10);

        return (
          <View
            key={i}
            testID={`progress-segment-${i}`}
            // Expose stroke prop for testing assertions
            stroke={strokeColor}
            style={[
              styles.segment,
              {
                width: pillWidth,
                height: pillHeight,
                backgroundColor: strokeColor,
                borderRadius: pillWidth / 2,
                transform: [
                  { rotate: `${angle}deg` },
                  { translateY: -radius },
                ],
              },
            ]}
          />
        );
      })}
      {children ? <View style={styles.centerContent}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    position: 'absolute',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
