// packages/domain/src/analytics/reading.test.ts
import { lookupsPer100Tokens, readingSpeed } from './reading';

describe('readingSpeed', () => {
  it('calcula caracteres por minuto', () => {
    const sessions = [{ chars: 90, seconds: 180, pinyin_shown: false }];

    expect(readingSpeed(sessions).chars_per_minute).toBe(30);
  });

  it('separa las lecturas con pinyin de las que no', () => {
    // Con pinyin visible se está leyendo una transcripción, no hanzi.
    const sessions = [
      { chars: 90, seconds: 180, pinyin_shown: false },
      { chars: 90, seconds: 90, pinyin_shown: true },
    ];

    const speed = readingSpeed(sessions);

    expect(speed.chars_per_minute).toBe(30);
    expect(speed.with_pinyin_chars_per_minute).toBe(60);
  });

  it('descarta sesiones absurdamente rápidas', () => {
    // Abrir y cerrar una lectura no es haberla leído; contarlo dispararía la
    // media y haría la métrica inútil.
    const sessions = [{ chars: 90, seconds: 2, pinyin_shown: false }];

    expect(readingSpeed(sessions).chars_per_minute).toBeNull();
  });

  it('devuelve null sin sesiones en vez de cero', () => {
    expect(readingSpeed([]).chars_per_minute).toBeNull();
  });
});

describe('lookupsPer100Tokens', () => {
  it('normaliza por longitud para poder comparar lecturas', () => {
    expect(lookupsPer100Tokens(6, 200)).toBe(3);
  });

  it('no divide por cero', () => {
    expect(lookupsPer100Tokens(0, 0)).toBeNull();
  });
});
