const GENERIC = 'Something went wrong. Please try again.';

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
    return 'Your session expired. Sign in again to continue.';
  }

  if (status === 403) {
    return 'You do not have access to that data.';
  }

  if (message && /network|fetch failed|failed to fetch/i.test(message)) {
    return 'No connection. Check your network and try again.';
  }

  return message || GENERIC;
}
