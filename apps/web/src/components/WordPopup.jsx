import { useState } from 'react';
import { api } from '../services/api';

export default function WordPopup({ token, position, onClose }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  const word = token?.word || null;
  const label = token?.text || '';

  if (!token) {
    return null;
  }

  async function handleAdd() {
    if (!word) {
      return;
    }

    setAdding(true);
    setError('');

    try {
      await api.addCard(word.id);
      setAdded(true);
    } catch (err) {
      if (err.status === 409 || err.message?.includes('already') || err.message?.includes('Conflict')) {
        setAdded(true);
      } else {
        setError('Failed to add card. Try again.');
      }
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
      <p className="text-3xl font-bold">{label}</p>
      {word ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-[var(--color-text-muted)]">{word.pinyin}</p>
          <p className="text-sm">{word.meaning_es || word.meaning_en}</p>
          <p className="text-xs text-[var(--color-text-muted)]">HSK {word.hsk_level}</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || added || word.in_srs}
            className="mt-2 rounded-lg bg-[var(--color-gold)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {word.in_srs || added ? 'Already in SRS' : '+ Add to SRS'}
          </button>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Not found in the local dictionary.</p>
      )}
    </div>
  );
}