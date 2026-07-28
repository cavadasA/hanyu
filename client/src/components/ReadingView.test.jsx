import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReadingView from './ReadingView';

vi.mock('../services/api', () => ({
  api: {
    getWords: vi.fn().mockResolvedValue({
      words: [{ id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1 }],
    }),
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
  },
}));

const reading = {
  id: 1,
  title: '你好',
  content: '你好，我叫小明。',
  pinyin_text: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.',
  questions: [
    { question: '他叫什么？', options: ['小明', '小红', '小李', '小王'], correct: '小明' },
    { question: '他说了什么？', options: ['你好', '再见', '谢谢', '对不起'], correct: '你好' },
  ],
};

describe('ReadingView', () => {
  it('renders reading title and content', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByRole('heading', { name: '你好' })).toBeDefined();
    expect(screen.getByRole('button', { name: '你' })).toBeDefined();
    expect(screen.getByRole('button', { name: '明' })).toBeDefined();
  });

  it('toggles pinyin visibility', () => {
    render(<ReadingView reading={reading} />);
    fireEvent.click(screen.getByText('Show Pinyin'));
    expect(screen.getByText('Nǐ hǎo, wǒ jiào Xiǎo Míng.')).toBeDefined();
  });

  it('renders comprehension questions with selectable options', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('他叫什么？')).toBeDefined();
    const option = screen.getByRole('button', { name: '小明' });
    fireEvent.click(option);
    expect(option.className).toContain('border-[var(--color-vermilion)]');
  });

  it('shows score after submitting answers', () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '小明' }));
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    fireEvent.click(screen.getByText('Submit Answers'));

    expect(screen.getByText('2 / 2')).toBeDefined();
  });

  it('highlights correct and incorrect answers after submit', () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '小红' }));
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    fireEvent.click(screen.getByText('Submit Answers'));

    expect(screen.getByText('1 / 2')).toBeDefined();
  });

  it('shows word popup on character click', async () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '你' }));

    await waitFor(() => {
      expect(screen.getByText('nǐ')).toBeDefined();
    });
  });
});