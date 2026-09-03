//
// La instantánea vivía en una variable de módulo: se perdía al cerrar el
// proceso y también al volver a entrar en la pestaña, porque load() la
// limpiaba. El banner conservaba apariencia de continuidad, no la cola.
//
// Guardar los identificadores y el índice, y no solo los contadores, es lo que
// permite reanudar de verdad.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReviewMode = 'recognition' | 'recall' | 'listening' | 'reading';

const KEY = 'hanyu.review-session';

// Una cola de ayer propondría tarjetas cuyo momento ya pasó, así que se
// descarta en vez de reanudarse.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReviewSessionSnapshot {
  session_id: string;
  deck_id: string | null;
  card_ids: string[];
  index: number;
  mode: ReviewMode;
  started_at: number;
  reviewed: number;
  stats: { reviewed: number; correct: number; again: number };
}

function isReviewMode(value: unknown): value is ReviewMode {
  return value === 'recognition' || value === 'recall' || value === 'listening' || value === 'reading';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isSnapshot(value: unknown): value is ReviewSessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  const stats = snapshot.stats;

  return Boolean(
    typeof snapshot.session_id === 'string' &&
      (snapshot.deck_id === null || typeof snapshot.deck_id === 'string') &&
      Array.isArray(snapshot.card_ids) &&
      snapshot.card_ids.every((id) => typeof id === 'string') &&
      isNonNegativeInteger(snapshot.index) &&
      isReviewMode(snapshot.mode) &&
      typeof snapshot.started_at === 'number' &&
      Number.isFinite(snapshot.started_at) &&
      isNonNegativeInteger(snapshot.reviewed) &&
      stats !== null &&
      typeof stats === 'object' &&
      isNonNegativeInteger((stats as Record<string, unknown>).reviewed) &&
      isNonNegativeInteger((stats as Record<string, unknown>).correct) &&
      isNonNegativeInteger((stats as Record<string, unknown>).again),
  );
}

export async function loadReviewSession(): Promise<ReviewSessionSnapshot | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await clearReviewSession();
    return null;
  }

  if (!isSnapshot(parsed)) {
    await clearReviewSession();
    return null;
  }

  if (Date.now() - parsed.started_at > MAX_AGE_MS) {
    await clearReviewSession();
    return null;
  }

  return parsed;
}

export async function saveReviewSession(snapshot: ReviewSessionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Perder la instantánea degrada la reanudación, no la sesión en curso.
  }
}

export async function clearReviewSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Igual que arriba.
  }
}
