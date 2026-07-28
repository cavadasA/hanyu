import { useEffect, useRef, useState } from 'react';
import FlashCard from '../components/FlashCard';
import { api } from '../services/api';

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const startedAt = useRef(Date.now());

  useEffect(() => {
    async function loadCards() {
      setLoading(true);

      try {
        const data = await api.getDueCards();
        setCards(data.cards || []);
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

    const timeMs = Date.now() - startedAt.current;

    try {
      const result = await api.reviewCard(card.id, quality, timeMs);
      await api.logTime(timeMs);
      setMessage(`Next review: ${result.next_review}`);
      setCurrentIndex((index) => index + 1);
      startedAt.current = Date.now();
    } catch (error) {
      console.error('Failed to review card:', error);
    }
  }

  const currentCard = cards[currentIndex];

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

      {loading ? <p>Loading flashcards...</p> : null}
      {message ? <p className="mb-4 text-sm text-[var(--color-text-muted)]">{message}</p> : null}

      {currentCard ? (
        <FlashCard card={currentCard} onRate={handleRate} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-text-muted)]">
          No flashcards due right now.
        </div>
      )}
    </div>
  );
}