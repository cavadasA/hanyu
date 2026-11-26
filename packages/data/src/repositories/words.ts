import type { HanyuClient } from '../client';
import type { HskLevel, Word, WordPage } from '../types';
import { createRepositoryError } from './shared';

export interface GetWordsInput {
  search?: string;
  level?: HskLevel;
  page?: number;
  page_size?: number;
  limit?: number;
}

export async function getWords(
  params: GetWordsInput = {},
  client: HanyuClient,
): Promise<WordPage> {
  const level = params.level as string | number | undefined;
  const search = params.search as string | undefined;
  const pageNum = Math.max(1, parseInt(String(params.page), 10) || 1);
  const limitNum = Math.min(
    50,
    Math.max(1, parseInt(String(params.page_size ?? params.limit), 10) || 20),
  );
  const offset = (pageNum - 1) * limitNum;

  let countQuery = client.from('words').select('*', { count: 'exact', head: true });
  let dataQuery = client
    .from('words')
    .select('id, hanzi, sense_index, variants, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency')
    .order('hsk_level', { ascending: true })
    .order('frequency', { ascending: true, nullsFirst: false })
    .range(offset, offset + limitNum - 1);

  if (level) {
    const numericLevel = parseInt(String(level), 10);
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
    throw createRepositoryError(countResult.error, 'No se pudieron contar las palabras');
  }

  if (dataResult.error) {
    throw createRepositoryError(dataResult.error, 'No se pudieron cargar las palabras');
  }

  const items = (dataResult.data || []).map((row: any): Word => ({
    ...row,
    sense_index: row.sense_index ?? null,
    variants: row.variants ?? [],
    in_srs: Boolean(row.in_srs),
  }));

  return {
    items,
    words: items,
    total: countResult.count || 0,
    page: pageNum,
    page_size: limitNum,
    limit: limitNum,
  };
}

export async function getWord(id: number | string, client: HanyuClient) {
  const { data, error } = await client
    .from('words')
    .select('id, hanzi, sense_index, variants, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency')
    .eq('id', id as any)
    .single();

  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar la palabra');
  }

  return {
    ...data,
    sense_index: data.sense_index ?? null,
    variants: data.variants ?? [],
  };
}
