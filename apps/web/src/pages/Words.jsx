import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Words() {
  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    async function loadWords() {
      setLoading(true);

      try {
        const params = { page };
        if (search) {
          params.search = search;
        }
        if (level) {
          params.level = level;
        }

        const data = await api.getWords(params);
        setWords(data.words);
        setTotal(data.total);
      } catch (error) {
        console.error('Failed to load words:', error);
      } finally {
        setLoading(false);
      }
    }

    loadWords();
  }, [search, level, page]);

  async function handleAddToSrs(wordId) {
    setAddingId(wordId);

    try {
      await api.addCard(wordId);
    } catch (error) {
      console.error('Failed to add word to SRS:', error);
    } finally {
      setAddingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Word Explorer</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search hanzi, pinyin, or meaning"
          className="min-w-[240px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />

        <select
          value={level}
          onChange={(event) => {
            setLevel(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          <option value="">All HSK levels</option>
          <option value="1">HSK 1</option>
          <option value="2">HSK 2</option>
          <option value="3">HSK 3</option>
        </select>
      </div>

      <p className="mb-2 text-sm text-[var(--color-text-muted)]">
        {loading ? 'Loading words...' : `${total} words found`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Hanzi</th>
              <th className="px-4 py-3">Pinyin</th>
              <th className="px-4 py-3">Meaning</th>
              <th className="px-4 py-3">HSK</th>
              <th className="px-4 py-3">Part of speech</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-4 py-3 text-xl font-semibold">{word.hanzi}</td>
                <td className="px-4 py-3">{word.pinyin}</td>
                <td className="px-4 py-3">{word.meaning_en}</td>
                <td className="px-4 py-3">{word.hsk_level}</td>
                <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{word.pos || '-'}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleAddToSrs(word.id)}
                    disabled={addingId === word.id}
                    className="rounded-lg bg-[var(--color-vermilion)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {addingId === word.id ? 'Adding...' : 'Add to SRS'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}