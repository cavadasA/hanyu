import { describe, expect, it } from 'vitest';
import { resolveGloss } from './gloss';

describe('resolveGloss', () => {
  const word = { meaning_en: 'to pay back; to return', meaning_es: 'devolver; restituir' };

  it('devuelve el español cuando el idioma de apoyo es español', () => {
    expect(resolveGloss(word, 'es')).toBe('devolver; restituir');
  });

  it('devuelve el inglés cuando el idioma de apoyo es inglés', () => {
    expect(resolveGloss(word, 'en')).toBe('to pay back; to return');
  });

  it('cae al inglés cuando falta el español', () => {
    expect(resolveGloss({ meaning_en: 'to return', meaning_es: null }, 'es')).toBe('to return');
  });

  it('cae al inglés cuando el español está en blanco', () => {
    expect(resolveGloss({ meaning_en: 'to return', meaning_es: '   ' }, 'es')).toBe('to return');
  });

  it('devuelve cadena vacía cuando no hay ninguna glosa', () => {
    expect(resolveGloss({}, 'es')).toBe('');
  });
});
