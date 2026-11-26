// Expresión (Plan 13): los dos evaluadores que necesitan red, detrás de Edge Functions.
// Ninguna clave de proveedor llega al cliente. Si una función no está configurada, no
// responde o devuelve algo que no es lo pedido, el resultado es «no disponible» o «sin
// corregir»: nunca se inventa una nota.
import type { CommunicativeContext, CommunicativeTask } from '@hanyu/domain';
import type { HanyuClient } from '../client';
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
    const response: Response | undefined = error.context instanceof Response ? error.context : undefined;
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
  if (error) throw createRepositoryError(error, 'Failed to load communicative tasks');
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
    if (error) throw createRepositoryError(error, 'Failed to load the dictionary');
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
  if (error) throw createRepositoryError(error, 'Failed to load grammar markers');

  return {
    dictionary,
    grammar_points: ((points ?? []) as Array<{ hsk_level: number; code: string | null; markers: string[] | null }>)
      .filter(point => point.code)
      .map(point => ({ hsk_level: point.hsk_level, code: point.code as string, markers: point.markers ?? [] })),
  };
}
