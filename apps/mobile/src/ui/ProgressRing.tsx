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
  strokeWidth = 8,
  children,
  testID = 'progress-ring',
}: ProgressRingProps) {
  const { colors } = useTheme();

  const numSegments = Math.max(1, segments);
  const center = size / 2;
  const radius = (size - strokeWidth - 12) / 2;

  // Segment pill length along the circumference
  const circumference = 2 * Math.PI * radius;
  const pillLength = Math.max(28, (circumference / numSegments) - 16);
  const pillThickness = strokeWidth;

  return (
    <View style={[styles.container, { width: size, height: size }]} testID={testID}>
      {/* Subtle circular background track */}
      <View
        style={[
          styles.trackCircle,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: colors.border,
          },
        ]}
      />

      {/* Tangent segment pills along the perimeter */}
      {Array.from({ length: numSegments }).map((_, i) => {
        const isCompleted = i < completed;
        const strokeColor = isCompleted
          ? colors.vermilion
          : colors.border;

        // Angle for segment i (starting from top at -90 degrees)
        const angleDeg = (360 / numSegments) * i - 90;
        const angleRad = (angleDeg * Math.PI) / 180;

        // Center coordinates of the pill on the circle perimeter
        const cx = center + radius * Math.cos(angleRad);
        const cy = center + radius * Math.sin(angleRad);

        // Tangent rotation angle
        const tangentAngle = angleDeg + 90;

        return (
          <View
            key={i}
            testID={`progress-segment-${i}`}
            stroke={strokeColor}
            style={[
              styles.segmentPill,
              {
                width: pillLength,
                height: pillThickness,
                backgroundColor: strokeColor,
                borderRadius: pillThickness / 2,
                left: cx - pillLength / 2,
                top: cy - pillThickness / 2,
                transform: [{ rotate: `${tangentAngle}deg` }],
              },
            ]}
          />
        );
      })}

      {/* Center content (streak count, icon, etc.) */}
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
  trackCircle: {
    position: 'absolute',
    opacity: 0.5,
  },
  segmentPill: {
    position: 'absolute',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
