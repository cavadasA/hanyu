import { useState } from 'react';
import AudioButton from './AudioButton';

const RATINGS = [
  { label: 'Again', value: 0, color: 'bg-red-500' },
  { label: 'Hard', value: 3, color: 'bg-amber-500' },
  { label: 'Good', value: 4, color: 'bg-emerald-500' },
  { label: 'Easy', value: 5, color: 'bg-blue-500' },
];

export default function FlashCard({ card, onRate, mode = 'recognition' }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
          HSK {card.hsk_level}
        </span>
        {mode !== 'listening' ? <AudioButton text={card.hanzi} /> : null}
      </div>

      <div className="min-h-[180px] text-center">
        <CardFront card={card} mode={mode} revealed={revealed} />

        {revealed ? <CardBack card={card} mode={mode} /> : null}

        {!revealed ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {mode === 'recall' ? 'Think of the characters and pronunciation.' : null}
            {mode === 'listening' ? 'Listen and identify the word.' : null}
            {mode === 'recognition' ? 'Think of the pronunciation and meaning before revealing.' : null}
          </p>
        ) : null}
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

function CardFront({ card, mode, revealed }) {
  if (revealed) {
    return null;
  }

  switch (mode) {
    case 'recall':
      return <p className="mb-3 text-3xl font-bold">{card.meaning_en}</p>;
    case 'listening':
      return (
        <div className="mb-3 space-y-3">
          <p className="text-5xl">🔊</p>
          <AudioButton text={card.hanzi} className="mx-auto" />
        </div>
      );
    default:
      return <p className="mb-3 text-5xl font-bold tracking-wide">{card.hanzi}</p>;
  }
}

function CardBack({ card, mode }) {
  switch (mode) {
    case 'recall':
      return (
        <div className="space-y-3">
          <p className="text-5xl font-bold tracking-wide">{card.hanzi}</p>
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
        </div>
      );
    case 'listening':
      return (
        <div className="space-y-3">
          <p className="text-5xl font-bold tracking-wide">{card.hanzi}</p>
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
          <p className="text-lg">{card.meaning_en}</p>
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
          <p className="text-lg">{card.meaning_en}</p>
        </div>
      );
  }
}