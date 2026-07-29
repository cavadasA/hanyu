import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./services/auth', () => ({
  getSession: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'student@example.com' },
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
  subscribeToAuthChanges: vi.fn().mockReturnValue(() => {}),
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
}));

vi.mock('./pages/Dashboard', () => ({
  default: function DashboardMock() {
    return <div>Learning Overview</div>;
  },
}));

vi.mock('./services/api', () => ({
  api: {
    getDashboard: vi.fn().mockResolvedValue({
      streak: { current: 0, longest: 0 },
      cards: { total: 0, due: 0, by_status: {} },
      today: { cards_reviewed: 0, exercises_done: 0, readings_done: 0, time_spent_ms: 0 },
      heatmap: [],
    }),
  },
}));

describe('App shell', () => {
  it('renders the navigation', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('汉语')).toBeDefined();
      expect(screen.getByRole('link', { name: '设' })).toBeDefined();
    });
  });

  it('renders the dashboard by default', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Learning Overview')).toBeDefined();
    });
  });
});