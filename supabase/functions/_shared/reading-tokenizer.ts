// El tokenizador vive en packages/domain. Deno lo consume por npm:; tener dos
// copias haría que el texto se partiese distinto en el validador y en la app.
export { tokenizeReading, type ReadingToken, type DictionaryEntry } from 'npm:@hanyu/domain';
