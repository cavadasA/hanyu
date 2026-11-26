import type { HanyuClient } from '../client';
import type { GrammarPoint, GrammarReading, HskLevel } from '../types';
import { createRepositoryError, parseJsonField } from './shared';

export function normalizeGrammarPoint(point: any): GrammarPoint {
  return {
    ...point,
    pattern: point.pattern ?? null,
    items: point.items ?? [],
    markers: point.markers ?? [],
    examples: parseJsonField(point.examples, []),
    common_errors: parseJsonField(point.common_errors, []),
    see_also: parseJsonField(point.see_also, []),
  };
}

export async function getGrammar(level: HskLevel | string, client: HanyuClient): Promise<GrammarPoint[]> {
  const numericLevel = parseInt(String(level), 10);
  if (Number.isNaN(numericLevel)) {
    throw new Error('Invalid level');
  }

  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, code, "group", category, detail, title, pattern, explanation, items, examples, order_idx')
    .eq('hsk_level', numericLevel)
    .order('order_idx', { ascending: true, nullsFirst: false });

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar points');
  }

  return (data || []).map(normalizeGrammarPoint);
}

export async function getGrammarPoint(
  level: HskLevel | string,
  id: number | string,
  client: HanyuClient,
): Promise<GrammarPoint> {
  const numericLevel = parseInt(String(level), 10);
  const numericId = parseInt(String(id), 10);
  if (Number.isNaN(numericLevel) || Number.isNaN(numericId)) {
    throw new Error('Invalid grammar parameters');
  }

  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, code, "group", category, detail, title, pattern, explanation, items, examples, order_idx, markers, common_errors, see_also')
    .eq('id', numericId)
    .eq('hsk_level', numericLevel)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar point');
  }

  return normalizeGrammarPoint(data);
}

/** `小—` se busca como `小`: el guion marca un hueco (mismo criterio que el validador). */
function normalizeMarker(marker: string): string {
  return marker.replace(/[—\s]/g, '');
}

/**
 * Lecturas cuyo target_grammar declara este punto. La clave es (nivel, código):
 * 47 códigos se repiten entre niveles. De cada una se devuelve la primera
 * frase que contiene un marcador del punto, como ejemplo real en contexto.
 */
export async function getGrammarReadings(
  level: HskLevel,
  code: string,
  client: HanyuClient,
): Promise<GrammarReading[]> {
  const { data: point, error: pointError } = await client
    .from('grammar_points')
    .select('markers')
    .eq('hsk_level', level)
    .eq('code', code)
    .maybeSingle();

  if (pointError) {
    throw createRepositoryError(pointError, 'Failed to load grammar point');
  }

  const { data, error } = await client
    .from('reading')
    .select('slug, title, sentences')
    // target_grammar es jsonb: el filtro va como JSON. Un array JS lo convertiría
    // postgrest-js en un literal de array de Postgres y PostgREST lo rechazaría.
    .contains('target_grammar', JSON.stringify([{ code, level }]))
    .order('slug');

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar readings');
  }

  const markers = ((point?.markers ?? []) as string[]).map(normalizeMarker).filter(Boolean);

  return ((data ?? []) as any[]).map(row => {
    const sentences: Array<{ zh?: string }> = parseJsonField(row.sentences, []);
    const match = sentences.find(sentence =>
      markers.some(marker => String(sentence.zh ?? '').includes(marker)),
    );
    return { slug: String(row.slug), title: String(row.title), sentence: match?.zh ?? '' };
  });
}

export async function markGrammarStudied(
  id: number | string,
  client: HanyuClient,
): Promise<void> {
  const numericId = parseInt(String(id), 10);
  if (Number.isNaN(numericId)) {
    throw new Error('Invalid grammar parameters');
  }

  const { error } = await client.rpc('mark_grammar_studied', { p_grammar_id: numericId });
  if (error) {
    throw createRepositoryError(error, 'Failed to save grammar progress');
  }
}

export async function getGrammarStudyState(
  id: number | string,
  client: HanyuClient,
): Promise<boolean> {
  const numericId = parseInt(String(id), 10);
  if (Number.isNaN(numericId)) {
    throw new Error('Invalid grammar parameters');
  }

  const { data, error } = await client
    .from('learner_skill_state')
    .select('fsrs_state, suspended')
    .eq('target_kind', 'grammar')
    .eq('target_id', numericId)
    .eq('skill', 'recognition')
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar progress');
  }

  return data?.fsrs_state === 'review' || Boolean(data?.suspended);
}
