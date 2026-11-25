// packages/domain/src/analytics/reading.test.ts
import { comprehensionByKind, lookupsPer100Tokens, readingSpeed } from './reading';

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

  it('excluye sesiones con pinyin_shown null de ambos cubos', () => {
    // Si la lectura terminó antes de migrar la columna, no sabemos si tenía pinyin
    // o no. No debe caer en "sin pinyin" por defecto.
    const sessions = [
      { chars: 90, seconds: 180, pinyin_shown: null },
    ];

    const speed = readingSpeed(sessions);

    expect(speed.chars_per_minute).toBeNull();
    expect(speed.with_pinyin_chars_per_minute).toBeNull();
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

describe('comprehensionByKind', () => {
  it('con menos de 5 respuestas de un tipo no hay métrica de ese tipo', () => {
    const result = comprehensionByKind([{ score: 6, total: 9, inferential_score: 2, inferential_total: 4 }]);
    expect(result.inferential).toBeNull();
    expect(result.literal).toEqual({ correct: 4, total: 5, ratio: 0.8 });
    expect(comprehensionByKind([{ score: 3, total: 4 }]).literal).toBeNull();
  });

  it('6 respuestas inferenciales con 3 aciertos dan 0.5', () => {
    const result = comprehensionByKind([
      { score: 5, total: 6, inferential_score: 2, inferential_total: 3 },
      { score: 3, total: 6, inferential_score: 1, inferential_total: 3 },
    ]);
    expect(result.inferential).toEqual({ correct: 3, total: 6, ratio: 0.5 });
    expect(result.literal).toEqual({ correct: 5, total: 6, ratio: 5 / 6 });
  });

  it('los intentos anteriores a las inferenciales cuentan enteros como literales', () => {
    const result = comprehensionByKind([{ score: 4, total: 5 }]);
    expect(result.literal).toEqual({ correct: 4, total: 5, ratio: 0.8 });
    expect(result.inferential).toBeNull();
  });

  it('sin intentos no hay ninguna métrica, nunca un cero', () => {
    expect(comprehensionByKind([])).toEqual({ literal: null, inferential: null });
  });
});
