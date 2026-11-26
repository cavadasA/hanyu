import { describe, expect, it } from 'vitest';
import { toUserMessage } from './errors';
import { createAuthError } from './auth';
import { createRepositoryError } from './repositories/shared';

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

  // El usuario veía mensajes técnicos del servidor en inglés («invalid input syntax for type
  // json», «Invalid login credentials»). El error de repositorio lleva aparte el texto para la
  // pantalla, en español, y el mensaje técnico sigue intacto para el código que lo examina.
  it('prefiere el texto para el usuario al mensaje técnico', () => {
    expect(toUserMessage({ message: 'invalid input syntax for type json', userMessage: 'No se pudo cargar el punto de gramática' }))
      .toBe('No se pudo cargar el punto de gramática');
  });

  it('un error de red sigue diciendo que no hay conexión aunque traiga texto propio', () => {
    expect(toUserMessage({ message: 'Failed to fetch', userMessage: 'No se pudieron cargar los mazos' }))
      .toBe('Sin conexión. Revisa la red e inténtalo de nuevo.');
  });
});

describe('createRepositoryError', () => {
  it('conserva el mensaje técnico y añade el texto para el usuario', () => {
    const error = createRepositoryError({ message: 'permission denied for table decks', code: '42501' }, 'No se pudieron cargar los mazos');
    expect(error.message).toBe('permission denied for table decks');
    expect(toUserMessage(error)).toBe('No se pudieron cargar los mazos');
  });
});

describe('errores de acceso', () => {
  it.each([
    ['invalid_credentials', 'El correo o la contraseña no son correctos.'],
    ['user_already_exists', 'Ya hay una cuenta con ese correo.'],
    ['email_not_confirmed', 'Confirma tu correo antes de entrar.'],
    ['weak_password', 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'],
    ['over_email_send_rate_limit', 'Has pedido demasiados correos. Espera un poco e inténtalo de nuevo.'],
  ])('%s se explica en español', (code, text) => {
    expect(toUserMessage(createAuthError({ message: 'Server says something', code, status: 400 }, 'No se pudo entrar'))).toBe(text);
  });

  it('un código desconocido usa el texto propio de la operación', () => {
    expect(toUserMessage(createAuthError({ message: 'Unexpected', code: 'unexpected_failure', status: 500 }, 'No se pudo entrar'))).toBe('No se pudo entrar');
  });
});

