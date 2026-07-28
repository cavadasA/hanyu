import { useState } from 'react';
import AudioButton from './AudioButton';

export default function ExerciseRenderer({ exercise, onAnswer, result }) {
  switch (exercise.type) {
    case 'fill_blank':
      return <FillBlank exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'multiple_choice':
      return <MultipleChoice exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'reorder':
      return <Reorder exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'dictation':
      return <Dictation exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'matching':
      return <Matching exercise={exercise} onAnswer={onAnswer} result={result} />;
    default:
      return <p>Unsupported exercise type.</p>;
  }
}

function FillBlank({ exercise, onAnswer, result }) {
  const parts = exercise.sentence.split('___');
  return (
    <section className="space-y-4">
      <p className="text-xl font-semibold">
        <span>{parts[0]}</span>
        <span className="mx-2 inline-flex rounded-lg border border-dashed border-[var(--color-border)] px-6 py-1 text-sm text-[var(--color-text-muted)]">
          blank
        </span>
        <span>{parts[1]}</span>
      </p>
      <OptionButtons options={exercise.options} onAnswer={onAnswer} result={result} correct={exercise.correct} />
      <ResultBlock result={result} />
    </section>
  );
}

function MultipleChoice({ exercise, onAnswer, result }) {
  return (
    <section className="space-y-4">
      <p className="text-xl font-semibold">{exercise.question}</p>
      <OptionButtons options={exercise.options} onAnswer={onAnswer} result={result} correct={exercise.correct} />
      <ResultBlock result={result} />
    </section>
  );
}

function Reorder({ exercise, onAnswer, result }) {
  const [selected, setSelected] = useState([]);
  const remaining = exercise.words.filter((word, index) => !selected.some((item) => item.index === index));

  return (
    <section className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">Arrange the sentence to match: {exercise.translation}</p>
      <div className="flex min-h-16 flex-wrap gap-2 rounded-xl border border-dashed border-[var(--color-border)] p-4">
        {selected.map((item, index) => (
          <button
            key={`${item.word}-${item.index}-${index}`}
            type="button"
            onClick={() => setSelected((current) => current.filter((_, currentIndex) => currentIndex !== index))}
            className="rounded-lg bg-[var(--color-vermilion)] px-3 py-2 text-white"
          >
            {item.word}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {exercise.words.map((word, index) => {
          const disabled = selected.some((item) => item.index === index);
          return (
            <button
              key={`${word}-${index}`}
              type="button"
              onClick={() => !disabled && setSelected((current) => [...current, { word, index }])}
              disabled={disabled}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:opacity-40"
            >
              {word}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onAnswer(selected.map((item) => item.word))}
        className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
      >
        Check answer
      </button>
      <ResultBlock result={result} />
    </section>
  );
}

function Dictation({ exercise, onAnswer, result }) {
  const [input, setInput] = useState('');

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <AudioButton text={exercise.audio_text} />
        <p className="text-sm text-[var(--color-text-muted)]">Listen and type what you hear.</p>
      </div>
      <input
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={exercise.accept_pinyin ? 'Type hanzi or pinyin' : 'Type the hanzi'}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
      />
      <button
        type="button"
        onClick={() => onAnswer(input)}
        className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
      >
        Check answer
      </button>
      <ResultBlock result={result} />
    </section>
  );
}

function Matching({ exercise, onAnswer, result }) {
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [pairs, setPairs] = useState([]);

  const rightOptions = exercise.pairs.map((pair) => pair.right);

  function togglePair(right) {
    if (!selectedLeft) {
      return;
    }

    setPairs((current) => {
      const next = current.filter((pair) => pair.left !== selectedLeft && pair.right !== right);
      return [...next, { left: selectedLeft, right }];
    });
    setSelectedLeft(null);
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {exercise.pairs.map((pair) => (
            <button
              key={pair.left}
              type="button"
              onClick={() => setSelectedLeft(pair.left)}
              className={`block w-full rounded-lg px-3 py-2 text-left ${
                selectedLeft === pair.left ? 'bg-[var(--color-vermilion)] text-white' : 'border border-[var(--color-border)]'
              }`}
            >
              {pair.left}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rightOptions.map((right) => (
            <button
              key={right}
              type="button"
              onClick={() => togglePair(right)}
              className="block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left"
            >
              {right}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAnswer(pairs)}
        className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
      >
        Check answer
      </button>
      <ResultBlock result={result} />
    </section>
  );
}

function OptionButtons({ options, onAnswer, result, correct }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const isChosen = selected === option;
        const isCorrect = result && correct === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              setSelected(option);
              onAnswer(option);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              isCorrect
                ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                : isChosen
                  ? 'border-[var(--color-vermilion)] bg-[var(--color-bg)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function ResultBlock({ result }) {
  if (!result) {
    return null;
  }

  return (
    <div className={`rounded-xl px-4 py-3 text-sm ${result.correct ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
      {result.correct ? 'Correct!' : `Correct answer: ${result.correct_answer}`}
    </div>
  );
}