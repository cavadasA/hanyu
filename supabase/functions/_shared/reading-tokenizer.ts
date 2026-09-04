// El tokenizador vive en packages/domain. La Edge Function importa el fuente
// compartido por ruta relativa: @hanyu/domain es un paquete privado del
// monorepo y no existe como dependencia publicable de npm/Deno.
export { tokenizeReading, type ReadingToken, type DictionaryEntry } from '../../../packages/domain/src/reading/tokenize.ts';
