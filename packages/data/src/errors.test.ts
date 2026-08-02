import { describe, expect, it } from 'vitest';
import { toUserMessage } from './errors';

describe('toUserMessage', () => {
  it('asks the user to sign in again on 401', () => {
    expect(toUserMessage({ status: 401, message: 'JWT expired' })).toBe(
      'Your session expired. Sign in again to continue.'
    );
  });

  it('reports a permission problem on 403', () => {
    expect(toUserMessage({ status: 403, message: 'permission denied' })).toBe(
      'You do not have access to that data.'
    );
  });

  it('reports a connection problem for network failures', () => {
    expect(toUserMessage(new TypeError('Network request failed'))).toBe(
      'No connection. Check your network and try again.'
    );
  });

  it('passes through a specific Supabase message', () => {
    expect(toUserMessage({ message: 'Failed to load due cards' })).toBe(
      'Failed to load due cards'
    );
  });

  it('falls back to a generic message for unknown values', () => {
    expect(toUserMessage(null)).toBe('Something went wrong. Please try again.');
    expect(toUserMessage({})).toBe('Something went wrong. Please try again.');
  });
});
