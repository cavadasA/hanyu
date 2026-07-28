import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Settings from './Settings';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({
      theme: 'light',
      current_level: 2,
      cards_per_day: 30,
      max_reviews_per_session: 100,
      card_order: 'hsk_order',
      ai_provider: 'none',
      api_key: '',
    }),
    updateSettings: vi.fn().mockImplementation(async (settings) => settings),
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

  it('renders extended flashcard settings', async () => {
    render(
      <BrowserRouter>
        <Settings />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Max reviews per session')).toBeDefined();
      expect(screen.getByLabelText('Card order')).toBeDefined();
    });
  });

  it('shows API key only for configured providers and confirms save', async () => {
    render(
      <BrowserRouter>
        <Settings />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('AI provider')).toBeDefined();
    });

    expect(screen.queryByLabelText('API key')).toBeNull();

    fireEvent.change(screen.getByLabelText('AI provider'), {
      target: { value: 'deepseek' },
    });

    expect(screen.getByLabelText('API key')).toBeDefined();

    fireEvent.click(screen.getByText('Save settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved!')).toBeDefined();
    });

    expect(api.updateSettings).toHaveBeenCalledTimes(1);
  });
});