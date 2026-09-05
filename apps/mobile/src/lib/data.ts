import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHanyuData, type HanyuData } from '@hanyu/data';
import { readingCache } from '../offline/readingCache';

let cached: HanyuData | null = null;

export function getData(): HanyuData {
  if (!cached) {
    cached = createHanyuData({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      storage: AsyncStorage,
      readingCache,
      detectSessionInUrl: false,
    });
  }

  return cached;
}

export function resetData(): void {
  cached = null;
}
