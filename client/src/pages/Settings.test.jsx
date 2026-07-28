import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Settings from './Settings';

vi.mock('../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({
      theme: 'light',
      current_level: 2,
      cards_per_day: 30,
      ai_provider: 'none',
      api_key: '',
    }),
    updateSettings: vi.fn().mockResolvedValue({
      theme: 'light',
      current_level: 2,
      cards_per_day: 30,
      ai_provider: 'none',
      api_key: '',
    }),
  },
}));

describe('Settings page', () => {
  it('renders settings form', async () => {
    render(
      <BrowserRouter>
        <Settings />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Settings Panel')).toBeDefined();
      expect(screen.getByLabelText('Theme')).toBeDefined();
      expect(screen.getByLabelText('Current HSK level')).toBeDefined();
      expect(screen.getByLabelText('Cards per day')).toBeDefined();
    });
  });
});