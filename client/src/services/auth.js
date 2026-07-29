import { getSupabaseClient } from './supabaseClient';

function createAuthError(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage);

  if (error?.status !== undefined) {
    wrapped.status = error.status;
  }

  if (error?.code) {
    wrapped.code = error.code;
  }

  return wrapped;
}

export async function getSession(client = getSupabaseClient()) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw createAuthError(error, 'Failed to read session');
  }

  return data.session;
}

export async function signIn({ email, password }, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw createAuthError(error, 'Failed to sign in');
  }

  return data;
}

export async function signUp({ email, password }, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw createAuthError(error, 'Failed to sign up');
  }

  return data;
}

export async function sendPasswordReset(email, client = getSupabaseClient()) {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw createAuthError(error, 'Failed to send password reset email');
  }
}

export async function signOut(client = getSupabaseClient()) {
  const { error } = await client.auth.signOut();
  if (error) {
    throw createAuthError(error, 'Failed to sign out');
  }
}

export function subscribeToAuthChanges(onChange, client = getSupabaseClient()) {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    onChange({ event, session });
  });

  return () => {
    subscription.unsubscribe();
  };
}