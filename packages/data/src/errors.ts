const GENERIC = 'Algo ha fallado. Inténtalo de nuevo.';

interface MaybeRepositoryError {
  status?: number;
  code?: string;
  message?: string;
}

export function toUserMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return GENERIC;
  }

  const { status, message } = error as MaybeRepositoryError;

  if (status === 401) {
    return 'Tu sesión ha caducado. Vuelve a entrar para continuar.';
  }

  if (status === 403) {
    return 'No tienes acceso a esos datos.';
  }

  if (message && /network|fetch failed|failed to fetch/i.test(message)) {
    return 'Sin conexión. Revisa la red e inténtalo de nuevo.';
  }

  return message || GENERIC;
}
