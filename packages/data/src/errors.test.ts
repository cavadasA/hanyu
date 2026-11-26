import { describe, expect, it } from 'vitest';
import { toUserMessage } from './errors';

describe('toUserMessage', () => {
  it('asks the user to sign in again on 401', () => {
    expect(toUserMessage({ status: 401, message: 'JWT expired' })).toBe(
      'Tu sesión ha caducado. Vuelve a entrar para continuar.'
    );
  });

  it('reports a permission problem on 403', () => {
    expect(toUserMessage({ status: 403, message: 'permission denied' })).toBe(
      'No tienes acceso a esos datos.'
    );
  });

  it('reports a connection problem for network failures', () => {
    expect(toUserMessage(new TypeError('Network request failed'))).toBe(
      'Sin conexión. Revisa la red e inténtalo de nuevo.'
    );
  });

  it('passes through a specific Supabase message', () => {
    expect(toUserMessage({ message: 'Failed to load due cards' })).toBe(
      'Failed to load due cards'
    );
  });

  it('falls back to a generic message for unknown values', () => {
    expect(toUserMessage(null)).toBe('Algo ha fallado. Inténtalo de nuevo.');
    expect(toUserMessage({})).toBe('Algo ha fallado. Inténtalo de nuevo.');
  });
});
