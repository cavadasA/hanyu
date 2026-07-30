import type { HanyuClient } from './client';

function createAuthError(error: any, fallbackMessage: string) {
  const wrapped = new Error(error?.message || fallbackMessage) as Error & {
    status?: number;
    code?: string;
  };

  if (error?.status !== undefined) {
    wrapped.status = error.status;
  }

  if (error?.code) {
    wrapped.code = error.code;
  }

  return wrapped;
}

export async function getSession(client: HanyuClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw createAuthError(error, 'Failed to read session');
  }

  return data.session;
}

export async function signIn({ email, password }: { email: string; password: string }, client: HanyuClient) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw createAuthError(error, 'Failed to sign in');
  }

  return data;
}

export async function signUp({ email, password }: { email: string; password: string }, client: HanyuClient) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw createAuthError(error, 'Failed to sign up');
  }

  return data;
}

export async function sendPasswordReset(email: string, client: HanyuClient, redirectTo?: string) {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw createAuthError(error, 'Failed to send password reset email');
  }
}

export async function signOut(client: HanyuClient) {
  const { error } = await client.auth.signOut();
  if (error) {
    throw createAuthError(error, 'Failed to sign out');
  }
}

export function subscribeToAuthChanges(
  onChange: (payload: { event: string; session: unknown }) => void,
  client: HanyuClient
) {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    onChange({ event, session });
  });

  return () => {
    subscription.unsubscribe();
  };
}