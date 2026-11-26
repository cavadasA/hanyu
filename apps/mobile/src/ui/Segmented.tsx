import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

const MOTION_DISABLED = process.env.NODE_ENV === 'test';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [trackHeight, setTrackHeight] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const animIndex = useRef(new Animated.Value(selectedIndex)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (MOTION_DISABLED) return;

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotion.current = enabled;
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (MOTION_DISABLED || reduceMotion.current) {
      animIndex.setValue(selectedIndex);
      return;
    }

    const anim = Animated.spring(animIndex, {
      toValue: selectedIndex,
      damping: 24,
      stiffness: 280,
      mass: 0.8,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [selectedIndex, animIndex]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && width !== trackWidth) {
      setTrackWidth(width);
    }
    if (height > 0 && height !== trackHeight) {
      setTrackHeight(height);
    }
  };

  const numOptions = Math.max(1, options.length);
  const padding = tokens.spacing.xs;
  const availableWidth = Math.max(0, trackWidth - padding * 2);
  const segmentWidth = trackWidth > 0 ? availableWidth / numOptions : 0;
  const segmentHeight = trackHeight > 0 ? trackHeight - padding * 2 : 40;

  const translateX = animIndex.interpolate({
    inputRange: numOptions > 1 ? [0, numOptions - 1] : [0, 1],
    outputRange: numOptions > 1 ? [0, (numOptions - 1) * segmentWidth] : [0, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.track, { backgroundColor: colors.surface }]}
      onLayout={handleLayout}
      testID="segmented-track"
    >
      {trackWidth > 0 ? (
        <Animated.View
          testID="segmented-indicator"
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              height: segmentHeight,
              backgroundColor: colors.bg,
              borderColor: colors.border,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const active = option.value === value;
        const isStaticActive = active && trackWidth === 0;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              isStaticActive
                ? { backgroundColor: colors.bg, borderColor: colors.border }
                : { backgroundColor: 'transparent', borderColor: 'transparent' },
              pressed && !active ? { opacity: 0.7 } : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? colors.vermilion : colors.textMuted,
                  fontWeight: active ? '700' : '600',
                },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    flexDirection: 'row',
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.xs,
  },
  indicator: {
    position: 'absolute',
    top: tokens.spacing.xs,
    left: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    zIndex: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.08,
        shadowRadius: 2.5,
      },
      android: {
        elevation: 1.5,
      },
      default: {},
    }),
  },
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    zIndex: 1,
  },
  label: {
    fontSize: tokens.fontSize.sm,
  },
});
