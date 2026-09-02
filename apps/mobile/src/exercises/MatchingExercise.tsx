import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExercisePrompt } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { ExerciseRendererProps } from './types';

type Prompt = Extract<ExercisePrompt, { kind: 'matching' }>;

export function MatchingExercise({
  prompt,
  value,
  disabled,
  onChange,
}: ExerciseRendererProps<Prompt>) {
  const { colors } = useTheme();
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const matches = value.kind === 'matching' ? value.pairs : {};

  const selectRight = (right: string) => {
    if (!selectedLeft) {
      return;
    }
    onChange({ kind: 'matching', pairs: { ...matches, [selectedLeft]: right } });
    setSelectedLeft(null);
  };

  // La columna derecha se pintaba en el mismo orden que la izquierda, así que
  // el ejercicio se resolvía emparejando fila con fila sin leer nada. Se baraja
  // de forma determinista a partir del propio contenido —el orden no cambia
  // entre renderizados— y se garantiza que el resultado no coincida con el
  // original: un barajado que a veces devuelve la identidad deja el ejercicio
  // trivial justo esas veces, y además haría inestable el test.
  const rightColumn = useMemo(() => {
    const rights = prompt.pairs.map((pair) => pair.right);
    if (rights.length < 2) {
      return rights;
    }

    const shuffled = [...rights].sort((a, b) => hashString(a) - hashString(b));
    const unchanged = shuffled.every((right, index) => right === rights[index]);

    return unchanged ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  }, [prompt.pairs]);

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textMuted }}>Select a Chinese word, then its meaning</Text>
      <View style={styles.columns}>
        <View style={styles.column}>
          {prompt.pairs.map(pair => (
            <Pressable
              key={pair.left}
              accessibilityRole="button"
              accessibilityLabel={`Select ${pair.left}`}
              accessibilityState={{ selected: selectedLeft === pair.left, disabled }}
              disabled={disabled}
              onPress={() => setSelectedLeft(pair.left)}
              style={[styles.item, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text }}>{pair.left}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.column}>
          {rightColumn.map(right => (
            <Pressable
              key={right}
              accessibilityRole="button"
              accessibilityLabel={`Match ${right}`}
              accessibilityState={{ disabled: disabled || !selectedLeft }}
              disabled={disabled || !selectedLeft}
              onPress={() => selectRight(right)}
              style={[styles.item, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text }}>{right}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md },
  columns: { flexDirection: 'row', gap: tokens.spacing.md },
  column: { flex: 1, gap: tokens.spacing.sm },
  item: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
});

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}
