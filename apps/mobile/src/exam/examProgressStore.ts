// El simulacro en curso, guardado en el dispositivo.
//
// Las respuestas y el reloj vivían sólo en memoria: con 51 minutos de examen, una
// llamada o que el sistema matase la app hacía perder el intento entero. Se guarda
// la fase y el instante absoluto en que empezó (no lo que quedaba), así que al
// reanudar el reloj de pared sigue mandando, igual que tras un rato en segundo plano.
//
// La clave lleva el usuario y la forma: un intento nunca se ofrece a otra cuenta.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Picks } from './parts';

export type ExamTimedPhase = 'listening' | 'answer_sheet' | 'reading' | 'writing';

export interface ExamProgress {
  level: number;
  form_code: string;
  phase: ExamTimedPhase;
  /** Epoch ms en que empezó la fase actual. */
  phase_start: number;
  /** ISO del inicio del intento, el mismo que se entrega. */
  started_at: string;
  picks: Picks;
}

const PREFIX = 'hanyu.exam-progress.';
// Un intento de ayer ya no es un simulacro: se descarta en vez de reanudarse.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PHASES: readonly string[] = ['listening', 'answer_sheet', 'reading', 'writing'];

const keyOf = (userId: string, level: number, formCode: string) => `${PREFIX}${userId}.${level}.${formCode}`;

function isProgress(value: unknown): value is ExamProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.level === 'number' &&
    typeof v.form_code === 'string' &&
    typeof v.phase === 'string' &&
    PHASES.includes(v.phase) &&
    typeof v.phase_start === 'number' &&
    Number.isFinite(v.phase_start) &&
    typeof v.started_at === 'string' &&
    Number.isFinite(Date.parse(v.started_at)) &&
    !!v.picks &&
    typeof v.picks === 'object'
  );
}

export async function loadExamProgress(userId: string, level: number, formCode: string): Promise<ExamProgress | null> {
  const key = keyOf(userId, level, formCode);
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (
    !isProgress(parsed) ||
    parsed.level !== level ||
    parsed.form_code !== formCode ||
    Date.now() - Date.parse(parsed.started_at) > MAX_AGE_MS
  ) {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
  return parsed;
}

export async function saveExamProgress(userId: string, progress: ExamProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(keyOf(userId, progress.level, progress.form_code), JSON.stringify(progress));
  } catch {
    // Perder la copia degrada la reanudación, no el examen en curso.
  }
}

export async function clearExamProgress(userId: string, level: number, formCode: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyOf(userId, level, formCode));
  } catch {
    // Igual que arriba.
  }
}

/** Al cerrar sesión: ningún simulacro a medias se queda en el dispositivo. */
export async function clearAllExamProgress(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(key => key.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // Igual que arriba.
  }
}
