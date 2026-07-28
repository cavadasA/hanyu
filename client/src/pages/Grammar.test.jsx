import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Grammar from './Grammar';

vi.mock('../services/api', () => ({
  api: {
    getGrammar: vi.fn().mockResolvedValue([
      {
        id: 1,
        hsk_level: 1,
        title: 'Basic SVO',
        explanation: 'Chinese basic word order follows Subject Verb Object.',
        examples: [
          { zh: '我喝茶。', pinyin: 'Wǒ hē chá.', en: 'I drink tea.' },
        ],
        order_idx: 1,
      },
    ]),
  },
}));

describe('Grammar page', () => {
  it('renders grammar points', async () => {
    render(
      <BrowserRouter>
        <Grammar />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Basic SVO')).toBeDefined();
    });
  });

  it('shows example sentences', async () => {
    render(
      <BrowserRouter>
        <Grammar />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('我喝茶。')).toBeDefined();
      expect(screen.getByText('I drink tea.')).toBeDefined();
    });
  });
});