export type ThemePreference = 'light' | 'dark' | 'system';
export type SupportLanguage = 'es' | 'en';
export type CardOrder = 'due' | 'frequency';
export type AiProvider = 'none' | 'deepseek' | 'gemini';
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';
export type HskLevel = 1 | 2 | 3;
export type ExerciseType =
  | 'fill_blank'
  | 'multiple_choice'
  | 'reorder'
  | 'dictation'
  | 'matching';
export type ReadingFormat = 'short_text' | 'story' | 'dialogue';

export type ExercisePrompt =
  | { kind: 'fill_blank'; sentence: string; options?: string[] }
  | { kind: 'multiple_choice'; question: string; options: string[] }
  | { kind: 'reorder'; tokens: string[] }
  | {
      kind: 'dictation';
      audio_text: string;
      pinyin?: string;
      accept_pinyin?: boolean;
    }
  | { kind: 'matching'; pairs: Array<{ left: string; right: string }> };

export interface Exercise {
  id: string;
  type: ExerciseType;
  hsk_level: HskLevel;
  prompt: ExercisePrompt;
  explanation: string | null;
}

export interface ExerciseCheckResult {
  correct: boolean;
  expected_answer: unknown;
  submitted_answer: unknown;
  explanation: string | null;
  correct_answer?: unknown;
}

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  source_template_id: string | null;
  sort_order: number;
}

export interface DeckSummary extends Deck {
  word_count: number;
  due_count: number;
}

export interface DeckTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: 'hsk' | 'theme';
  hsk_level: number | null;
  sort_order: number;
}

export interface Word {
  id: number;
  hanzi: string;
  traditional: string | null;
  pinyin: string;
  meaning_en: string;
  meaning_es: string | null;
  classifier: string | null;
  hsk_level: HskLevel;
  pos: string | null;
  frequency: number | null;
  in_srs: boolean;
}

export interface WordPage {
  items: Word[];
  page: number;
  page_size: number;
  total: number;
  /** Compatibility aliases used by the web application. */
  words?: Word[];
  limit?: number;
}

export interface ReadingQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
}

export interface ReadingToken {
  id: string;
  text: string;
  type: 'word' | 'unknown' | 'punctuation';
  word: Word | null;
}

export interface ReadingSummary {
  id: string;
  title: string;
  hsk_level: HskLevel;
  format: ReadingFormat;
  generated_at: string;
}

export interface ReadingDetail extends ReadingSummary {
  content: string;
  pinyin_text: string | null;
  questions: ReadingQuestion[];
  tokens: ReadingToken[];
}

export interface ReadingResult {
  score: number;
  total: number;
  results: Array<{
    question_id: string;
    selected_option_id: string;
    correct_option_id: string;
    correct: boolean;
  }>;
}

export interface GrammarPoint {
  id: number;
  hsk_level: HskLevel;
  title: string;
  pattern: string | null;
  explanation: string | null;
  examples: Array<{ chinese: string; pinyin?: string; english?: string }>;
  order_idx?: number | null;
}

export interface UserSettings {
  user_id: string;
  theme: ThemePreference;
  support_language: SupportLanguage;
  current_level: number;
  cards_per_day: number;
  max_reviews_per_session: number;
  card_order: CardOrder;
  ai_provider: AiProvider;
  api_key: string;
  api_key_configured: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DueCard {
  id: string;
  user_id: string;
  word_id: number;
  ease_factor: number;
  interval: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  next_review_at: string;
  last_review: string | null;
  last_reviewed_at: string | null;
  status: CardStatus;
  hanzi?: string;
  traditional?: string | null;
  pinyin?: string;
  meaning_en?: string;
  meaning_es?: string | null;
  classifier?: string | null;
  hsk_level?: number;
  pos?: string | null;
  frequency?: number | null;
}

export interface DueCardsPayload {
  cards: DueCard[];
  total: number;
  deck_size: number;
}

export interface ReviewResult {
  card_id: string;
  interval: number;
  next_review: string | null;
  ease_factor: number | null;
  status: CardStatus | null;
}

export interface ReviewEvent {
  card_id: string;
  quality: number;
  time_ms: number | null;
  review_id: string;
  reviewed_at: string;
  expected_version: number;
}

export interface VersionedCard extends DueCard {
  version: number;
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_review_at: string;
  last_reviewed_at: string | null;
}

export interface ReviewSyncResult {
  outcome: 'applied' | 'duplicate' | 'conflict';
  card: VersionedCard;
}

export interface StarterDeckResult {
  inserted?: number;
  deck_size?: number;
}

export interface FlashcardStats {
  total: number;
  due: number;
  by_status: Partial<Record<CardStatus, number>>;
  by_level: Record<string, number>;
}

export interface StreakPayload {
  current: number;
  longest: number;
}

export interface TodayPayload {
  profile: {
    current_level: number;
    mode: string;
  };
  flashcards: {
    deck_size: number;
    due: number;
    target: number;
    completed: number;
  };
  exercises: {
    target: number;
    completed: number;
  };
  reading: {
    target: number;
    completed: number;
    level: number;
    next: { id: string; title: string; hsk_level: number; format: string } | null;
  };
  progress: {
    completed_blocks: number;
    total_blocks: number;
  };
}
