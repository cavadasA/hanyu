// Simulacro HSK 2 (formato 3.0, Plan 12). La forma llega del servidor sin respuestas y el
// intento se corrige en el servidor (get_exam_form / submit_exam_attempt): el cliente
// nunca sabe qué opción era la buena hasta que ha entregado.
import type { ExamGroup, ExamPartCode, ExamSectionCode, TimelineEntry } from '@hanyu/domain';
import type { HanyuClient } from '../client';
import { createRepositoryError } from './shared';

/**
 * Un grupo tal como lo sirve get_exam_form: igual que en el repositorio pero sin `answer`
 * en sus preguntas; el ejemplo trae su respuesta como `shown_answer`.
 */
export type ServedExamGroup = ExamGroup & { slug: string };

export interface ExamMedia {
  /** Clips de 听力 por clave de la línea de tiempo: `media/<sha256>.m4a`. */
  audio: Record<string, { path: string; duration_ms: number }>;
  images: Record<string, { path: string }>;
  /** SVG de los caracteres incompletos de 书写 1, por `<slug>:<índice|example>`. */
  characters: Record<string, string>;
}

export interface ServedExamForm {
  level: number;
  code: string;
  content: { code: string; level: number; groups: ServedExamGroup[] };
  timeline: TimelineEntry[];
  media: ExamMedia;
  /** El usuario ya completó esta forma: el resultado no cuenta como estimación de nivel. */
  repeated: boolean;
}

export type ExamScope = 'part' | 'section' | 'full';
/** Índice de la opción elegida, carácter escrito en 书写 2, o null si no se respondió. */
export type ExamResponse = number | string | null;

export interface ExamAttemptInput {
  level: number;
  form_code: string;
  scope: ExamScope;
  /** La parte (`'R2'`) con scope 'part'; la sección (`'reading'`) con scope 'section'. */
  part_code?: ExamPartCode | ExamSectionCode | null;
  started_at: string;
  answers: Record<string, ExamResponse[]>;
}

export interface ScoreLine {
  correct: number;
  total: number;
  percent: number;
}

export interface ExamAttempt {
  id: string;
  level: number;
  form_code: string;
  scope: ExamScope;
  part_code: string | null;
  started_at: string;
  finished_at: string;
  answers: Record<string, ExamResponse[]>;
  section_scores: Partial<Record<ExamSectionCode, ScoreLine>>;
  part_scores: Partial<Record<ExamPartCode, ScoreLine>>;
  total_percent: number;
  repeated: boolean;
}

export async function getExamForm(level: number, form: string | null, client: HanyuClient): Promise<ServedExamForm | null> {
  const { data, error } = await (client.rpc as any)('get_exam_form', { p_level: level, p_form: form });
  if (error) throw createRepositoryError(error, 'No se pudo cargar el simulacro');
  return (data as ServedExamForm | null) ?? null;
}

/**
 * Las respuestas por índice de pregunta: un array por grupo de la forma, con null en
 * las que no se respondieron. Ninguna pregunta falta: el servidor las cuenta todas.
 */
export function answersByIndex(
  form: ServedExamForm,
  picks: Record<string, Record<number, ExamResponse>>,
): Record<string, ExamResponse[]> {
  return Object.fromEntries(form.content.groups.map(group => [
    group.slug,
    group.items.map((_, index) => picks[group.slug]?.[index] ?? null),
  ]));
}

export async function submitExamAttempt(attempt: ExamAttemptInput, client: HanyuClient): Promise<ExamAttempt> {
  const { data, error } = await (client.rpc as any)('submit_exam_attempt', {
    p_attempt: { ...attempt, part_code: attempt.part_code ?? null },
  });
  if (error) throw createRepositoryError(error, 'No se pudo entregar el simulacro');
  return data as ExamAttempt;
}

export async function listExamAttempts(level: number, client: HanyuClient): Promise<ExamAttempt[]> {
  const { data, error } = await (client.from as any)('exam_attempt')
    .select('*')
    .eq('level', level)
    .order('finished_at', { ascending: true });
  if (error) throw createRepositoryError(error, 'No se pudieron leer los simulacros');
  return (data ?? []) as ExamAttempt[];
}
