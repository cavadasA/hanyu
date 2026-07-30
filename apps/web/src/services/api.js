import { createHanyuData } from '@hanyu/data';

let cached = null;

function data() {
  if (!cached) {
    cached = createHanyuData({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      detectSessionInUrl: true,
      passwordResetRedirectTo:
        typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }

  return cached;
}

export const api = {
  getWords: (params = {}) => data().words.getWords(params),
  getWord: (id) => data().words.getWord(id),
  getGrammar: (level) => data().grammar.getGrammar(level),
  getGrammarPoint: (level, id) => data().grammar.getGrammarPoint(level, id),
  getDueCards: (limit = 50) => data().flashcards.getDueCards(limit),
  reviewCard: (id, quality, timeMs) => data().flashcards.reviewCard(id, quality, timeMs),
  addCard: (wordId) => data().flashcards.addCard(wordId),
  createStarterDeck: (input = {}) => data().flashcards.createStarterDeck(input),
  getFlashcardStats: () => data().flashcards.getFlashcardStats(),
  generateExercise: (type, level) => data().exercises.generateExercise(type, level),
  checkExercise: (id, answer) => data().exercises.checkExercise(id, answer),
  getExerciseHistory: (limit) => data().exercises.getExerciseHistory(limit),
  getReadings: (params = {}) => data().readings.getReadings(params),
  getReading: (id) => data().readings.getReading(id),
  generateReading: (level, format) => data().readings.generateReading(level, format),
  completeReading: (id, answers) => data().readings.completeReading(id, answers),
  getToday: () => data().today.getToday(),
  getDashboard: () => data().stats.getDashboard(),
  getStreak: () => data().stats.getStreak(),
  logTime: (ms) => data().stats.logTime(ms),
  getSettings: () => data().settings.getSettings(),
  updateSettings: (input) => data().settings.updateSettings(input),
};

export const authApi = {
  getSession: () => data().auth.getSession(),
  signIn: (input) => data().auth.signIn(input),
  signUp: (input) => data().auth.signUp(input),
  sendPasswordReset: (email) => data().auth.sendPasswordReset(email),
  signOut: () => data().auth.signOut(),
  subscribeToAuthChanges: (onChange) => data().auth.subscribeToAuthChanges(onChange),
};