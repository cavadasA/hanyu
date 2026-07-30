import { useMemo, useState } from 'react';
import { sendPasswordReset, signIn, signUp } from '../services/auth';

const MODES = [
  { value: 'login', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
  { value: 'reset', label: 'Reset password' },
];

export default function Auth({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(initialError || '');

  const title = useMemo(() => {
    if (mode === 'signup') {
      return 'Create your Hanyu account';
    }

    if (mode === 'reset') {
      return 'Reset your password';
    }

    return 'Sign in to continue';
  }, [mode]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim()) {
      setMessage('Email is required.');
      return;
    }

    if (mode !== 'reset' && !password) {
      setMessage('Password is required.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (mode === 'reset') {
        await sendPasswordReset(email.trim());
        setMessage('Password reset link sent. Check your email inbox.');
        return;
      }

      if (mode === 'signup') {
        const result = await signUp({ email: email.trim(), password });
        if (result.session) {
          onAuthenticated(result.session);
          return;
        }

        setMessage('Account created. Confirm your email, then sign in.');
        return;
      }

      const result = await signIn({ email: email.trim(), password });
      if (!result.session) {
        setMessage('Signed in, but no active session was returned. Try again.');
        return;
      }

      onAuthenticated(result.session);
    } catch (error) {
      setMessage(error.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text)]">
      <div className="mx-auto max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Hanyu</p>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Continue your daily Chinese loop across web and mobile.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl bg-[var(--color-bg)] p-1">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setMode(item.value);
                setMessage('');
              }}
              className={`rounded-lg px-2 py-2 text-sm font-medium ${
                mode === item.value ? 'bg-[var(--color-vermilion)] text-white' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Email</span>
            <input
              aria-label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              placeholder="you@example.com"
            />
          </label>

          {mode !== 'reset' ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium">Password</span>
              <input
                aria-label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                placeholder="••••••••"
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--color-vermilion)] px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            {loading
              ? 'Working...'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : 'Sign in'}
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}