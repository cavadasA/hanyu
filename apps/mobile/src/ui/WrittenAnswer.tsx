import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { gradeWrittenAnswer, type Grade, type GradeReason } from '@hanyu/domain';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

export interface WrittenGrade {
  grade: Grade;
  correct: boolean;
  reason: GradeReason;
}

interface Props {
  expected: string;
  kind: 'hanzi' | 'pinyin' | 'text';
  onGraded(result: WrittenGrade): void;
}

export function WrittenAnswer({ expected, kind, onGraded }: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<WrittenGrade | null>(null);
  const [hints, setHints] = useState(0);
  const startedAt = useRef(Date.now());

  function check() {
    const graded = gradeWrittenAnswer({
      expected,
      submitted: value,
      kind,
      elapsed_ms: Date.now() - startedAt.current,
      hints,
    });

    setResult(graded);
    onGraded(graded);
  }

  // Teclear mal algo que sí se sabe no debe costar un intervalo entero. Se
  // concede `hard` y no `good`: haber necesitado la corrección es en sí una
  // señal de que la recuperación no fue limpia.
  function overrideAsKnown() {
    const corrected: WrittenGrade = { grade: 'hard', correct: true, reason: 'hint' };
    setResult(corrected);
    onGraded(corrected);
  }

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Type the answer"
        placeholderTextColor={colors.textMuted}
        value={value}
        editable={result === null}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setValue}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />

      {result === null ? (
        <View style={styles.actions}>
          <Button
            label="Show a hint"
            variant="outline"
            onPress={() => {
              setHints((count) => count + 1);
              setValue([...expected][0] ?? '');
            }}
          />
          <Button label="Check" onPress={check} disabled={value.trim().length === 0} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text
            style={[
              styles.verdict,
              { color: result.correct ? colors.success : colors.vermilion },
            ]}
          >
            {result.correct ? 'Correct' : expected}
          </Text>
          {result.correct ? null : (
            <Button label="I actually knew it" variant="outline" onPress={overrideAsKnown} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm, width: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    fontSize: tokens.fontSize.lg,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  verdict: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
});
