import type { HanyuClient } from '../client';
import type { GrammarPoint, HskLevel } from '../types';
import { createRepositoryError, parseJsonField } from './shared';

function normalizeGrammarPoint(point: any): GrammarPoint {
  return {
    ...point,
    pattern: point.pattern ?? null,
    items: point.items ?? [],
    examples: parseJsonField(point.examples, []),
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
    .select('id, hsk_level, code, "group", category, detail, title, pattern, explanation, items, examples, order_idx')
    .eq('id', numericId)
    .eq('hsk_level', numericLevel)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar point');
  }

  return normalizeGrammarPoint(data);
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
