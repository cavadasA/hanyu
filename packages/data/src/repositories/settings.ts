import type { HanyuClient } from '../client';
import type { Database } from '../database.types';
import { createRepositoryError, getRequiredUserId } from './shared';

const DEFAULT_SETTINGS = {
  theme: 'light',
  support_language: 'es',
  current_level: 2,
  new_cards_per_day: 10,
  review_limit_per_day: 200,
  session_size: 20,
  request_retention: 0.9,
  card_order: 'due',
  exam_date: null,
};

const ALLOWED_THEMES = new Set(['light', 'dark', 'system']);
const ALLOWED_CARD_ORDER = new Set(['due', 'frequency']);
const ALLOWED_SUPPORT_LANGUAGES = new Set(['es', 'en']);

function normalizeCardOrder(value: any) {
  if (value === 'hsk_order') {
    return 'due';
  }

  return ALLOWED_CARD_ORDER.has(value) ? value : DEFAULT_SETTINGS.card_order;
}

function normalizeSettings(row: any) {
  return {
    user_id: String(row?.user_id ?? ''),
    theme: ALLOWED_THEMES.has(row?.theme) ? row.theme : DEFAULT_SETTINGS.theme,
    support_language: ALLOWED_SUPPORT_LANGUAGES.has(row?.support_language)
      ? row.support_language
      : DEFAULT_SETTINGS.support_language,
    current_level: clampNumber(row?.current_level, 1, 6, DEFAULT_SETTINGS.current_level),
    new_cards_per_day: clampNumber(row?.new_cards_per_day, 0, 100, DEFAULT_SETTINGS.new_cards_per_day),
    review_limit_per_day: clampNumber(
      row?.review_limit_per_day,
      10,
      999,
      DEFAULT_SETTINGS.review_limit_per_day,
    ),
    session_size: clampNumber(row?.session_size, 5, 200, DEFAULT_SETTINGS.session_size),
    request_retention: clampDecimal(row?.request_retention, 0.7, 0.97, DEFAULT_SETTINGS.request_retention),
    card_order: normalizeCardOrder(row?.card_order),
    exam_date: normalizeExamDate(row?.exam_date),
    api_key: '',
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

export function isValidExamDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function normalizeExamDate(value: unknown): string | null {
  return isValidExamDate(value) ? value : null;
}

function sanitizeExamDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (!isValidExamDate(value)) {
    throw new Error('La fecha del examen debe ser una fecha válida con formato YYYY-MM-DD');
  }

  return value;
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function clampDecimal(value: any, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function sanitizeUpdates(data: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};

  if (data.theme !== undefined) {
    updates.theme = ALLOWED_THEMES.has(data.theme as string) ? data.theme : DEFAULT_SETTINGS.theme;
  }

  if (data.support_language !== undefined) {
    updates.support_language = ALLOWED_SUPPORT_LANGUAGES.has(data.support_language as string)
      ? data.support_language
      : DEFAULT_SETTINGS.support_language;
  }

  if (data.current_level !== undefined) {
    updates.current_level = clampNumber(data.current_level, 1, 6, DEFAULT_SETTINGS.current_level);
  }

  if (data.new_cards_per_day !== undefined) {
    updates.new_cards_per_day = clampNumber(
      data.new_cards_per_day,
      0,
      100,
      DEFAULT_SETTINGS.new_cards_per_day,
    );
  }

  if (data.review_limit_per_day !== undefined) {
    updates.review_limit_per_day = clampNumber(
      data.review_limit_per_day,
      10,
      999,
      DEFAULT_SETTINGS.review_limit_per_day,
    );
  }

  if (data.session_size !== undefined) {
    updates.session_size = clampNumber(
      data.session_size,
      5,
      200,
      DEFAULT_SETTINGS.session_size,
    );
  }

  if (data.request_retention !== undefined) {
    updates.request_retention = clampDecimal(data.request_retention, 0.7, 0.97, DEFAULT_SETTINGS.request_retention);
  }

  if (data.card_order !== undefined) {
    updates.card_order = normalizeCardOrder(data.card_order);
  }

  if (data.exam_date !== undefined) {
    updates.exam_date = sanitizeExamDate(data.exam_date);
  }

  return updates;
}

async function readSettingsRow(userId: string, client: HanyuClient) {
  const { data, error } = await client
    .from('user_settings')
    .select(
      'user_id, theme, support_language, current_level, new_cards_per_day, review_limit_per_day, session_size, request_retention, card_order, exam_date, created_at, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error, 'No se pudieron cargar los ajustes');
  }

  return data;
}

async function ensureSettingsRow(userId: string, client: HanyuClient) {
  const { data, error } = await client
    .from('user_settings')
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS } as any, { onConflict: 'user_id' })
    .select(
      'user_id, theme, support_language, current_level, new_cards_per_day, review_limit_per_day, session_size, request_retention, card_order, exam_date, created_at, updated_at',
    )
    .single();

  if (error) {
    throw createRepositoryError(error, 'No se pudieron preparar los ajustes');
  }

  return data;
}

export async function getSettings(client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const row = (await readSettingsRow(userId, client)) || (await ensureSettingsRow(userId, client));
  return normalizeSettings(row);
}

export async function updateSettings(input: Record<string, unknown>, client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const existing = (await readSettingsRow(userId, client)) || (await ensureSettingsRow(userId, client));
  const updates = sanitizeUpdates(input || {});
  const payload = {
    user_id: userId,
    ...(existing as object),
    ...updates,
  };

  const { data, error } = await client
    .from('user_settings')
    .upsert(payload as any, { onConflict: 'user_id' })
    .select(
      'user_id, theme, support_language, current_level, new_cards_per_day, review_limit_per_day, session_size, request_retention, card_order, exam_date, created_at, updated_at',
    )
    .single();

  if (error) {
    throw createRepositoryError(error, 'No se pudieron guardar los ajustes');
  }

  return normalizeSettings(data);
}
