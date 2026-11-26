import type {
  ExerciseAnswer,
  ExerciseKind,
  ExerciseSolution,
  Coverage,
  Evaluation,
  EvaluationDetail,
  PlanStep,
  SchedulingPhase,
  SchedulingState,
} from '@hanyu/domain';

export type {
  ExerciseAnswer,
  ExerciseSolution,
  Evaluation,
  EvaluationDetail,
  PlanStep,
  SchedulingPhase,
  SchedulingState,
  Coverage,
} from '@hanyu/domain';

export type ThemePreference = 'light' | 'dark' | 'system';
export type SupportLanguage = 'es' | 'en';
export type CardOrder = 'due' | 'frequency';
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';
export type HskLevel = 1 | 2 | 3;
export type ExerciseType = ExerciseKind;
export type ReadingFormat = 'short_text' | 'story' | 'dialogue';

export type LearningSkill =
  | 'recognition'
  | 'recall'
  | 'listening'
  | 'reading'
  | 'production'
  | 'pronunciation'
  | 'writing';

/** Un carácter del sílabo. `handwriting`: está en la lista 书写字, se escribe a mano. */
export interface HskCharacter {
  hanzi: string;
  hsk_level: HskLevel;
  handwriting: boolean;
}

export interface WordContext {
  sentence: string;
  source_kind: 'reading';
  source_id: string;
}

export type LearningTargetKind = 'word' | 'grammar' | 'character';
export type StudyMode = 'learn' | 'review' | 'exam';

export type LearningEventKind =
  | 'review_rated'
  | 'review_reverted'
  | 'exercise_attempted'
  | 'word_looked_up'
  | 'reading_completed'
  | 'hint_used'
  | 'grammar_studied';

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
  fsrs_state: SchedulingPhase;
  learning_steps: number;
  scheduled_days: number;
  elapsed_days: number;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  suspended: boolean;
  auto_suspended: boolean;
  leech: boolean;
  leech_cleared_lapses: number;
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
  slug?: string;
  unit_code?: string;
  target_word_id?: number | null;
  prompt: ExercisePrompt;
  solution: ExerciseSolution;
  explanation: string | null;
}

export interface ExerciseSession {
  unit_code: string | null;
  unit_title: string;
  /** La unidad aún no tiene ejercicios propios: es un repaso general de su nivel. */
  review_fallback: boolean;
  hsk_level: HskLevel;
  exercises: Exercise[];
  length: number;
}

export interface Mistake {
  target_id: number;
  misses: number;
  hits_since: number;
  distinct_days: number;
  word?: Pick<Word, 'hanzi' | 'pinyin' | 'meaning_es' | 'meaning_en'>;
}

export interface ExerciseCheckResult {
  correct: boolean;
  answer_correct: boolean;
  counted_as_correct: boolean;
  hint_used: boolean;
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

export type ReadingQuestionKind = 'literal' | 'inferential';

export interface ReadingQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
}

export interface ReadingSentence {
  zh: string;
  pinyin: string;
  es: string;
  tokens: ReadingToken[];
}

export interface ReadingGrammarTarget {
  code: string;
  level: number;
}

export type ReadingAudioKind = 'tts' | 'neural' | 'human';

/** Clip de una frase: URL pública (o `file://` si está descargado) y duración. */
export interface SentenceAudio {
  url: string;
  duration_ms: number;
}

export interface ReadingToken {
  id: string;
  text: string;
  type: 'word' | 'unknown' | 'punctuation';
  word: Word | null;
  status?: ReadingTokenStatus;
  senses?: Word[];
}

export type ReadingTokenStatus = 'known' | 'learning' | 'target' | 'unknown';

export interface ReadingSummary {
  id: string;
  slug: string;
  title: string;
  hsk_level: HskLevel;
  format: ReadingFormat;
  topic: string;
  series: string | null;
  series_index: number | null;
  target_words: string[];
  target_grammar: ReadingGrammarTarget[];
  audio_kind: ReadingAudioKind;
  /** Un elemento por frase; todos `null` si `audio_kind = 'tts'`. */
  sentence_audio: Array<SentenceAudio | null>;
  coverage?: Coverage | null;
  progress?: ReadingProgress | null;
  offline?: ReadingOfflineDetail;
  created_at?: string;
  /** Compatibility alias retained for clients that still display this field. */
  generated_at?: string;
}

export interface ReadingOfflineDetail {
  sentences: ReadingSentence[];
  content: string;
  grammar_points: GrammarPoint[];
  questions: ReadingQuestion[];
  tokens: ReadingToken[];
}

export interface ReadingProgress {
  reading_slug: string;
  bookmarked: boolean;
  last_sentence: number;
  started_at?: string | null;
  finished_at: string | null;
  pinyin_shown?: boolean | null;
  updated_at: string;
}

export interface MarkReadOptions {
  pinyinShown?: boolean | null;
}

export interface ReadingDetail extends ReadingSummary {
  sentences: ReadingSentence[];
  content: string;
  grammar_points: GrammarPoint[];
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
    kind: ReadingQuestionKind;
    /** Por qué la respuesta se deduce del texto; solo en las inferenciales. */
    rationale_es?: string;
  }>;
}

export interface GrammarExample {
  zh: string;
  pinyin: string;
  es: string;
}

export interface GrammarError {
  wrong: string;
  right: string;
  why: string;
}

export interface GrammarReading {
  slug: string;
  title: string;
  /** Primera frase de la lectura que contiene un marcador del punto; '' si ninguna. */
  sentence: string;
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
  markers: string[];
  examples: GrammarExample[];
  common_errors: GrammarError[];
  see_also: Array<{ hsk_level: HskLevel; code: string }>;
  order_idx?: number | null;
}

export interface UserSettings {
  user_id: string;
  theme: ThemePreference;
  support_language: SupportLanguage;
  current_level: number;
  new_cards_per_day: number;
  review_limit_per_day: number;
  session_size: number;
  request_retention: number;
  card_order: CardOrder;
  exam_date: string | null;
  api_key: string;
  created_at?: string;
  updated_at?: string;
}

export interface BuildQueueInput {
  skill?: LearningSkill;
  deckId?: string | null;
  limit?: number | null;
  mode?: StudyMode;
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
  is_new: boolean;
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
  };
  flashcards: {
    deck_size: number;
    due: number;
    new_target: number;
    review_target: number;
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
    next: { slug: string; title: string; hsk_level: number; format: string } | null;
  };
  progress: {
    completed_blocks: number;
    total_blocks: number;
  };
  steps: PlanStep[];
}

export interface LearningReportReview {
  occurred_at: string;
  grade: string;
  skill: string;
  phase_before: string | null;
}

export interface LearningReportAttempt {
  occurred_at: string;
  skill: string;
  correct: boolean;
  mode: string | null;
}

export interface LearningReportReadingSession {
  slug: string;
  seconds: number;
  pinyin_shown: boolean | null;
  chars: number;
}

export interface LearningReportReadingAttempt {
  created_at: string;
  reading_slug: string;
  score: number;
  total: number;
  /** Parte de score/total que viene de preguntas inferenciales; 0 en los intentos anteriores. */
  inferential_score: number;
  inferential_total: number;
}

export interface LearningReportUnit {
  code: string;
  title: string;
  hsk_level: number;
  total_words: number;
  settled_words: number;
  total_items: number;
  settled_items: number;
  completed: boolean;
}

export interface LearningReportSkillState {
  target_id: number;
  skill: string;
  stability: number | null;
  suspended: boolean;
  last_reviewed_at: string | null;
  in_scope?: boolean;
}

export interface LearningReport {
  reviews: LearningReportReview[];
  attempts: LearningReportAttempt[];
  lookups: number;
  reading_sessions: LearningReportReadingSession[];
  skill_states: LearningReportSkillState[];
  reading_attempts: LearningReportReadingAttempt[];
  mistakes_count: number;
  syllabus_words_count: number;
  units: LearningReportUnit[];
}
