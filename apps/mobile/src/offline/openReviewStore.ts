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
  // A serialized queue ensures only one transaction runs at a time on this SQLite connection,
  // preventing "cannot start a transaction within a transaction" and subsequent rollback crashes.
  let txQueue = Promise.resolve();

  const withTransactionAsync = async (task: () => Promise<void>): Promise<void> => {
    const prev = txQueue;
    let release: () => void;
    txQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev.catch(() => undefined);

    let inTx = false;
    try {
      await db.execAsync('BEGIN');
      inTx = true;
      await task();
      await db.execAsync('COMMIT');
      inTx = false;
    } catch (originalError) {
      if (inTx) {
        try {
          const currentlyInTx = await db.isInTransactionAsync().catch(() => true);
          if (currentlyInTx) {
            await db.execAsync('ROLLBACK');
          }
        } catch {
          // Never mask the original error with a secondary rollback failure
        }
      }
      throw originalError;
    } finally {
      release!();
    }
  };

  const handle: import('./ReviewStore').DbHandle = {
    execAsync: (sql: string) => db.execAsync(sql),
    runAsync: async (sql: string, params: unknown[]) => {
      await db.runAsync(sql, params as any);
    },
    getAllAsync: <T>(sql: string, params: unknown[]) => db.getAllAsync<T>(sql, params as any),
    getFirstAsync: <T>(sql: string, params: unknown[]) => db.getFirstAsync<T>(sql, params as any),
    withTransactionAsync,
    closeAsync: () => db.closeAsync(),
  };

  await applySchema(handle);

  const destroyDb = async (): Promise<void> => {
    await SQLite.deleteDatabaseAsync(dbName);
  };

  return new ReviewStoreImpl(handle, destroyDb, params);
}
