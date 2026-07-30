import { createSupabaseClient, type HanyuDataConfig } from './client';
import {
  getSession,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
} from './auth';
import { getGrammar, getGrammarPoint } from './repositories/grammar';
import {
  addCard,
  createStarterDeck,
  getCard,
  getDueCards,
  getFlashcardStats,
  reviewCard,
  reviewCardEvent,
} from './repositories/flashcards';
import { checkExercise, generateExercise, getExerciseHistory } from './repositories/exercises';
import {
  completeReading,
  generateReading,
  getReading,
  getReadings,
} from './repositories/readings';
import { getSettings, updateSettings } from './repositories/settings';
import { getDashboard, getStreak, logTime } from './repositories/stats';
import { getToday } from './repositories/today';
import { getWord, getWords } from './repositories/words';
import type { ExerciseType, HskLevel, ReadingFormat } from './types';

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
    grammar: {
      getGrammar: (level: HskLevel) => getGrammar(level, client),
      getGrammarPoint: (level: HskLevel, id: number | string) =>
        getGrammarPoint(level, id, client),
    },
    flashcards: {
      getDueCards: (limit = 50) => getDueCards(limit, client),
      getCard: (id: string) => getCard(id, client),
      reviewCard: (id: string, quality: number, timeMs: number | null) =>
        reviewCard(id, quality, timeMs, client),
      reviewCardEvent: (event: Parameters<typeof reviewCardEvent>[0]) =>
        reviewCardEvent(event, client),
      addCard: (wordId: number | string) => addCard(wordId, client),
      createStarterDeck: (input: { strategy?: string; limit?: number } = {}) =>
        createStarterDeck(input, client),
      getFlashcardStats: () => getFlashcardStats(client),
    },
    exercises: {
      generateExercise: (type: ExerciseType, level: HskLevel) =>
        generateExercise(type, level, client),
      checkExercise: (id: string, answer: unknown) => checkExercise(id, answer, client),
      getExerciseHistory: (limit = 20) => getExerciseHistory(limit, client),
    },
    readings: {
      getReadings: (params: Parameters<typeof getReadings>[0] = {}) => getReadings(params, client),
      getReading: (id: string) => getReading(id, client),
      generateReading: (level: HskLevel, format: ReadingFormat) =>
        generateReading(level, format, client),
      completeReading: (id: string, answers: Record<string, string>) =>
        completeReading(id, answers, client),
    },
    settings: {
      getSettings: () => getSettings(client),
      updateSettings: (input: Record<string, unknown>) => updateSettings(input, client),
    },
    stats: {
      getDashboard: () => getDashboard(client),
      getStreak: () => getStreak(client),
      logTime: (ms: number) => logTime(ms, client),
    },
    today: {
      getToday: () => getToday(client),
    },
  };
}

export type HanyuData = ReturnType<typeof createHanyuData>;
