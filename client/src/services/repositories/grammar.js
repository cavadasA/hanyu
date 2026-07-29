import { getSupabaseClient } from '../supabaseClient';
import { createRepositoryError, parseJsonField } from './shared';

function normalizeGrammarPoint(point) {
  return {
    ...point,
    examples: parseJsonField(point.examples, []),
  };
}

export async function getGrammar(level, client = getSupabaseClient()) {
  const numericLevel = parseInt(level, 10);
  if (Number.isNaN(numericLevel)) {
    throw new Error('Invalid level');
  }

  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, title, explanation, examples, order_idx')
    .eq('hsk_level', numericLevel)
    .order('order_idx', { ascending: true, nullsFirst: false });

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar points');
  }

  return (data || []).map(normalizeGrammarPoint);
}

export async function getGrammarPoint(level, id, client = getSupabaseClient()) {
  const numericLevel = parseInt(level, 10);
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericLevel) || Number.isNaN(numericId)) {
    throw new Error('Invalid grammar parameters');
  }

  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, title, explanation, examples, order_idx')
    .eq('id', numericId)
    .eq('hsk_level', numericLevel)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load grammar point');
  }

  return normalizeGrammarPoint(data);
}