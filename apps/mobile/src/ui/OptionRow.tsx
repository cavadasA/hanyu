import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface OptionRowProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void | Promise<void>;
  disabled?: boolean;
}

export function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: OptionRowProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((option) => (
          <View key={option} style={styles.option}>
            <Button
              label={option}
              variant={option === value ? 'primary' : 'secondary'}
              selected={option === value}
              onPress={() => onChange(option)}
              disabled={disabled}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: tokens.spacing.sm },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  option: { flexGrow: 1, flexBasis: '30%' },
});
