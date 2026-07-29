export function createRepositoryError(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage);

  if (error?.status !== undefined) {
    wrapped.status = error.status;
  }

  if (error?.code) {
    wrapped.code = error.code;
  }

  return wrapped;
}

export function parseJsonField(value, fallback = null) {
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

export async function getRequiredUserId(client) {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw createRepositoryError(error, 'Failed to resolve authenticated user');
  }

  const userId = data?.user?.id;
  if (!userId) {
    const authError = new Error('You must be signed in to use this feature.');
    authError.status = 401;
    throw authError;
  }

  return userId;
}

export function toDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function callRpcVariants(client, rpcName, argumentVariants) {
  let lastError;

  for (const args of argumentVariants) {
    const { data, error } = await client.rpc(rpcName, args);
    if (!error) {
      return data;
    }

    lastError = error;
  }

  throw createRepositoryError(lastError, `Failed to call ${rpcName}`);
}