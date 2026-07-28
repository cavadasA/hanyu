import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({
  api: {
    getDashboard: vi.fn().mockResolvedValue({
      streak: { current: 7, longest: 12 },
      cards: { total: 42, due: 8, by_status: { new: 5, learning: 10, review: 20, mastered: 7 } },
      today: { cards_reviewed: 12, exercises_done: 4, readings_done: 1, time_spent_ms: 900000 },
      heatmap: [{ date: '2026-07-28', activity: 16 }],
    }),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

describe('Dashboard', () => {
  it('renders streak info', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('7 day streak')).toBeDefined();
    });
  });

  it('renders quick action links', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Review flashcards')).toBeDefined();
      expect(screen.getByText('Open readings')).toBeDefined();
    });
  });
});