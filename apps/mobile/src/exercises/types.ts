import type { ExercisePrompt } from '@hanyu/data';

export interface ExerciseRendererProps<TPrompt extends ExercisePrompt = ExercisePrompt> {
  prompt: TPrompt;
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void;
}
