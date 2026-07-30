import { useEffect, useState } from 'react';
import ExerciseRenderer from '../components/ExerciseRenderer';
import { useExercise } from '../hooks/useExercise';

const TYPES = [
  { value: 'fill_blank', label: 'Fill in the Blank' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'reorder', label: 'Reorder Sentence' },
  { value: 'dictation', label: 'Dictation' },
  { value: 'matching', label: 'Matching' },
];

export default function Exercises() {
  const [level, setLevel] = useState(1);
  const [type, setType] = useState('fill_blank');
  const { exercise, result, loading, error, generate, check } = useExercise();

  useEffect(() => {
    generate(type, level).catch(() => {});
  }, [generate, level, type]);

  async function handleAnswer(answer) {
    if (!exercise?.id) {
      return;
    }

    try {
      await check(exercise.id, answer);
    } catch {
      // error state already captured in hook
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Exercises Workspace</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Dynamic drills backed by cached content or AI generation.</p>
        </div>
        <button
          type="button"
          onClick={() => generate(type, level).catch(() => {})}
          className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
        >
          New exercise
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          {TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              HSK {value}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p>Loading exercise...</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p> : null}
      {exercise ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <ExerciseRenderer exercise={exercise} onAnswer={handleAnswer} result={result} />
        </div>
      ) : null}
    </div>
  );
}