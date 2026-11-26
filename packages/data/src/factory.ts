import { createSupabaseClient, type HanyuDataConfig } from './client';
import {
  getSession,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
} from './auth';
import { getGrammar, getGrammarPoint, getGrammarReadings, getGrammarStudyState, markGrammarStudied } from './repositories/grammar';
import {
  addDeckFromTemplate,
  addWordToDeck,
  createDeck,
  deleteDeck,
  getDeckCards,
  getDecks,
  getDeckTemplates,
  removeWordFromDeck,
  updateDeck,
} from './repositories/decks';
import {
  addCard,
  buildQueue,
  createStudyPlan,
  getCard,
  getFlashcardStats,
  revertReview,
  reviewCardEvent,
  submitDiagnostic,
} from './repositories/flashcards';
import {
  buildExerciseSession,
  checkExercise,
  generateExercise,
  getExerciseHistory,
  getMistakes,
  recordHintUsed,
} from './repositories/exercises';
import { getEvents, recordEvent } from './repositories/events';
import { assessPronunciation, getCommunicativeContext, getCommunicativeTasks, getWritingQueue, gradeCommunicative, reviewWriting } from './repositories/expression';
import { getExamForm, listExamAttempts, submitExamAttempt, type ExamAttemptInput } from './repositories/exam';
import {
  completeReading,
  getReading,
  getReadingProgress,
  getReadings,
  markRead,
  type MarkReadOptions,
  saveReadingProgress,
  toggleBookmark,
} from './repositories/readings';
import { getSettings, updateSettings } from './repositories/settings';
import {
  clearLeech,
  getLeechStates,
  getSkillStates,
  setSkillSuspended,
  upsertSkillState,
} from './repositories/skills';
import { getDashboard, getLearningReport, getStreak, logTime } from './repositories/stats';
import { getToday } from './repositories/today';
import { getWord, getWords } from './repositories/words';
import type {
  ExerciseAnswer,
  ExerciseType,
  HskLevel,
  LearningSkill,
  WordContext,
} from './types';

const READING_CACHE_PREFIX = 'hanyu.reading-cache:';

type ReadingCacheStorage = HanyuDataConfig['storage'] | HanyuDataConfig['readingCache'];

async function readReadingCache<T>(storage: ReadingCacheStorage, key: string): Promise<T | null> {
  if (!storage) return null;

  try {
    const raw = await storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeReadingCache(
  storage: ReadingCacheStorage,
  key: string,
  value: unknown,
): Promise<void> {
  if (!storage) return;

  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    // La caché es una mejora offline y nunca debe romper una respuesta online.
  }
}

async function readingCacheScope(client: ReturnType<typeof createSupabaseClient>): Promise<string | null> {
  const getSession = (client as any).auth?.getSession;
  if (typeof getSession === 'function') {
    try {
      const { data, error } = await getSession();
      if (data?.session?.user?.id) return String(data.session.user.id);
      if (error) return null;
      return 'anonymous';
    } catch {
      return null;
    }
  }

  const getUser = (client as any).auth?.getUser;
  if (typeof getUser !== 'function') return 'anonymous';

  try {
    const { data, error } = await getUser();
    if (error) return null;
    return data?.user?.id ? String(data.user.id) : 'anonymous';
  } catch {
    return null;
  }
}

function isNetworkError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(candidate.status);
  if ((candidate.status !== undefined && status !== 0) || candidate.code === 'PGRST116') return false;
  const message = String(candidate.message ?? '');
  return /network|fetch failed|failed to fetch|timeout|timed out|offline|econn|enetunreach|enotfound/i.test(message);
}

function readingCacheKey(scope: string, kind: 'list' | 'detail', id: string) {
  return `${READING_CACHE_PREFIX}${encodeURIComponent(scope)}:${kind}:${encodeURIComponent(id)}`;
}

function offlineDetailFromSummary(summary: any) {
  if (!summary?.offline) return null;
  return { ...summary, ...summary.offline };
}

export function createHanyuData(config: HanyuDataConfig) {
  const client = createSupabaseClient(config);
  const redirectTo = config.passwordResetRedirectTo;

  return {
    client,
    auth: {
      getSession: () => getSession(client),
      signIn: (input: { email: string; password: string }) => signIn(input, client),
      signUp: (input: { email: string; password: string }) => signUp(input, client),
      sendPasswordReset: (email: string) => sendPasswordReset(email, client, redirectTo),
      signOut: () => signOut(client),
      subscribeToAuthChanges: (
        onChange: (payload: { event: string; session: unknown }) => void
      ) => subscribeToAuthChanges(onChange, client),
    },
    words: {
      getWords: (params: Parameters<typeof getWords>[0] = {}) => getWords(params, client),
      getWord: (id: number | string) => getWord(id, client),
    },
    decks: {
      getDecks: () => getDecks(client),
      getDeckTemplates: () => getDeckTemplates(client),
      addDeckFromTemplate: (templateId: string) => addDeckFromTemplate(templateId, client),
      createDeck: (input: { name: string; description?: string }) => createDeck(input, client),
      updateDeck: (id: string, patch: Parameters<typeof updateDeck>[1]) => updateDeck(id, patch, client),
      deleteDeck: (id: string) => deleteDeck(id, client),
      addWordToDeck: (deckId: string, wordId: number | string) => addWordToDeck(deckId, wordId, client),
      removeWordFromDeck: (deckId: string, wordId: number | string) => removeWordFromDeck(deckId, wordId, client),
      getDeckCards: (deckId: string) => getDeckCards(deckId, client),
    },
    grammar: {
      getGrammar: (level: HskLevel) => getGrammar(level, client),
      getGrammarPoint: (level: HskLevel, id: number | string) =>
        getGrammarPoint(level, id, client),
      getGrammarReadings: (level: HskLevel, code: string) => getGrammarReadings(level, code, client),
      getGrammarStudyState: (id: number | string) => getGrammarStudyState(id, client),
      markGrammarStudied: (id: number | string) => markGrammarStudied(id, client),
    },
    flashcards: {
      buildQueue: (input: Parameters<typeof buildQueue>[0] = {}) => buildQueue(input, client),
      getCard: (id: string, skill: LearningSkill = 'recognition') => getCard(id, client, skill),
      reviewCardEvent: (event: Parameters<typeof reviewCardEvent>[0]) =>
        reviewCardEvent(event, client),
      revertReview: (reviewId: string) => revertReview(reviewId, client),
      addCard: (
        wordId: number | string,
        options?: { deckId?: string; context?: WordContext },
      ) => addCard(wordId, client, options),
      createStudyPlan: (levels: number[]) => createStudyPlan(levels, client),
      submitDiagnostic: (results: Array<{ word_id: number; known: boolean }>) =>
        submitDiagnostic(results, client),
      getFlashcardStats: () => getFlashcardStats(client),
    },
    exercises: {
      buildExerciseSession: (unitCode?: string | null, length = 8, targetWordIds: number[] = []) =>
        buildExerciseSession(unitCode, length, client, targetWordIds),
      generateExercise: (type: ExerciseType, level: HskLevel) =>
        generateExercise(type, level, client),
      checkExercise: (id: string, answer: ExerciseAnswer, options?: { hintUsed?: boolean }) =>
        checkExercise(id, answer, client, options),
      recordHintUsed: (id: string) => recordHintUsed(id, client),
      getExerciseHistory: (limit = 20) => getExerciseHistory(limit, client),
      getMistakes: (limit = 20) => getMistakes(client, limit),
    },
    exam: {
      getExamForm: (level: number, form: string | null = null) => getExamForm(level, form, client),
      submitExamAttempt: (attempt: ExamAttemptInput) => submitExamAttempt(attempt, client),
      listExamAttempts: (level: number) => listExamAttempts(level, client),
    },
    expression: {
      assessPronunciation: (input: Parameters<typeof assessPronunciation>[0]) => assessPronunciation(input, client),
      gradeCommunicative: (input: Parameters<typeof gradeCommunicative>[0]) => gradeCommunicative(input, client),
      getCommunicativeTasks: (maxLevel: number) => getCommunicativeTasks(maxLevel, client),
      getCommunicativeContext: (level: number) => getCommunicativeContext(level, client),
      getWritingQueue: (input: Parameters<typeof getWritingQueue>[0] = {}) => getWritingQueue(input, client),
      reviewWriting: (input: Parameters<typeof reviewWriting>[0]) => reviewWriting(input, client),
    },
    events: {
      recordEvent: (input: Parameters<typeof recordEvent>[0]) => recordEvent(input, client),
      getEvents: (params: Parameters<typeof getEvents>[0] = {}) => getEvents(params, client),
    },
    skills: {
      getSkillStates: (params: Parameters<typeof getSkillStates>[0]) =>
        getSkillStates(params, client),
      getLeechStates: (skill?: Parameters<typeof getLeechStates>[0]) =>
        getLeechStates(skill, client),
      upsertSkillState: (input: Parameters<typeof upsertSkillState>[0]) =>
        upsertSkillState(input, client),
      setSkillSuspended: (input: Parameters<typeof setSkillSuspended>[0]) =>
        setSkillSuspended(input, client),
      clearLeech: (input: Parameters<typeof clearLeech>[0]) => clearLeech(input, client),
    },
    readings: {
      getReadings: async (params: Parameters<typeof getReadings>[0] = {}) => {
        const scope = await readingCacheScope(client);
        const cacheKey = scope ? readingCacheKey(scope, 'list', JSON.stringify(params)) : null;

        try {
          const readings = await getReadings(params, client);
          if (cacheKey) {
            const cache = config.readingCache ?? config.storage;
            await writeReadingCache(cache, cacheKey, readings);
            await Promise.all(readings.map(reading => {
              const detailKey = readingCacheKey(scope!, 'detail', reading.slug);
              const detail = offlineDetailFromSummary(reading);
              return detail ? writeReadingCache(cache, detailKey, detail) : Promise.resolve();
            }));
          }
          return readings;
        } catch (error) {
          if (isNetworkError(error) && cacheKey) {
            const cached = await readReadingCache<Awaited<ReturnType<typeof getReadings>>>(config.readingCache ?? config.storage, cacheKey);
            if (cached !== null) return cached;
          }
          throw error;
        }
      },
      getReading: async (slug: string) => {
        const scope = await readingCacheScope(client);
        const cacheKey = scope ? readingCacheKey(scope, 'detail', slug) : null;

        try {
          const reading = await getReading(slug, client);
          if (cacheKey) {
            await writeReadingCache(config.readingCache ?? config.storage, cacheKey, reading);
          }
          return reading;
        } catch (error) {
          if (isNetworkError(error) && cacheKey) {
            const cache = config.readingCache ?? config.storage;
            const cached = await readReadingCache<Awaited<ReturnType<typeof getReading>>>(cache, cacheKey);
            if (cached !== null) return cached;
          }
          throw error;
        }
      },
      getReadingProgress: (slug: string) => getReadingProgress(slug, client),
      saveReadingProgress: (slug: string, lastSentence: number) => saveReadingProgress(slug, lastSentence, client),
      markRead: (slug: string, options?: MarkReadOptions) => markRead(slug, options, client),
      toggleBookmark: (slug: string) => toggleBookmark(slug, client),
      completeReading: (slug: string, answers: Record<string, string>) =>
        completeReading(slug, answers, client),
    },
    settings: {
      getSettings: () => getSettings(client),
      updateSettings: (input: Record<string, unknown>) => updateSettings(input, client),
    },
    stats: {
      getDashboard: () => getDashboard(client),
      getLearningReport: (days?: number) => getLearningReport(client, days),
      getStreak: () => getStreak(client),
      logTime: (ms: number) => logTime(ms, client),
    },
    today: {
      getToday: () => getToday(client),
    },
  };
}

export type HanyuData = ReturnType<typeof createHanyuData>;
