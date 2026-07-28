import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';

const STATUS_COLORS = {
  new: '#E23D28',
  learning: '#D4A017',
  review: '#2563eb',
  mastered: '#16a34a',
};

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await api.getDashboard();
        setData(response);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      }
    }

    loadDashboard();
  }, []);

  if (!data) {
    return <p>Loading dashboard...</p>;
  }

  const chartData = Object.entries(data.cards.by_status || {}).map(([name, value]) => ({ name, value }));
  const weekMin = Math.round((data.time?.week_ms || 0) / 60000);
  const allTimeMin = Math.round((data.time?.all_time_ms || 0) / 60000);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,_rgba(226,61,40,0.96),_rgba(212,160,23,0.84))] p-8 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-white/75">Today</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold">{data.streak.current} day streak</h1>
            <p className="mt-2 max-w-2xl text-white/85">Keep the chain alive with a short flashcard review, an exercise set, or one graded reading.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Cards due" value={data.cards.due} />
            <MiniStat label="Reviewed today" value={data.today.cards_reviewed || 0} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Deck size" value={data.cards.total} subtitle="Tracked flashcards" />
        <StatCard label="Exercises" value={data.today.exercises_done || 0} subtitle="Completed today" />
        <StatCard label="Readings" value={data.reading_stats?.total || 0} subtitle={`${data.today.readings_done || 0} today`} />
        <StatCard
          label="Study time"
          value={`${Math.round((data.time?.today_ms || 0) / 60000)} min`}
          subtitle={`${weekMin} min this week · ${allTimeMin} min total`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">SRS distribution</h2>
            <span className="text-sm text-[var(--color-text-muted)]">Current queue</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Quick actions</h2>
          <div className="space-y-3">
            <QuickLink to="/flashcards" title="Review flashcards" description="Start the due deck" />
            <QuickLink to="/exercises" title="Practice exercises" description="Generate a new drill" />
            <QuickLink to="/readings" title="Open readings" description="Browse graded passages" />
          </div>
        </div>
      </section>

      {data.learning_curve && data.learning_curve.length > 0 ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Learning curve</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.learning_curve}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="mastered" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {data.exercise_stats && Object.keys(data.exercise_stats.by_type || {}).length > 0 ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Exercise breakdown</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data.exercise_stats.by_type).map(([type, count]) => (
              <div key={type} className="rounded-xl bg-[var(--color-bg)] p-4 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{type.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <span className="text-sm text-[var(--color-text-muted)]">Last 90 days</span>
        </div>
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-9 lg:grid-cols-12">
          {(data.heatmap || []).map((day) => (
            <div key={day.date} className="rounded-lg bg-[var(--color-bg)] p-2 text-center">
              <div className="text-xs text-[var(--color-text-muted)]">{day.date.slice(5)}</div>
              <div className="mt-2 rounded-md bg-[var(--color-vermilion)]/15 py-2 text-sm font-semibold text-[var(--color-vermilion)]">
                {day.activity}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.12em] text-white/70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function QuickLink({ to, title, description }) {
  return (
    <Link to={to} className="block rounded-xl bg-[var(--color-bg)] p-4 transition-transform hover:-translate-y-0.5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
    </Link>
  );
}