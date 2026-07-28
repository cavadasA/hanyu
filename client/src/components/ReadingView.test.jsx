import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReadingView from './ReadingView';

describe('ReadingView', () => {
  const reading = {
    id: 1,
    title: '你好',
    content: '你好，我叫小明。',
    pinyin_text: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.',
    questions: [
      {
        question: '小明说了什么？',
        options: ['你好', '再见', '谢谢', '对不起'],
        correct: '你好',
      },
    ],
  };

  it('renders reading title and content', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('你好，我叫小明。')).toBeDefined();
  });

  it('toggles pinyin visibility', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.queryByText('Nǐ hǎo, wǒ jiào Xiǎo Míng.')).toBeNull();
    fireEvent.click(screen.getByText('Show Pinyin'));
    expect(screen.getByText('Nǐ hǎo, wǒ jiào Xiǎo Míng.')).toBeDefined();
  });

  it('renders comprehension questions', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('小明说了什么？')).toBeDefined();
    expect(screen.getByText('你好')).toBeDefined();
  });
});