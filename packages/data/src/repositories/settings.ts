import type { HanyuClient } from '../client';
import type { Database } from '../database.types';
import { createRepositoryError, getRequiredUserId } from './shared';

const DEFAULT_SETTINGS = {
  theme: 'light',
  support_language: 'es',
  current_level: 2,
  cards_per_day: 20,
  max_reviews_per_session: 100,
  card_order: 'due',
  ai_provider: 'none',
};

const ALLOWED_THEMES = new Set(['light', 'dark', 'system']);
const ALLOWED_CARD_ORDER = new Set(['due', 'frequency']);
const ALLOWED_AI_PROVIDERS = new Set(['none', 'deepseek', 'gemini']);
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
    cards_per_day: clampNumber(row?.cards_per_day, 1, 100, DEFAULT_SETTINGS.cards_per_day),
    max_reviews_per_session: clampNumber(
      row?.max_reviews_per_session,
      1,
      300,
      DEFAULT_SETTINGS.max_reviews_per_session
    ),
    card_order: normalizeCardOrder(row?.card_order),
    ai_provider: ALLOWED_AI_PROVIDERS.has(row?.ai_provider) ? row.ai_provider : DEFAULT_SETTINGS.ai_provider,
    api_key: '',
    api_key_configured: false,
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)));
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

  if (data.cards_per_day !== undefined) {
    updates.cards_per_day = clampNumber(data.cards_per_day, 1, 100, DEFAULT_SETTINGS.cards_per_day);
  }

  if (data.max_reviews_per_session !== undefined) {
    updates.max_reviews_per_session = clampNumber(
      data.max_reviews_per_session,
      1,
      300,
      DEFAULT_SETTINGS.max_reviews_per_session
    );
  }

  if (data.card_order !== undefined) {
    updates.card_order = normalizeCardOrder(data.card_order);
  }

  if (data.ai_provider !== undefined) {
    updates.ai_provider = ALLOWED_AI_PROVIDERS.has(data.ai_provider as string)
      ? data.ai_provider
      : DEFAULT_SETTINGS.ai_provider;
  }

  return updates;
}

async function readSettingsRow(userId: string, client: HanyuClient) {
  const { data, error } = await client
    .from('user_settings')
    .select(
      'user_id, theme, support_language, current_level, cards_per_day, max_reviews_per_session, card_order, ai_provider, created_at, updated_at'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error, 'Failed to load settings');
  }

  return data;
}

async function ensureSettingsRow(userId: string, client: HanyuClient) {
  const { data, error } = await client
    .from('user_settings')
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS } as any, { onConflict: 'user_id' })
    .select(
      'user_id, theme, support_language, current_level, cards_per_day, max_reviews_per_session, card_order, ai_provider, created_at, updated_at'
    )
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to initialize settings');
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
      'user_id, theme, support_language, current_level, cards_per_day, max_reviews_per_session, card_order, ai_provider, created_at, updated_at'
    )
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to save settings');
  }

  return normalizeSettings(data);
}
