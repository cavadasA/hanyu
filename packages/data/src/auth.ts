import type { HanyuClient } from './client';

/** Los códigos de error de Supabase Auth que puede provocar quien usa la app. */
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  user_already_exists: 'Ya hay una cuenta con ese correo.',
  email_exists: 'Ya hay una cuenta con ese correo.',
  email_not_confirmed: 'Confirma tu correo antes de entrar.',
  weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
  over_email_send_rate_limit: 'Has pedido demasiados correos. Espera un poco e inténtalo de nuevo.',
  over_request_rate_limit: 'Demasiados intentos. Espera un poco e inténtalo de nuevo.',
  validation_failed: 'Revisa el correo y la contraseña.',
};

export function createAuthError(error: any, fallbackMessage: string) {
  const wrapped = new Error(error?.message || fallbackMessage) as Error & {
    status?: number;
    code?: string;
    userMessage?: string;
  };
  wrapped.userMessage = (error?.code && AUTH_MESSAGES[error.code]) || fallbackMessage;

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
    throw createAuthError(error, 'No se pudo leer la sesión');
  }

  return data.session;
}

export async function signIn({ email, password }: { email: string; password: string }, client: HanyuClient) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw createAuthError(error, 'No se pudo entrar');
  }

  return data;
}

export async function signUp({ email, password }: { email: string; password: string }, client: HanyuClient) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw createAuthError(error, 'No se pudo crear la cuenta');
  }

  return data;
}

export async function sendPasswordReset(email: string, client: HanyuClient, redirectTo?: string) {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw createAuthError(error, 'No se pudo enviar el correo para cambiar la contraseña');
  }
}

export async function signOut(client: HanyuClient) {
  const { error } = await client.auth.signOut();
  if (error) {
    throw createAuthError(error, 'No se pudo cerrar la sesión');
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