import { useEffect, useRef, useState } from 'react';
import FlashCard from '../components/FlashCard';
import { api } from '../services/api';

const MODES = [
  { value: 'recognition', label: 'Recognition' },
  { value: 'recall', label: 'Recall' },
  { value: 'listening', label: 'Listening' },
];

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [mode, setMode] = useState('recognition');
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());

  useEffect(() => {
    async function loadCards() {
      setLoading(true);

      try {
        const data = await api.getDueCards();
        setCards(data.cards || []);
        setCurrentIndex(0);
        setReviewed(0);
        setSessionDone(false);
        sessionStartedAt.current = Date.now();
        cardStartedAt.current = Date.now();
      } catch (error) {
        console.error('Failed to load flashcards:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCards();
  }, []);

  async function handleRate(quality) {
    const card = cards[currentIndex];
    if (!card) {
      return;
    }

    const timeMs = Date.now() - cardStartedAt.current;

    try {
      const result = await api.reviewCard(card.id, quality, timeMs);
      setMessage(`Next review: ${result.next_review}`);
      setReviewed((count) => count + 1);

      if (currentIndex + 1 >= cards.length) {
        setSessionDone(true);
        await api.logTime(Date.now() - sessionStartedAt.current);
      } else {
        setCurrentIndex((index) => index + 1);
        cardStartedAt.current = Date.now();
      }
    } catch (error) {
      console.error('Failed to review card:', error);
    }
  }

  const currentCard = cards[currentIndex];

  if (sessionDone) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold">Session Complete!</h1>
        <p className="text-[var(--color-text-muted)]">You reviewed {reviewed} cards.</p>
        <button
          type="button"
          onClick={() => {
            setMessage('');
            void loadCards();
          }}
          className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
        >
          Review again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flashcards Session</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Review due cards with SM-2 spaced repetition.</p>
        </div>
        <div className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold">
          {Math.min(currentIndex + 1, Math.max(cards.length, 1))}/{Math.max(cards.length, 1)}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              mode === item.value
                ? 'bg-[var(--color-vermilion)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p>Loading flashcards...</p> : null}
      {message ? <p className="mb-4 text-sm text-[var(--color-text-muted)]">{message}</p> : null}

      {currentCard ? (
        <FlashCard card={currentCard} onRate={handleRate} mode={mode} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-text-muted)]">
          No flashcards due right now.
        </div>
      )}
    </div>
  );
}