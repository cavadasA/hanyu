import type { Exercise, ExerciseAnswer } from '@hanyu/data';
import { DictationExercise } from './DictationExercise';
import { FillBlankExercise } from './FillBlankExercise';
import { MatchingExercise } from './MatchingExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { ReorderExercise } from './ReorderExercise';

interface Props {
  exercise: Exercise;
  value: ExerciseAnswer;
  disabled: boolean;
  onChange(value: ExerciseAnswer): void;
}

export function ExerciseRenderer({ exercise, value, disabled, onChange }: Props) {
  const shared = { value, disabled, onChange };

  switch (exercise.prompt.kind) {
    case 'fill_blank':
      return <FillBlankExercise prompt={exercise.prompt} {...shared} />;
    case 'multiple_choice':
      return <MultipleChoiceExercise prompt={exercise.prompt} {...shared} />;
    case 'reorder':
      return <ReorderExercise prompt={exercise.prompt} {...shared} />;
    case 'dictation':
      return <DictationExercise prompt={exercise.prompt} {...shared} />;
    case 'matching':
      return <MatchingExercise prompt={exercise.prompt} {...shared} />;
    default: {
      const exhaustive: never = exercise.prompt;
      return exhaustive;
    }
  }
}
