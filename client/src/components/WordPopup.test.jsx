import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordPopup from './WordPopup';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
  },
}));

describe('WordPopup', () => {
  it('renders a known word token with dictionary detail', () => {
    render(
      <WordPopup
        token={{
          id: 't0',
          text: '你好',
          type: 'word',
          word: { id: 229, pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false },
        }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello; hi')).toBeDefined();
    expect(screen.getByText('HSK 1')).toBeDefined();
  });

  it('adds a known word to SRS', async () => {
    render(
      <WordPopup
        token={{
          id: 't0',
          text: '你好',
          type: 'word',
          word: { id: 229, pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false },
        }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('+ Add to SRS'));

    await waitFor(() => {
      expect(api.addCard).toHaveBeenCalledWith(229);
      expect(screen.getByText('Already in SRS')).toBeDefined();
    });
  });

  it('shows an honest unknown-token state', () => {
    render(
      <WordPopup
        token={{ id: 't0', text: '龘', type: 'unknown' }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('龘')).toBeDefined();
    expect(screen.getByText('Not found in the local dictionary.')).toBeDefined();
  });

  it('shows an error message when adding card fails with generic error', async () => {
    api.addCard.mockRejectedValueOnce(new Error('Internal Server Error'));

    render(
      <WordPopup
        token={{
          id: 't0',
          text: '你好',
          type: 'word',
          word: { id: 229, pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false },
        }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('+ Add to SRS'));

    await waitFor(() => {
      expect(screen.getByText('Failed to add card. Try again.')).toBeDefined();
    });
  });
});
