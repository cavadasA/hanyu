import type { HanyuClient } from '../client';

export { toDateString } from '../pure/dates';

export function createRepositoryError(error: any, fallbackMessage: string) {
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

export function parseJsonField(value: any, fallback: any = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return value;
}

export async function getRequiredUserId(client: HanyuClient) {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw createRepositoryError(error, 'Failed to resolve authenticated user');
  }

  const userId = data?.user?.id;
  if (!userId) {
    const authError = new Error('You must be signed in to use this feature.') as Error & {
      status?: number;
    };
    authError.status = 401;
    throw authError;
  }

  return userId;
}

export async function callRpcVariants(
  client: HanyuClient,
  rpcName: string,
  argumentVariants: Record<string, unknown>[]
) {
  let lastError;

  for (const args of argumentVariants) {
    const { data, error } = await (client.rpc as any)(rpcName, args);
    if (!error) {
      return data;
    }

    lastError = error;
  }

  throw createRepositoryError(lastError, `Failed to call ${rpcName}`);
}