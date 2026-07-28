import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function WordPopup({ character, position, onClose }) {
  const [word, setWord] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!character) {
      return;
    }

    let cancelled = false;

    api.getWords({ search: character, limit: 1 })
      .then((data) => {
        if (!cancelled && data.words.length > 0) {
          setWord(data.words[0]);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [character]);

  if (!character) {
    return null;
  }

  async function handleAdd() {
    if (!word) {
      return;
    }

    setAdding(true);
    try {
      await api.addCard(word.id);
      setAdded(true);
    } catch {
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="absolute z-50 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
      style={{ top: position.y + 30, left: position.x }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-1 text-sm text-[var(--color-text-muted)]"
      >
        ✕
      </button>
      <p className="text-3xl font-bold">{character}</p>
      {word ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-[var(--color-text-muted)]">{word.pinyin}</p>
          <p className="text-sm">{word.meaning_en}</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || added}
            className="mt-2 rounded-lg bg-[var(--color-gold)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {added ? 'Added ✓' : '+ Add to SRS'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Not found in dictionary.</p>
      )}
    </div>
  );
}