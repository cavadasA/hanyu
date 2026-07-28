import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function Grammar() {
  const [level, setLevel] = useState(1);
  const [points, setPoints] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const { showPinyin, togglePinyin } = useAppStore();

  useEffect(() => {
    async function loadGrammar() {
      setLoading(true);

      try {
        const data = await api.getGrammar(level);
        setPoints(data);
        setSelected(data[0] || null);
      } catch (error) {
        console.error('Failed to load grammar:', error);
      } finally {
        setLoading(false);
      }
    }

    loadGrammar();
  }, [level]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Grammar Reference</h1>
        <div className="flex gap-2">
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                level === value
                  ? 'bg-[var(--color-vermilion)] text-white'
                  : 'border border-[var(--color-border)]'
              }`}
            >
              HSK {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={togglePinyin}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          {showPinyin ? 'Hide Pinyin' : 'Show Pinyin'}
        </button>
      </div>

      {loading ? (
        <p className="text-[var(--color-text-muted)]">Loading grammar...</p>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <aside className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:w-80">
            <div className="space-y-2">
              {points.map((point, index) => (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => setSelected(point)}
                  className={`block w-full rounded-lg px-3 py-3 text-left ${
                    selected?.id === point.id
                      ? 'bg-[var(--color-vermilion)] text-white'
                      : 'hover:bg-[var(--color-bg)]'
                  }`}
                >
                  {index + 1}. {point.title}
                </button>
              ))}
            </div>
          </aside>

          <section className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            {selected ? (
              <div>
                <h2 className="mb-3 text-xl font-semibold">{selected.title}</h2>
                <p className="mb-5 text-[var(--color-text-muted)]">{selected.explanation}</p>

                <div className="space-y-4">
                  {selected.examples.map((example, index) => (
                    <div key={`${selected.id}-${index}`} className="rounded-lg bg-[var(--color-bg)] p-4">
                      <p className="text-lg font-semibold">{example.zh}</p>
                      {showPinyin && (
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{example.pinyin}</p>
                      )}
                      <p className="mt-2 text-sm">{example.en}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[var(--color-text-muted)]">Select a grammar point to begin.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}