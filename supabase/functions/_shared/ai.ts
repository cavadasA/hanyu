export const VALID_EXERCISE_TYPES = new Set([
  'fill_blank',
  'multiple_choice',
  'reorder',
  'dictation',
  'matching',
]);

export const VALID_READING_FORMATS = new Set(['short_text', 'story', 'dialogue']);

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

export function buildFallbackReading(level: number, format: string) {
  const title = `HSK${level} ${format.replace('_', ' ')} practice`;
  const content = '你好！我每天学习汉语。我喜欢读书，也喜欢喝茶。';

  return {
    hsk_level: level,
    format,
    title,
    content,
    pinyin_text: 'Ni hao! Wo mei tian xue xi Han yu. Wo xi huan du shu, ye xi huan he cha.',
    questions: [
      {
        id: 'q0',
        question: '这个人每天做什么？',
        options: [
          { id: 'A', text: '学习汉语' },
          { id: 'B', text: '看电影' },
          { id: 'C', text: '踢足球' },
          { id: 'D', text: '做饭' },
        ],
        correct_option_id: 'A',
      },
      {
        id: 'q1',
        question: '他喜欢什么？',
        options: [
          { id: 'A', text: '读书和喝茶' },
          { id: 'B', text: '跑步和游泳' },
          { id: 'C', text: '唱歌和跳舞' },
          { id: 'D', text: '画画和写作' },
        ],
        correct_option_id: 'A',
      },
    ],
  };
}
