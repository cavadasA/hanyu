import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

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

  return (
    <View style={[styles.track, { backgroundColor: colors.surface }]}>
      {options.map((option) => {
        const active = option.value === value;

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
              active
                ? { backgroundColor: colors.bg, borderColor: colors.border }
                : { backgroundColor: 'transparent', borderColor: 'transparent' },
              pressed && !active ? { opacity: 0.7 } : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.vermilion : colors.textMuted },
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
    flexDirection: 'row',
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.xs,
    gap: tokens.spacing.xs,
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
  },
  label: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
});
