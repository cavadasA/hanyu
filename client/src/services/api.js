import { getGrammar, getGrammarPoint } from './repositories/grammar';
import {
  addCard,
  createStarterDeck,
  getDueCards,
  getFlashcardStats,
  reviewCard,
} from './repositories/flashcards';
import {
  checkExercise,
  generateExercise,
  getExerciseHistory,
} from './repositories/exercises';
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

export const api = {
  getWords: (params = {}) => getWords(params),
  getWord: (id) => getWord(id),
  getGrammar: (level) => getGrammar(level),
  getGrammarPoint: (level, id) => getGrammarPoint(level, id),
  getDueCards: (limit = 50) => getDueCards(limit),
  reviewCard: (id, quality, timeMs) => reviewCard(id, quality, timeMs),
  addCard: (wordId) => addCard(wordId),
  createStarterDeck: (data = {}) => createStarterDeck(data),
  getFlashcardStats: () => getFlashcardStats(),
  generateExercise: (type, level) => generateExercise(type, level),
  checkExercise: (id, answer) => checkExercise(id, answer),
  getExerciseHistory: (limit) => getExerciseHistory(limit),
  getReadings: (params = {}) => getReadings(params),
  getReading: (id) => getReading(id),
  generateReading: (level, format) => generateReading(level, format),
  completeReading: (id, answers) => completeReading(id, answers),
  getToday: () => getToday(),
  getDashboard: () => getDashboard(),
  getStreak: () => getStreak(),
  logTime: (ms) => logTime(ms),
  getSettings: () => getSettings(),
  updateSettings: (data) => updateSettings(data),
};