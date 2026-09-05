import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type HanyuClient = SupabaseClient<Database>;

export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface ReadingCache {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

export interface HanyuDataConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage?: SessionStorage;
  readingCache?: ReadingCache;
  detectSessionInUrl?: boolean;
  passwordResetRedirectTo?: string;
}

export function createSupabaseClient(config: HanyuDataConfig): HanyuClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Provide supabaseUrl and supabaseAnonKey to createHanyuData.'
    );
  }

  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
      ...(config.storage ? { storage: config.storage as never } : {}),
    },
  });
}
