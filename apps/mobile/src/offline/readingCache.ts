import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReviewStore } from './ReviewStore';

let activeStore: ReviewStore | null = null;

export function setReadingCacheStore(store: ReviewStore | null): void {
  activeStore = store;
}

export const readingCache = {
  getItem(key: string): Promise<string | null> {
    return activeStore?.getReadingCache(key) ?? AsyncStorage.getItem(key);
  },
  setItem(key: string, value: string): Promise<void> {
    return activeStore?.setReadingCache(key, value) ?? AsyncStorage.setItem(key, value);
  },
};
