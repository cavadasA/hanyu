import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({
  api: {
    getToday: vi.fn().mockResolvedValue({
      profile: { current_level: 2, mode: 'hsk2_consolidation' },
      flashcards: { deck_size: 150, due: 20, target: 20, completed: 0 },
      exercises: { target: 5, completed: 2 },
      reading: { target: 1, completed: 0, level: 2, next: { id: 1, title: '我的家', hsk_level: 2, format: 'short_text' } },
      progress: { completed_blocks: 1, total_blocks: 3 },
    }),
    getDashboard: vi.fn().mockResolvedValue({
      streak: { current: 5, longest: 12 },
      cards: { total: 100, due: 15, by_status: { new: 20, learning: 30, review: 40, mastered: 10 } },
      today: { cards_reviewed: 10, cards_new: 3, exercises_done: 2, readings_done: 1, time_spent_ms: 1800000 },
      heatmap: [{ date: '2026-07-28', activity: 3 }],
      learning_curve: [{ date: '2026-07-25', mastered: 5 }],
      exercise_stats: { by_type: { fill_blank: 10, multiple_choice: 8 } },
      reading_stats: { total: 4 },
      time: { today_ms: 1800000, week_ms: 7200000, all_time_ms: 36000000 },
    }),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}));

describe('Dashboard', () => {
  it('renders streak info and Today section', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeDefined();
      expect(screen.getByText('HSK2 consolidation')).toBeDefined();
      expect(screen.getByText('Review 20 cards')).toBeDefined();
      expect(screen.getByText('Practice 5 exercises')).toBeDefined();
      expect(screen.getByText('Read one HSK2 passage')).toBeDefined();
      expect(screen.getByText(/5 day streak/)).toBeDefined();
    });
  });

  it('renders cards overview', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined();
    });
  });

  it('renders time studied section', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/120 min/)).toBeDefined();
    });
  });
});