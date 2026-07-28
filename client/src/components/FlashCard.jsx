import { useState } from 'react';
import AudioButton from './AudioButton';

const RATINGS = [
  { label: 'Again', value: 0, color: 'bg-red-500' },
  { label: 'Hard', value: 3, color: 'bg-amber-500' },
  { label: 'Good', value: 4, color: 'bg-emerald-500' },
  { label: 'Easy', value: 5, color: 'bg-blue-500' },
];

export default function FlashCard({ card, onRate }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
          HSK {card.hsk_level}
        </span>
        <AudioButton text={card.hanzi} />
      </div>

      <div className="min-h-[180px] text-center">
        <p className="mb-3 text-5xl font-bold tracking-wide">{card.hanzi}</p>

        {revealed ? (
          <div className="space-y-3">
            <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
            <p className="text-lg">{card.meaning_en}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Think of the pronunciation and meaning before revealing.</p>
        )}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-6 w-full rounded-xl bg-[var(--color-vermilion)] px-4 py-3 font-semibold text-white"
        >
          Show Answer
        </button>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {RATINGS.map((rating) => (
            <button
              key={rating.label}
              type="button"
              onClick={() => {
                onRate(rating.value);
                setRevealed(false);
              }}
              className={`${rating.color} rounded-xl px-4 py-3 font-semibold text-white`}
            >
              {rating.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}