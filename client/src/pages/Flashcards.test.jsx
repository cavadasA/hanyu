import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Flashcards from './Flashcards';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getDueCards: vi.fn().mockResolvedValue({
      cards: [
        {
          id: 1,
          hanzi: '你好',
          pinyin: 'nǐ hǎo',
          meaning_en: 'hello',
          hsk_level: 1,
          status: 'new',
        },
      ],
    }),
    reviewCard: vi.fn().mockResolvedValue({ interval: 1, next_review: '2026-07-29' }),
    logTime: vi.fn().mockResolvedValue({ time_spent_ms: 0 }),
  },
}));

describe('Flashcards page', () => {
  it('renders due cards and mode selector', async () => {
    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeDefined();
    });

    expect(screen.getByText('Recognition')).toBeDefined();
    expect(screen.getByText('Recall')).toBeDefined();
    expect(screen.getByText('Listening')).toBeDefined();
  });

  it('switches the active flashcard mode prompt', async () => {
    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Recall'));
    expect(screen.getByText('hello')).toBeDefined();

    fireEvent.click(screen.getByText('Listening'));
    expect(screen.getByText('🔊')).toBeDefined();
  });

  it('completes the session and logs study time once', async () => {
    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Show Answer'));
    fireEvent.click(screen.getByText('Good'));

    await waitFor(() => {
      expect(screen.getByText('Session Complete!')).toBeDefined();
      expect(screen.getByText('You reviewed 1 cards.')).toBeDefined();
    });

    expect(api.reviewCard).toHaveBeenCalledTimes(1);
    expect(api.logTime).toHaveBeenCalledTimes(1);
  });
});