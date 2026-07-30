import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReadingView from './ReadingView';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getWords: vi.fn().mockResolvedValue({
      words: [{ id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1 }],
    }),
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
    completeReading: vi.fn().mockImplementation((id, answers) => {
      let score = 0;
      const results = [];
      if (answers.q0 === 'A') score += 1;
      results.push({ question_id: 'q0', selected_option_id: answers.q0, correct_option_id: 'A', correct: answers.q0 === 'A' });
      if (answers.q1 === 'A') score += 1;
      results.push({ question_id: 'q1', selected_option_id: answers.q1, correct_option_id: 'A', correct: answers.q1 === 'A' });
      return Promise.resolve({ score, total: 2, results });
    }),
  },
}));

const reading = {
  id: 1,
  title: '你好',
  content: '你好，我叫小明。',
  pinyin_text: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.',
  tokens: [
    { id: 't0', text: '你好', type: 'word', word: { id: 229, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false } },
    { id: 't1', text: '，', type: 'punctuation' },
    { id: 't2', text: '朋友', type: 'word', word: { id: 114, hanzi: '朋友', pinyin: 'péngyou', meaning_en: 'friend', hsk_level: 1, in_srs: true } },
    { id: 't3', text: '。', type: 'punctuation' },
  ],
  questions: [
    {
      id: 'q0',
      question: '他叫什么？',
      options: [
        { id: 'A', text: '小明' },
        { id: 'B', text: '小红' },
        { id: 'C', text: '小李' },
        { id: 'D', text: '小王' },
      ],
      correct_option_id: 'A',
    },
    {
      id: 'q1',
      question: '他说了什么？',
      options: [
        { id: 'A', text: '你好' },
        { id: 'B', text: '再见' },
        { id: 'C', text: '谢谢' },
        { id: 'D', text: '对不起' },
      ],
      correct_option_id: 'A',
    },
  ],
};

describe('ReadingView', () => {
  it('renders reading title and content', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByRole('heading', { name: '你好' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: '你好' })[0]).toBeDefined();
    expect(screen.getByRole('button', { name: '朋友' })).toBeDefined();
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

  it('shows score after submitting answers', async () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '小明' }));
    fireEvent.click(screen.getAllByRole('button', { name: '你好' })[1]);
    fireEvent.click(screen.getByText('Submit Answers'));

    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeDefined();
    });
  });

  it('highlights correct and incorrect answers after submit', async () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '小红' }));
    fireEvent.click(screen.getAllByRole('button', { name: '你好' })[1]);
    fireEvent.click(screen.getByText('Submit Answers'));

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeDefined();
    });
  });

  it('opens popup for full words instead of single characters', async () => {
    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getAllByRole('button', { name: '你好' })[0]);

    expect(await screen.findByText('nǐ hǎo')).toBeDefined();
  });

  it('allows retry when completing reading fails', async () => {
    api.completeReading.mockRejectedValueOnce(new Error('Network error'));

    render(<ReadingView reading={reading} />);

    fireEvent.click(screen.getByRole('button', { name: '小明' }));
    fireEvent.click(screen.getAllByRole('button', { name: '你好' })[1]);
    fireEvent.click(screen.getByText('Submit Answers'));

    await waitFor(() => {
      expect(screen.getByText('Failed to submit answers. Please try again.')).toBeDefined();
      expect(screen.getByText('Submit Answers')).toBeDefined();
    });
  });
});