import { describe, expect, it } from 'vitest';
import { normalizeReadingQuestion, scoreReadingAnswers } from './reading-answers.js';

describe('reading answer normalization', () => {
  it('normalizes exact text answers', () => {
    const question = normalizeReadingQuestion({
      question: '小明喜欢什么？',
      options: ['看电视', '看书', '吃饭', '运动'],
      correct: '看书',
    }, 0);

    expect(question.options[1]).toEqual({ id: 'B', text: '看书' });
    expect(question.correct_option_id).toBe('B');
  });

  it('normalizes letter-only correct answers', () => {
    const question = normalizeReadingQuestion({
      question: '小明家有几口人？',
      options: ['两口人', '三口人', '四口人', '五口人'],
      correct: 'B',
    }, 0);

    expect(question.correct_option_id).toBe('B');
  });

  it('normalizes letter-prefixed options', () => {
    const question = normalizeReadingQuestion({
      question: '小明的家有几只猫？',
      options: ['A. 一只', 'B. 两只', 'C. 三只', 'D. 没有猫'],
      correct: 'A',
    }, 0);

    expect(question.options[0]).toEqual({ id: 'A', text: '一只' });
    expect(question.correct_option_id).toBe('A');
  });

  it('scores answers by canonical option id', () => {
    const questions = [
      normalizeReadingQuestion({ question: 'Q1', options: ['一', '二'], correct: 'B' }, 0),
      normalizeReadingQuestion({ question: 'Q2', options: ['A. 好', 'B. 不好'], correct: 'A' }, 1),
    ];

    const result = scoreReadingAnswers(questions, { q0: 'B', q1: 'A' });

    expect(result).toEqual({
      score: 2,
      total: 2,
      results: [
        { question_id: 'q0', selected_option_id: 'B', correct_option_id: 'B', correct: true },
        { question_id: 'q1', selected_option_id: 'A', correct_option_id: 'A', correct: true },
      ],
    });
  });
});
