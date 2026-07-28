const BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }

  return response.json();
}

export const api = {
  getWords: (params = {}) => request(`/words?${new URLSearchParams(params).toString()}`),
  getWord: (id) => request(`/words/${id}`),
  getGrammar: (level) => request(`/grammar/${level}`),
  getGrammarPoint: (level, id) => request(`/grammar/${level}/${id}`),
  getDueCards: (limit = 50) => request(`/flashcards/due?limit=${limit}`),
  reviewCard: (id, quality, timeMs) =>
    request(`/flashcards/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ quality, time_ms: timeMs }),
    }),
  addCard: (wordId) =>
    request('/flashcards/add', {
      method: 'POST',
      body: JSON.stringify({ word_id: wordId }),
    }),
  getFlashcardStats: () => request('/flashcards/stats'),
  generateExercise: (type, level) =>
    request('/exercises/generate', {
      method: 'POST',
      body: JSON.stringify({ type, level }),
    }),
  checkExercise: (id, answer) =>
    request(`/exercises/${id}/check`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  getExerciseHistory: () => request('/exercises/history'),
  getReadings: (params = {}) => request(`/readings?${new URLSearchParams(params).toString()}`),
  getReading: (id) => request(`/readings/${id}`),
  generateReading: (level, format) =>
    request('/readings/generate', {
      method: 'POST',
      body: JSON.stringify({ level, format }),
    }),
  getDashboard: () => request('/stats/dashboard'),
  getStreak: () => request('/stats/streak'),
  logTime: (ms) =>
    request('/stats/log-time', {
      method: 'POST',
      body: JSON.stringify({ ms }),
    }),
  getSettings: () => request('/settings'),
  updateSettings: (data) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};