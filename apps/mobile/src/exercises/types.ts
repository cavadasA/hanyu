import type { ExerciseAnswer, ExercisePrompt } from '@hanyu/data';

export interface ExerciseRendererProps<TPrompt extends ExercisePrompt = ExercisePrompt> {
  prompt: TPrompt;
  value: ExerciseAnswer;
  disabled: boolean;
  allowHints?: boolean;
  onChange(value: ExerciseAnswer): void;
}
