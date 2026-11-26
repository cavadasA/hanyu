import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface NumberRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void | Promise<void>;
  disabled?: boolean;
}

export function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: NumberRowProps) {
  const { colors } = useTheme();
  const lower = label.toLowerCase();
  const decreaseDisabled = disabled || value - step < min;
  const increaseDisabled = disabled || value + step > max;

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{`${label}: ${value}`}</Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bajar ${lower}`}
          disabled={decreaseDisabled}
          onPress={() => onChange(value - step)}
          style={[
            styles.control,
            { borderColor: colors.border, opacity: decreaseDisabled ? 0.4 : 1 },
          ]}
        >
          <Text style={[styles.controlLabel, { color: colors.text }]}>-</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Subir ${lower}`}
          disabled={increaseDisabled}
          onPress={() => onChange(value + step)}
          style={[
            styles.control,
            { borderColor: colors.border, opacity: increaseDisabled ? 0.4 : 1 },
          ]}
        >
          <Text style={[styles.controlLabel, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: tokens.spacing.sm },
  control: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
});
