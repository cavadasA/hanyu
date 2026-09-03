import type {
  ExerciseAnswer,
  ExerciseKind,
  ExerciseSolution,
  Evaluation,
  EvaluationDetail,
  SchedulingPhase,
  SchedulingState,
} from '@hanyu/domain';

export type {
  ExerciseAnswer,
  ExerciseSolution,
  Evaluation,
  EvaluationDetail,
  SchedulingPhase,
  SchedulingState,
} from '@hanyu/domain';

export type ThemePreference = 'light' | 'dark' | 'system';
export type SupportLanguage = 'es' | 'en';
export type CardOrder = 'due' | 'frequency';
export type AiProvider = 'none' | 'deepseek' | 'gemini';
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';
export type HskLevel = 1 | 2 | 3;
export type ExerciseType = ExerciseKind;
export type ReadingFormat = 'short_text' | 'story' | 'dialogue';

export type LearningSkill =
  | 'recognition'
  | 'recall'
  | 'listening'
  | 'reading'
  | 'production';

export interface WordContext {
  sentence: string;
  source_kind: 'reading';
  source_id: string;
}

export type LearningTargetKind = 'word' | 'grammar' | 'character';

export type LearningEventKind =
  | 'review_rated'
  | 'review_reverted'
  | 'exercise_attempted'
  | 'word_looked_up'
  | 'reading_completed'
  | 'hint_used';

export interface LearningEvent {
  id: string;
  user_id: string;
  occurred_at: string;
  recorded_at: string;
  kind: LearningEventKind;
  target_kind: LearningTargetKind | null;
  target_id: number | null;
  skill: LearningSkill | null;
  payload: Record<string, unknown>;
  client_event_id: string | null;
  reverts_event_id: string | null;
}

export interface LearnerSkillState {
  id: string;
  user_id: string;
  target_kind: LearningTargetKind;
  target_id: number;
  skill: LearningSkill;
  difficulty: number | null;
  stability: number | null;
  retrievability: number | null;
  fsrs_state: SchedulingPhase;
  learning_steps: number;
  scheduled_days: number;
  elapsed_days: number;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  suspended: boolean;
  leech: boolean;
  version: number;
  /** Optional word label attached by getLeechStates for user-facing lists. */
  word?: Pick<Word, 'hanzi' | 'pinyin' | 'meaning_es' | 'meaning_en'>;
}

export type ContentKind = 'reading' | 'dialogue' | 'lesson' | 'exercise';
export type TeachesRole = 'target' | 'reinforces' | 'assumes';

export interface ContentItem {
  id: string;
  kind: ContentKind;
  hsk_level: HskLevel;
  title: string;
  source_table: string | null;
  source_id: string | null;
}

export interface ContentTeaches {
  content_id: string;
  target_kind: LearningTargetKind;
  target_id: number;
  role: TeachesRole;
}

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
  solution: ExerciseSolution;
  explanation: string | null;
}

export interface ExerciseCheckResult {
  correct: boolean;
  expected_answer: ExerciseSolution;
  submitted_answer: ExerciseAnswer;
  detail: EvaluationDetail;
  explanation: string | null;
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
  sense_index: number | null;
  variants: string[];
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
  code: string;
  group: string | null;
  category: string | null;
  detail: string | null;
  title: string;
  pattern: string | null;
  explanation: string | null;
  items: string[];
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
  request_retention: number;
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
  skill: LearningSkill;
  scheduling: SchedulingState;
  version: number;
  hanzi?: string;
  traditional?: string | null;
  pinyin?: string;
  meaning_en?: string;
  meaning_es?: string | null;
  classifier?: string | null;
  hsk_level?: number;
  pos?: string | null;
  frequency?: number | null;
  sense_index?: number | null;
  variants?: string[];
  context?: WordContext | null;
}

export interface DueCardsPayload {
  cards: DueCard[];
  total: number;
  deck_size: number;
}

export interface ReviewEvent {
  card_id: string;
  /** Escala de FSRS: 1 Again, 2 Hard, 3 Good, 4 Easy. */
  grade: 1 | 2 | 3 | 4;
  skill: LearningSkill;
  time_ms: number | null;
  review_id: string;
  reviewed_at: string;
  expected_version: number;
  /** Estado que el cliente calculó. El servidor lo guarda, no lo recalcula. */
  state: SchedulingState;
  /** Estado anterior, que revert_review restaura. */
  prior: SchedulingState;
}

export interface VersionedCard extends DueCard {
  version: number;
}

export interface ReviewSyncResult {
  outcome: 'applied' | 'duplicate' | 'conflict';
  card: VersionedCard;
}

export type RevertOutcome = 'reverted' | 'conflict' | 'not_found' | 'already_reverted';

export interface RevertReviewResult {
  outcome: RevertOutcome;
  /** Null when the server cannot associate the review with a current card. */
  card: VersionedCard | null;
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
