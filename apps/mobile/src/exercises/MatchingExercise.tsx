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
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const matches = value.kind === 'matching' ? value.pairs : {};

  // Reverse lookup: right string -> left string
  const rightToLeft = useMemo(() => {
    const reverse: Record<string, string> = {};
    for (const [left, right] of Object.entries(matches)) {
      reverse[right] = left;
    }
    return reverse;
  }, [matches]);

  // La columna derecha se baraja de forma determinista a partir del propio
  // contenido para que el orden no cambie entre renderizados y ningún
  // significado quede en la posición original cuando las etiquetas son distintas.
  const rightColumn = useMemo(() => {
    const rights = prompt.pairs.map((pair) => pair.right);
    if (rights.length < 2) {
      return rights;
    }

    const offset = (hashString(rights.join('\u0000')) >>> 0) % (rights.length - 1) + 1;
    return rights.map((_, index) => rights[(index + offset) % rights.length]);
  }, [prompt.pairs]);

  const pairUp = (left: string, right: string) => {
    const nextPairs: Record<string, string> = {};
    for (const [k, v] of Object.entries(matches)) {
      if (k !== left && v !== right) {
        nextPairs[k] = v;
      }
    }
    nextPairs[left] = right;
    onChange({ kind: 'matching', pairs: nextPairs });
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const handlePressLeft = (left: string) => {
    if (disabled) return;

    if (selectedRight) {
      pairUp(left, selectedRight);
      return;
    }

    if (selectedLeft === left) {
      setSelectedLeft(null);
      return;
    }

    if (matches[left]) {
      const nextPairs = { ...matches };
      delete nextPairs[left];
      onChange({ kind: 'matching', pairs: nextPairs });
      setSelectedLeft(null);
      setSelectedRight(null);
      return;
    }

    setSelectedLeft(left);
    setSelectedRight(null);
  };

  const handlePressRight = (right: string) => {
    if (disabled) return;

    if (selectedLeft) {
      pairUp(selectedLeft, right);
      return;
    }

    if (selectedRight === right) {
      setSelectedRight(null);
      return;
    }

    const matchedLeft = rightToLeft[right];
    if (matchedLeft) {
      const nextPairs = { ...matches };
      delete nextPairs[matchedLeft];
      onChange({ kind: 'matching', pairs: nextPairs });
      setSelectedLeft(null);
      setSelectedRight(null);
      return;
    }

    setSelectedRight(right);
    setSelectedLeft(null);
  };

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.textMuted }}>Elige una palabra en chino y luego su significado</Text>
      <View style={styles.columns}>
        <View style={styles.column}>
          {prompt.pairs.map((pair) => {
            const isSelected = selectedLeft === pair.left;
            const isMatched = Boolean(matches[pair.left]);
            const border = isSelected
              ? colors.vermilion
              : isMatched
                ? colors.success
                : colors.border;
            const borderWidth = isSelected || isMatched ? 2 : 1;

            return (
              <Pressable
                key={pair.left}
                accessibilityRole="button"
                accessibilityLabel={`Elegir ${pair.left}`}
                accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
                disabled={disabled}
                onPress={() => handlePressLeft(pair.left)}
                style={[
                  styles.item,
                  {
                    borderColor: border,
                    borderWidth,
                    backgroundColor: colors.surface,
                    opacity: disabled ? 0.6 : 1,
                  },
                ]}
              >
                <View style={styles.itemContent}>
                  <Text style={[styles.itemText, { color: colors.text }]}>{pair.left}</Text>
                  {isMatched ? (
                    <Text style={[styles.badge, { color: colors.success }]}>✓</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.column}>
          {rightColumn.map((right) => {
            const isSelected = selectedRight === right;
            const isMatched = Boolean(rightToLeft[right]);
            const border = isSelected
              ? colors.vermilion
              : isMatched
                ? colors.success
                : colors.border;
            const borderWidth = isSelected || isMatched ? 2 : 1;

            return (
              <Pressable
                key={right}
                accessibilityRole="button"
                accessibilityLabel={`Match ${right}`}
                accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
                disabled={disabled}
                onPress={() => handlePressRight(right)}
                style={[
                  styles.item,
                  {
                    borderColor: border,
                    borderWidth,
                    backgroundColor: colors.surface,
                    opacity: disabled ? 0.6 : 1,
                  },
                ]}
              >
                <View style={styles.itemContent}>
                  <Text style={[styles.itemText, { color: colors.text }]}>{right}</Text>
                  {isMatched ? (
                    <Text style={[styles.badge, { color: colors.success }]}>✓</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
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
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    justifyContent: 'center',
    minHeight: 48,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.xs,
  },
  itemText: {
    fontSize: tokens.fontSize.md,
    flexShrink: 1,
  },
  badge: {
    fontSize: tokens.fontSize.md,
    fontWeight: 'bold',
  },
});

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}
