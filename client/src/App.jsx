import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Exercises from './pages/Exercises';
import Flashcards from './pages/Flashcards';
import Grammar from './pages/Grammar';
import Readings from './pages/Readings';
import Settings from './pages/Settings';
import Words from './pages/Words';
import { getSession, signOut, subscribeToAuthChanges } from './services/auth';
import { useAppStore } from './stores/appStore';

function resolveTheme(theme) {
  if (theme !== 'system') {
    return theme;
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

export default function App() {
  const { theme } = useAppStore();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    };

    applyTheme();

    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme();

    if (media.addEventListener) {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [theme]);

  useEffect(() => {
    let disposed = false;

    async function bootstrapSession() {
      try {
        const activeSession = await getSession();
        if (!disposed) {
          setSession(activeSession);
        }
      } catch (error) {
        if (!disposed) {
          setAuthError(error.message || 'Failed to initialize authentication.');
        }
      } finally {
        if (!disposed) {
          setAuthLoading(false);
        }
      }
    }

    bootstrapSession();

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToAuthChanges(({ session: nextSession }) => {
        if (!disposed) {
          setSession(nextSession);
          setAuthLoading(false);
        }
      });
    } catch (error) {
      if (!disposed) {
        setAuthError(error.message || 'Failed to subscribe to authentication changes.');
        setAuthLoading(false);
      }
    }

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
      setSession(null);
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  }

  return (
    <BrowserRouter>
      {authLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
          Loading session...
        </div>
      ) : session ? (
        <Routes>
          <Route element={<Layout userEmail={session.user?.email} onSignOut={handleSignOut} />}>
            <Route index element={<Dashboard />} />
            <Route path="flashcards" element={<Flashcards />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="readings" element={<Readings />} />
            <Route path="readings/:id" element={<Readings />} />
            <Route path="grammar" element={<Grammar />} />
            <Route path="words" element={<Words />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      ) : (
        <AuthPage onAuthenticated={setSession} initialError={authError} />
      )}
    </BrowserRouter>
  );
}