import { createSupabaseClient, type HanyuDataConfig } from './client';
import {
  getSession,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
} from './auth';
import { getGrammar, getGrammarPoint, getGrammarStudyState, markGrammarStudied } from './repositories/grammar';
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
import { buildExerciseSession, checkExercise, generateExercise, getExerciseHistory } from './repositories/exercises';
import { getEvents, recordEvent } from './repositories/events';
import {
  completeReading,
  getReading,
  getReadings,
} from './repositories/readings';
import { getSettings, updateSettings } from './repositories/settings';
import {
  clearLeech,
  getLeechStates,
  getSkillStates,
  setSkillSuspended,
  upsertSkillState,
} from './repositories/skills';
import { getDashboard, getStreak, logTime } from './repositories/stats';
import { getToday } from './repositories/today';
import { getWord, getWords } from './repositories/words';
import type {
  ExerciseAnswer,
  ExerciseType,
  HskLevel,
  LearningSkill,
  WordContext,
} from './types';

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
      buildExerciseSession: (unitCode?: string | null, length = 8) =>
        buildExerciseSession(unitCode, length, client),
      generateExercise: (type: ExerciseType, level: HskLevel) =>
        generateExercise(type, level, client),
      checkExercise: (id: string, answer: ExerciseAnswer) => checkExercise(id, answer, client),
      getExerciseHistory: (limit = 20) => getExerciseHistory(limit, client),
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
      getReadings: (params: Parameters<typeof getReadings>[0] = {}) => getReadings(params, client),
      getReading: (slug: string) => getReading(slug, client),
      completeReading: (slug: string, answers: Record<string, string>) =>
        completeReading(slug, answers, client),
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
