const GENERIC = 'Algo ha fallado. Inténtalo de nuevo.';

interface MaybeRepositoryError {
  status?: number;
  code?: string;
  message?: string;
  /** Texto para la pantalla, en español. El message suele ser técnico y en inglés. */
  userMessage?: string;
}

export function toUserMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return GENERIC;
  }

  const { status, message, userMessage } = error as MaybeRepositoryError;

  if (status === 401) {
    return 'Tu sesión ha caducado. Vuelve a entrar para continuar.';
  }

  if (status === 403) {
    return 'No tienes acceso a esos datos.';
  }

  if (message && /network|fetch failed|failed to fetch/i.test(message)) {
    return 'Sin conexión. Revisa la red e inténtalo de nuevo.';
  }

  return userMessage || message || GENERIC;
}
