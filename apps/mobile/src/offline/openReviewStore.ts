import * as SQLite from 'expo-sqlite';
import { applySchema } from './schema';
import { ReviewStoreImpl } from './ReviewStore';
import type { ReviewStore } from './ReviewStore';

const PATH_UNSAFE = /[/\\.:]/;

/**
 * Opens (or creates) the per-user SQLite review store.
 *
 * userId is validated before being embedded in the filename; it must be a non-empty
 * string that contains no path-unsafe characters (/, \, ., :) to prevent directory
 * traversal or ambiguous filenames.
 */
export async function openReviewStore(userId: string): Promise<ReviewStore> {
  if (!userId || typeof userId !== 'string' || PATH_UNSAFE.test(userId)) {
    throw new Error(
      `Invalid userId "${userId}": must be a non-empty string with no path-unsafe characters (/ \\ . :)`,
    );
  }

  const dbName = `hanyu-review-${userId}.db`;
  const db = await SQLite.openDatabaseAsync(dbName);

  // Bridge the real SQLiteDatabase to our injectable DbHandle interface.
  // The cast is intentional: DbHandle is a structural subset of SQLiteDatabase,
  // and openReviewStore.ts is the single file permitted to import expo-sqlite.
  const handle = db as unknown as import('./ReviewStore').DbHandle;

  await applySchema(handle);

  const destroyDb = async (): Promise<void> => {
    await SQLite.deleteDatabaseAsync(dbName);
  };

  return new ReviewStoreImpl(handle, destroyDb);
}
