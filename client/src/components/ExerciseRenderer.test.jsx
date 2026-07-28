import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ExerciseRenderer from './ExerciseRenderer';

describe('ExerciseRenderer', () => {
  it('renders fill_blank exercise', () => {
    render(
      <ExerciseRenderer
        exercise={{
          type: 'fill_blank',
          sentence: '我___去学校。',
          options: ['每天', '昨天', '已经', '可能'],
          correct: '每天',
        }}
        onAnswer={vi.fn()}
        result={null}
      />
    );

    expect(screen.getByText('我')).toBeDefined();
    expect(screen.getByText('去学校。')).toBeDefined();
    expect(screen.getByText('每天')).toBeDefined();
  });

  it('submits multiple choice answer', () => {
    const onAnswer = vi.fn();

    render(
      <ExerciseRenderer
        exercise={{
          type: 'multiple_choice',
          question: '“你好” means?',
          options: ['hello', 'goodbye', 'thanks', 'sorry'],
          correct: 'hello',
        }}
        onAnswer={onAnswer}
        result={null}
      />
    );

    fireEvent.click(screen.getByText('hello'));
    expect(onAnswer).toHaveBeenCalledWith('hello');
  });

  it('builds a reorder answer and submits it', () => {
    const onAnswer = vi.fn();

    render(
      <ExerciseRenderer
        exercise={{
          type: 'reorder',
          words: ['学校', '去', '我'],
          correct_order: ['我', '去', '学校'],
          translation: 'I go to school',
        }}
        onAnswer={onAnswer}
        result={null}
      />
    );

    fireEvent.click(screen.getByText('我'));
    fireEvent.click(screen.getByText('去'));
    fireEvent.click(screen.getByText('学校'));
    fireEvent.click(screen.getByText('Check answer'));
    expect(onAnswer).toHaveBeenCalledWith(['我', '去', '学校']);
  });

  it('renders result feedback', () => {
    render(
      <ExerciseRenderer
        exercise={{
          type: 'dictation',
          audio_text: '你好',
          pinyin: 'nǐ hǎo',
          accept_pinyin: true,
        }}
        onAnswer={vi.fn()}
        result={{ correct: false, correct_answer: '你好' }}
      />
    );

    expect(screen.getByText('Correct answer: 你好')).toBeDefined();
  });
});