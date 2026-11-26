// Expresión (Plan 13): los dos evaluadores que necesitan red, detrás de Edge Functions.
// Ninguna clave de proveedor llega al cliente. Si una función no está configurada, no
// responde o devuelve algo que no es lo pedido, el resultado es «no disponible» o «sin
// corregir»: nunca se inventa una nota.
import { applyReview, emptyState, schedulingParams, type CommunicativeContext, type CommunicativeTask, type Grade, type SchedulingState } from '@hanyu/domain';
import type { HanyuClient } from '../client';
import { getSettings } from './settings';
import { createRepositoryError } from './shared';

export interface PronunciationAssessment {
  accuracy: number;
  fluency: number;
  completeness: number;
  syllables: Array<{ syllable: string; accuracy: number }>;
}

export type AssessOutcome =
  | { status: 'scored'; assessment: PronunciationAssessment }
  | { status: 'unavailable'; reason: string };

export type GradeOutcome =
  | { status: 'graded'; passed: boolean; intents: boolean[]; feedback_es: string }
  | { status: 'ungraded' }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

interface InvokeFailure {
  status: number | null;
  body: any;
}

async function invoke(client: HanyuClient, name: string, body: unknown): Promise<{ data: any } | { failure: InvokeFailure }> {
  const functions = (client as any).functions;
  if (!functions || typeof functions.invoke !== 'function') return { failure: { status: null, body: null } };
  try {
    const { data, error } = await functions.invoke(name, { body });
    if (!error) return { data };
    // Se reconoce por su forma y no con instanceof: en React Native la Response
    // del fetch del cliente no es instancia del Response global, y el motivo
    // (p. ej. not_configured) se perdía como si fuera un fallo de red.
    const context = error.context;
    const response: Response | undefined =
      context && typeof context.status === 'number' && typeof context.json === 'function' ? context : undefined;
    if (!response) return { failure: { status: null, body: null } };
    const payload = await response.json().catch(() => null);
    return { failure: { status: response.status, body: payload } };
  } catch {
    return { failure: { status: null, body: null } };
  }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function asAssessment(data: any): PronunciationAssessment | null {
  if (!data || !isNumber(data.accuracy) || !isNumber(data.fluency) || !isNumber(data.completeness)) return null;
  if (!Array.isArray(data.syllables) || data.syllables.length === 0) return null;
  if (!data.syllables.every((entry: any) => typeof entry?.syllable === 'string' && isNumber(entry?.accuracy))) return null;
  return {
    accuracy: data.accuracy,
    fluency: data.fluency,
    completeness: data.completeness,
    syllables: data.syllables.map((entry: any) => ({ syllable: entry.syllable, accuracy: entry.accuracy })),
  };
}

/** Pronunciación, nivel 2: Azure Pronunciation Assessment, puntuación por sílaba. */
export async function assessPronunciation(
  input: { audio_base64: string; reference_text: string },
  client: HanyuClient,
): Promise<AssessOutcome> {
  const result = await invoke(client, 'pronunciation-assess', input);
  if ('failure' in result) {
    const reason = typeof result.failure.body?.reason === 'string' ? result.failure.body.reason : result.failure.status === null ? 'network' : `http_${result.failure.status}`;
    return { status: 'unavailable', reason };
  }
  const assessment = asAssessment(result.data);
  return assessment ? { status: 'scored', assessment } : { status: 'unavailable', reason: 'invalid_response' };
}

/** Tareas comunicativas: el evaluador LLM decide si la respuesta cumple cada intención. */
export async function gradeCommunicative(
  input: { task_slug: string; answer: string },
  client: HanyuClient,
): Promise<GradeOutcome> {
  const result = await invoke(client, 'grade-communicative', input);
  if ('failure' in result) {
    const { status, body } = result.failure;
    if (status === 422 && Array.isArray(body?.reasons)) return { status: 'rejected', reasons: body.reasons.map(String) };
    const reason = typeof body?.reason === 'string' ? body.reason : status === null ? 'network' : `http_${status}`;
    return { status: 'unavailable', reason };
  }

  const data = result.data;
  if (
    data?.status === 'graded'
    && typeof data.passed === 'boolean'
    && Array.isArray(data.intents)
    && data.intents.every((intent: unknown) => typeof intent === 'boolean')
    && typeof data.feedback_es === 'string'
  ) {
    return { status: 'graded', passed: data.passed, intents: data.intents, feedback_es: data.feedback_es };
  }
  return { status: 'ungraded' };
}

const PAGE = 1000;

/** Tareas comunicativas hasta un nivel HSK, en orden de catálogo. */
export async function getCommunicativeTasks(maxLevel: number, client: HanyuClient): Promise<CommunicativeTask[]> {
  const { data, error } = await (client.from('communicative_task' as any) as any)
    .select('slug, hsk_level, situation_es, mode, intent, required_markers, min_chars, max_chars, model_answer')
    .lte('hsk_level', maxLevel)
    .order('slug');
  if (error) throw createRepositoryError(error, 'No se pudieron cargar las tareas comunicativas');
  return (data ?? []) as CommunicativeTask[];
}

/**
 * Lo que necesitan las reglas deterministas (checkAnswerRules) en el cliente: el
 * vocabulario hasta el nivel, con las formas alternativas del sílabo, y los marcadores de
 * los puntos gramaticales hasta ese nivel.
 */
export async function getCommunicativeContext(level: number, client: HanyuClient): Promise<CommunicativeContext> {
  const dictionary: CommunicativeContext['dictionary'] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (client.from('words') as any)
      .select('hanzi, hsk_level, variants')
      .lte('hsk_level', level)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw createRepositoryError(error, 'No se pudo cargar el diccionario');
    const rows = (data ?? []) as Array<{ hanzi: string; hsk_level: number; variants: string[] | null }>;
    for (const row of rows) {
      dictionary.push({ hanzi: row.hanzi, hsk_level: row.hsk_level });
      for (const variant of row.variants ?? []) {
        if (variant !== row.hanzi) dictionary.push({ hanzi: variant, hsk_level: row.hsk_level });
      }
    }
    if (rows.length < PAGE) break;
  }

  const { data: points, error } = await (client.from('grammar_points') as any)
    .select('hsk_level, code, markers')
    .lte('hsk_level', level);
  if (error) throw createRepositoryError(error, 'No se pudieron cargar las estructuras de gramática');

  return {
    dictionary,
    grammar_points: ((points ?? []) as Array<{ hsk_level: number; code: string | null; markers: string[] | null }>)
      .filter(point => point.code)
      .map(point => ({ hsk_level: point.hsk_level, code: point.code as string, markers: point.markers ?? [] })),
  };
}

export interface WritingItem {
  hanzi: string;
  /** Punto de código del carácter: el target_id de learner_skill_state. */
  target_id: number;
  is_new: boolean;
  version: number;
  scheduling: SchedulingState;
  /** Palabra con la que se pide el carácter sin enseñarlo («□生 · xuésheng · estudiante»). */
  example: { word: string; pinyin: string; meaning: string } | null;
}

const GRADE_NUMBER: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

/** Caracteres de escritura que tocan hoy: vencidos, y unos pocos nuevos de palabras ya asentadas. */
export async function getWritingQueue(
  input: { limit?: number; newLimit?: number; now?: Date },
  client: HanyuClient,
): Promise<WritingItem[]> {
  const { data, error } = await (client.rpc as any)('build_writing_queue', {
    p_limit: input.limit ?? 10,
    p_new: input.newLimit ?? 3,
  });
  if (error) throw createRepositoryError(error, 'No se pudo preparar la cola de escritura');
  const now = input.now ?? new Date();
  return ((data ?? []) as any[]).map(row => ({
    hanzi: String(row.hanzi),
    target_id: Number(row.target_id),
    is_new: Boolean(row.is_new),
    version: Number(row.version ?? 0),
    example: row.example_word
      ? { word: String(row.example_word), pinyin: String(row.example_pinyin ?? ''), meaning: String(row.example_meaning ?? '') }
      : null,
    scheduling: row.is_new || row.fsrs_state === 'new'
      ? emptyState(now)
      : {
          difficulty: Number(row.difficulty ?? 0),
          stability: Number(row.stability ?? 0),
          reps: Number(row.reps ?? 0),
          lapses: Number(row.lapses ?? 0),
          learning_steps: Number(row.learning_steps ?? 0),
          scheduled_days: Number(row.scheduled_days ?? 0),
          elapsed_days: Number(row.elapsed_days ?? 0),
          state: row.fsrs_state as SchedulingState['state'],
          due: String(row.next_review_at ?? now.toISOString()),
          last_review: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
        },
  }));
}

/**
 * Registra un quiz de escritura. El estado FSRS se calcula aquí, como en apply_review, y el
 * servidor lo guarda con control de versión e idempotencia (apply_skill_review).
 */
export async function reviewWriting(
  input: { item: WritingItem; grade: Grade; mistakes: number; hints: number; review_id: string; now?: Date },
  client: HanyuClient,
): Promise<{ outcome: 'applied' | 'duplicate' | 'conflict'; version: number }> {
  const now = input.now ?? new Date();
  const params = schedulingParams({ request_retention: (await getSettings(client)).request_retention });
  const next = applyReview(input.item.scheduling, input.grade, now, params);
  const { data, error } = await (client.rpc as any)('apply_skill_review', {
    p_target_kind: 'character',
    p_target_id: input.item.target_id,
    p_skill: 'writing',
    p_review_id: input.review_id,
    p_reviewed_at: now.toISOString(),
    p_expected_version: input.item.version,
    p_grade: GRADE_NUMBER[input.grade],
    p_state: next.state,
    p_prior: input.item.scheduling,
    p_payload: { mistakes: input.mistakes, hints: input.hints, hanzi: input.item.hanzi },
  });
  if (error) throw createRepositoryError(error, 'No se pudo guardar el repaso de escritura');
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; version?: number } | null;
  const outcome = row?.outcome;
  if (outcome !== 'applied' && outcome !== 'duplicate' && outcome !== 'conflict') {
    throw createRepositoryError(new Error('Unexpected apply_skill_review response'), 'No se pudo guardar el repaso de escritura');
  }
  return { outcome, version: Number(row?.version ?? input.item.version) };
}
