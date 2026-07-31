/**
 * OfflineReviewProvider – React context that owns the per-user ReviewStore lifecycle.
 *
 * Lifecycle rules:
 * - While loading or no user: service=null, ready=false.
 * - Once a userId appears: open the store, instantiate OfflineReviewService, set ready=true.
 * - On user id change (logout or account switch): run the pendingCount-gated cleanup on
 *   the old store, then open a new one if a new userId is available.
 * - On provider UNMOUNT (e.g. hot reload, app teardown): always call close(), never destroy().
 *   Unmounting is not a user action and must never delete on-disk data.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { randomUUID } from 'expo-crypto';
import { getData } from '../lib/data';
import { useSession } from '../session/SessionProvider';
import { openReviewStore } from './openReviewStore';
import { OfflineReviewService } from './OfflineReviewService';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface OfflineReviewValue {
  service: OfflineReviewService | null;
  ready: boolean;
  pendingCount: number;
  refreshPendingCount: () => Promise<void>;
}

const noop = async () => undefined;

const OfflineReviewContext = createContext<OfflineReviewValue>({
  service: null,
  ready: false,
  pendingCount: 0,
  refreshPendingCount: noop,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OfflineReviewProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const userId = loading ? undefined : (session?.user?.id ?? undefined);

  const [service, setService] = useState<OfflineReviewService | null>(null);
  const [ready, setReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Live reference to the currently-active service, used by cleanup and callbacks
  // without needing to capture stale closure values.
  const serviceRef = useRef<OfflineReviewService | null>(null);

  // Set to true by the empty-deps effect's cleanup, which React calls *before*
  // the userId-effect cleanup when the component unmounts.  This lets the
  // userId-effect cleanup distinguish "unmount" (→ close) from "user changed" (→
  // pendingCount-gated destroy-or-close).
  const unmountingRef = useRef(false);

  // -----------------------------------------------------------------------
  // Effect 1: mark component as unmounting (runs cleanup first on unmount).
  // MUST be declared before Effect 2 so its cleanup runs first.
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Effect 2: open/close the store when userId changes.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (loading) return; // Wait for session to resolve before doing anything.

    let cancelled = false;

    if (!userId) {
      // No user — nothing to open; just ensure state is reset.
      setService(null);
      setReady(false);
      setPendingCount(0);
      return;
    }

    // Open a new store for this userId.
    openReviewStore(userId)
      .then((store) => {
        if (cancelled) {
          // Provider re-rendered (or unmounted) while we were awaiting — just
          // close the freshly-opened store and discard it.
          store.close().catch(() => undefined);
          return;
        }
        const svc = new OfflineReviewService({
          store,
          getDueCardsOnline: (limit) => getData().flashcards.getDueCards(limit),
          now: () => new Date(),
          uuid: () => randomUUID(),
        });
        serviceRef.current = svc;
        setService(svc);
        setReady(true);
      })
      .catch(() => {
        // Opening the store failed — remain not ready.
      });

    return () => {
      cancelled = true;

      const svc = serviceRef.current;
      if (!svc) return;

      // Clear the ref and reset UI state immediately so subsequent renders see
      // no service. The async cleanup below happens in the background.
      serviceRef.current = null;
      setService(null);
      setReady(false);
      setPendingCount(0);

      if (unmountingRef.current) {
        // Provider is unmounting (e.g. hot reload, app teardown) — always close,
        // never destroy.  Unmounting is NOT a user action; we must not delete data.
        svc.close().catch(() => undefined);
      } else {
        // User id changed (logout or account switch) — apply the safety gate:
        // only destroy the local DB if there are no pending (unsynced) reviews.
        //
        // Rationale: destroying a DB that contains reviews the server has never
        // seen would permanently and silently lose the user's graded work.
        // If the same user signs back in, openReviewStore reopens the same file
        // and the pending reviews will still be there for the sync engine to flush.
        svc
          .pendingCount()
          .then((count) => {
            if (count === 0) {
              return svc.destroy();
            }
            return svc.close();
          })
          .catch(() => {
            // If we can't read pendingCount, close conservatively to avoid data loss.
            svc.close().catch(() => undefined);
          });
      }
    };
  }, [userId, loading]);

  // -----------------------------------------------------------------------
  // refreshPendingCount — reads a fresh count from the service.
  // -----------------------------------------------------------------------
  const refreshPendingCount = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    const count = await svc.pendingCount();
    setPendingCount(count);
  }, []);

  return (
    <OfflineReviewContext.Provider
      value={{ service, ready, pendingCount, refreshPendingCount }}
    >
      {children}
    </OfflineReviewContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOfflineReview(): OfflineReviewValue {
  return useContext(OfflineReviewContext);
}
