import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReadingView from '../components/ReadingView';
import { api } from '../services/api';

const FORMATS = [
  { value: '', label: 'All formats' },
  { value: 'short_text', label: 'Short Text' },
  { value: 'story', label: 'Story' },
  { value: 'dialogue', label: 'Dialogue' },
];

export default function Readings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [reading, setReading] = useState(null);
  const [level, setLevel] = useState(1);
  const [format, setFormat] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function loadList() {
      setLoading(true);

      try {
        const data = await api.getReadings({ level, format });
        setReadings(data.readings || []);
      } catch (error) {
        console.error('Failed to load readings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadList();
  }, [level, format]);

  useEffect(() => {
    async function loadReading() {
      if (!id) {
        setReading(null);
        return;
      }

      setLoading(true);
      try {
        const data = await api.getReading(id);
        setReading(data);
      } catch (error) {
        console.error('Failed to load reading detail:', error);
      } finally {
        setLoading(false);
      }
    }

    loadReading();
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const data = await api.generateReading(level, format || 'short_text');
      navigate(`/readings/${data.id}`);
    } catch (error) {
      console.error('Failed to generate reading:', error);
    } finally {
      setGenerating(false);
    }
  }

  if (id && reading) {
    return <ReadingView reading={reading} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Readings Library</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Browse cached passages or generate a fresh graded text.</p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate reading'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              HSK {value}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          {FORMATS.map((item) => (
            <option key={item.label} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p>Loading readings...</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {readings.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(`/readings/${item.id}`)}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition-transform hover:-translate-y-0.5"
          >
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              <span>HSK {item.hsk_level}</span>
              <span>{item.format}</span>
            </div>
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Open this passage and answer the comprehension prompts.</p>
          </button>
        ))}
      </div>
    </div>
  );
}