import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadingQuestion, ReadingResult } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  questions: ReadingQuestion[];
  answers: Record<string, string>;
  disabled: boolean;
  result: ReadingResult | null;
  onAnswer(questionId: string, optionId: string): void;
}

export function ReadingQuestions({ questions, answers, disabled, result, onAnswer }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {questions.map(question => (
        <View key={question.id} style={styles.question}>
          <Text style={[styles.prompt, { color: colors.text }]}>{question.prompt}</Text>
          {question.options.map(option => {
            const selected = answers[question.id] === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={option.text}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onAnswer(question.id, option.id)}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.vermilion : colors.border,
                    backgroundColor: selected ? colors.surface : colors.bg,
                  },
                ]}
              >
                <Text style={{ color: colors.text }}>{option.text}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      {result ? (
        <Text style={[styles.score, { color: colors.text }]}>
          Score {result.score}/{result.total}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing.lg,
  },
  question: {
    gap: tokens.spacing.sm,
  },
  prompt: {
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  option: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  score: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
});
