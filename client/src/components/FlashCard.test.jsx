import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlashCard from './FlashCard';

describe('FlashCard', () => {
  const card = {
    id: 1,
    hanzi: '你好',
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    hsk_level: 1,
  };

  it('shows hanzi on front in recognition mode (default)', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    expect(screen.getByText('你好')).toBeDefined();
  });

  it('reveals pinyin and meaning on click in recognition mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('shows meaning on front in recall mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="recall" />);
    expect(screen.getByText('hello')).toBeDefined();
    expect(screen.queryByText('你好')).toBeNull();
  });

  it('reveals hanzi and pinyin on click in recall mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="recall" />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
  });

  it('hides all text on front in listening mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="listening" />);
    expect(screen.queryByText('你好')).toBeNull();
    expect(screen.queryByText('hello')).toBeNull();
    expect(screen.getByText('🔊')).toBeDefined();
  });

  it('reveals hanzi, pinyin, and meaning on click in listening mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="listening" />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('shows rating buttons after reveal', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('Again')).toBeDefined();
    expect(screen.getByText('Hard')).toBeDefined();
    expect(screen.getByText('Good')).toBeDefined();
    expect(screen.getByText('Easy')).toBeDefined();
  });

  it('calls onRate with quality value', () => {
    const onRate = vi.fn();
    render(<FlashCard card={card} onRate={onRate} />);
    fireEvent.click(screen.getByText('Show Answer'));
    fireEvent.click(screen.getByText('Good'));
    expect(onRate).toHaveBeenCalledWith(4);
  });
});