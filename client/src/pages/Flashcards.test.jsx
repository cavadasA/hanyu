import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Flashcards from './Flashcards';

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
  it('loads and renders a due flashcard', async () => {
    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeDefined();
    });
  });
});