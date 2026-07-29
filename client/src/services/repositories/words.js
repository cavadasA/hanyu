import { getSupabaseClient } from '../supabaseClient';
import { createRepositoryError } from './shared';

export async function getWords(params = {}, client = getSupabaseClient()) {
  const { level, search } = params;
  const pageNum = Math.max(1, parseInt(params.page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  let countQuery = client.from('words').select('*', { count: 'exact', head: true });
  let dataQuery = client
    .from('words')
    .select('id, hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency')
    .order('hsk_level', { ascending: true })
    .order('frequency', { ascending: true, nullsFirst: false })
    .range(offset, offset + limitNum - 1);

  if (level) {
    const numericLevel = parseInt(level, 10);
    if (!Number.isNaN(numericLevel)) {
      countQuery = countQuery.eq('hsk_level', numericLevel);
      dataQuery = dataQuery.eq('hsk_level', numericLevel);
    }
  }

  if (search) {
    const value = String(search).trim();
    if (value) {
      const orClause = `hanzi.ilike.%${value}%,pinyin.ilike.%${value}%,meaning_en.ilike.%${value}%`;
      countQuery = countQuery.or(orClause);
      dataQuery = dataQuery.or(orClause);
    }
  }

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);
  if (countResult.error) {
    throw createRepositoryError(countResult.error, 'Failed to count words');
  }

  if (dataResult.error) {
    throw createRepositoryError(dataResult.error, 'Failed to load words');
  }

  return {
    words: dataResult.data || [],
    total: countResult.count || 0,
    page: pageNum,
    limit: limitNum,
  };
}

export async function getWord(id, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('words')
    .select('id, hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency')
    .eq('id', id)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load word');
  }

  return data;
}