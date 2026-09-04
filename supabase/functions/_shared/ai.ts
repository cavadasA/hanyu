export const VALID_EXERCISE_TYPES = new Set([
  'fill_blank',
  'multiple_choice',
  'reorder',
  'dictation',
  'matching',
]);

type ExercisePayload = {
  prompt: Record<string, unknown>;
  answer: unknown;
};

export function buildFallbackExercise(type: string, level: number): ExercisePayload {
  switch (type) {
    case 'multiple_choice':
      return {
        prompt: {
          type,
          question: `HSK ${level}: What does 学习 mean?`,
          options: ['to study', 'to sleep', 'to run', 'to forget'],
          correct: 'to study',
        },
        answer: 'to study',
      };
    case 'reorder':
      return {
        prompt: {
          type,
          words: ['学习', '我', '汉语', '每天'],
          correct_order: ['我', '每天', '学习', '汉语'],
          translation: 'I study Chinese every day.',
        },
        answer: '我每天学习汉语',
      };
    case 'dictation':
      return {
        prompt: {
          type,
          audio_text: '你好',
          pinyin: 'ni hao',
          accept_pinyin: true,
        },
        answer: '你好',
      };
    case 'matching':
      return {
        prompt: {
          type,
          pairs: [
            { left: '学习', right: 'to study' },
            { left: '朋友', right: 'friend' },
          ],
        },
        answer: 'matched',
      };
    case 'fill_blank':
    default:
      return {
        prompt: {
          type: 'fill_blank',
          sentence: '我___汉语。',
          options: ['学习', '已经', '因为', '但是'],
          correct: '学习',
          explanation: '学习 means to study.',
        },
        answer: '学习',
      };
  }
}
