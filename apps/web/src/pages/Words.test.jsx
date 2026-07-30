import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Words from './Words';

vi.mock('../services/api', () => ({
  api: {
    getWords: vi.fn().mockResolvedValue({
      words: [
        { id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1, pos: 'pronoun' },
        { id: 2, hanzi: '好', pinyin: 'hǎo', meaning_en: 'good', hsk_level: 1, pos: 'adjective' },
      ],
      total: 2,
      page: 1,
      limit: 50,
    }),
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
  },
}));

function renderWords() {
  return render(
    <BrowserRouter>
      <Words />
    </BrowserRouter>
  );
}

describe('Words page', () => {
  it('renders word list', async () => {
    renderWords();

    await waitFor(() => {
      expect(screen.getByText('你')).toBeDefined();
      expect(screen.getByText('好')).toBeDefined();
    });
  });

  it('shows pinyin and meaning', async () => {
    renderWords();

    await waitFor(() => {
      expect(screen.getByText('nǐ')).toBeDefined();
      expect(screen.getByText('you')).toBeDefined();
    });
  });
});