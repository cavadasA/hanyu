// Plan 13, Tarea 6: qué ejercicios de expresión entran en una sesión. Puro: quien lo usa
// le pasa lo que hay vencido y lo que el dispositivo puede corregir.
//
// - Un ejercicio cuyo evaluador no está disponible no se ofrece (regla del Plan 6).
// - La escritura vencida se practica en `quiz`; `guided` es enseñanza y no entra en la cola.
// - Como mucho una tarea comunicativa por sesión de Learn, al final.
// - El modo Exam no lleva práctica de expresión: la escritura que evalúa el HSK 2 (书写)
//   la sirve el simulacro del Plan 12.

export type StudyModeName = 'learn' | 'review' | 'exam';

export type ExpressionItem<W, P, T> =
  | { kind: 'writing'; mode: 'quiz'; item: W }
  | { kind: 'pronunciation'; item: P }
  | { kind: 'communicative'; task: T };

export interface ExpressionSessionInput<W, P, T> {
  mode: StudyModeName;
  pronunciationAvailable: boolean;
  communicativeAvailable: boolean;
  writing: W[];
  pronunciation: P[];
  communicative: T[];
}

export function planExpressionSession<W, P, T>(input: ExpressionSessionInput<W, P, T>): Array<ExpressionItem<W, P, T>> {
  if (input.mode === 'exam') return [];

  const writing = input.writing.map((item): ExpressionItem<W, P, T> => ({ kind: 'writing', mode: 'quiz', item }));
  const pronunciation = input.pronunciationAvailable
    ? input.pronunciation.map((item): ExpressionItem<W, P, T> => ({ kind: 'pronunciation', item }))
    : [];

  const plan: Array<ExpressionItem<W, P, T>> = [];
  for (let index = 0; index < Math.max(writing.length, pronunciation.length); index += 1) {
    if (writing[index]) plan.push(writing[index]);
    if (pronunciation[index]) plan.push(pronunciation[index]);
  }

  if (input.mode === 'learn' && input.communicativeAvailable && input.communicative.length > 0) {
    plan.push({ kind: 'communicative', task: input.communicative[0] });
  }
  return plan;
}
