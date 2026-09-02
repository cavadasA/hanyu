import * as SQLite from 'expo-sqlite';
import { applySchema } from './schema';
import { ReviewStoreImpl } from './ReviewStore';
import type { ReviewStore } from './ReviewStore';
import { deriveDbName } from './dbName';
import type { FSRSParameters } from 'ts-fsrs';

/**
 * Opens (or creates) the per-user SQLite review store.
 *
 * userId is validated by deriveDbName before being embedded in the filename.
 * Only this file is permitted to import expo-sqlite; ReviewStore.ts and
 * schema.ts remain expo-sqlite-free so they can be unit-tested under Jest.
 */
export async function openReviewStore(
  userId: string,
  params?: FSRSParameters,
): Promise<ReviewStore> {
  const dbName = deriveDbName(userId); // throws on invalid userId

  const db = await SQLite.openDatabaseAsync(dbName);

  // Bridge the real SQLiteDatabase to our injectable DbHandle interface.
  // The cast is intentional: DbHandle is a structural subset of SQLiteDatabase,
  // and openReviewStore.ts is the single file permitted to import expo-sqlite.
  const handle = db as unknown as import('./ReviewStore').DbHandle;

  await applySchema(handle);

  const destroyDb = async (): Promise<void> => {
    await SQLite.deleteDatabaseAsync(dbName);
  };

  return new ReviewStoreImpl(handle, destroyDb, params);
}
