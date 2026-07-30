import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getData } from '../lib/data';

type Session = { user?: { id: string; email?: string } } | null;

interface SessionValue {
  session: Session;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  loading: true,
  signOut: async () => undefined,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    const data = getData();

    data.auth
      .getSession()
      .then((active) => {
        if (!disposed) {
          setSession((active as Session) ?? null);
        }
      })
      .catch(() => {
        if (!disposed) {
          setSession(null);
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    const unsubscribe = data.auth.subscribeToAuthChanges(({ session: next }) => {
      if (!disposed) {
        setSession((next as Session) ?? null);
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const auth = getData().client.auth;

    const apply = (state: AppStateStatus) => {
      if (state === 'active') {
        auth.startAutoRefresh();
      } else {
        auth.stopAutoRefresh();
      }
    };

    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);

    return () => {
      subscription.remove();
      auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await getData().auth.signOut();
        setSession(null);
      },
    }),
    [session, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
