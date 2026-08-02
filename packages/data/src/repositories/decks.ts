import type { HanyuClient } from '../client';
import type { Deck, DeckSummary, DeckTemplate } from '../types';
import { callRpcVariants, createRepositoryError, getRequiredUserId } from './shared';

const DECK_COLUMNS =
  'id, user_id, name, description, is_active, is_default, source_template_id, sort_order';

export async function getDecks(client: HanyuClient): Promise<DeckSummary[]> {
  const userId = await getRequiredUserId(client);

  const { data: decks, error } = await client
    .from('decks')
    .select(DECK_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw createRepositoryError(error, 'Failed to load decks');

  if (!decks || decks.length === 0) {
    return [];
  }

  try {
    const stats = await callRpcVariants(client, 'get_deck_stats', [{}]);
    const byDeck = new Map<string, { word_count: number; due_count: number }>();
    for (const row of (Array.isArray(stats) ? stats : []) as any[]) {
      if (row?.deck_id) {
        byDeck.set(row.deck_id, {
          word_count: Number(row.word_count || 0),
          due_count: Number(row.due_count || 0),
        });
      }
    }

    return (decks as any[]).map((d) => ({
      ...d,
      word_count: byDeck.get(d.id)?.word_count ?? 0,
      due_count: byDeck.get(d.id)?.due_count ?? 0,
    }));
  } catch {
    // Fallback for environments where get_deck_stats is not deployed.
  }

  const nowIso = new Date().toISOString();

  const { data: members, error: memberError } = await client
    .from('deck_cards')
    .select('deck_id, word_id')
    .in('deck_id', (decks as any[]).map((d) => d.id));
  if (memberError) throw createRepositoryError(memberError, 'Failed to load deck membership');

  const { data: due, error: dueError } = await client
    .from('srs_cards')
    .select('word_id')
    .eq('user_id', userId)
    .lte('next_review_at', nowIso);
  if (dueError) throw createRepositoryError(dueError, 'Failed to load due words');

  const dueWords = new Set((due || []).map((r: any) => String(r.word_id)));
  const byDeck: Record<string, { total: number; dueCount: number }> = {};
  for (const m of (members || []) as any[]) {
    const bucket = byDeck[m.deck_id] || (byDeck[m.deck_id] = { total: 0, dueCount: 0 });
    bucket.total += 1;
    if (dueWords.has(String(m.word_id))) bucket.dueCount += 1;
  }

  return (decks || []).map((d: any) => ({
    ...d,
    word_count: byDeck[d.id]?.total ?? 0,
    due_count: byDeck[d.id]?.dueCount ?? 0,
  }));
}

export async function getDeckTemplates(client: HanyuClient): Promise<DeckTemplate[]> {
  const { data, error } = await client
    .from('deck_templates')
    .select('id, slug, name, description, category, hsk_level, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw createRepositoryError(error, 'Failed to load catalog');
  return (data || []) as DeckTemplate[];
}

export async function addDeckFromTemplate(templateId: string, client: HanyuClient) {
  const result = await callRpcVariants(client, 'add_deck_from_template', [
    { p_template_id: templateId },
  ]);
  const payload = (Array.isArray(result) ? result[0] : result) as any;
  return { deck_id: payload?.deck_id as string, inserted: payload?.inserted ?? 0 };
}

export async function createDeck(
  input: { name: string; description?: string },
  client: HanyuClient
): Promise<Deck> {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('decks')
    .insert({ user_id: userId, name: input.name, description: input.description ?? null } as any)
    .select(DECK_COLUMNS)
    .single();
  if (error) throw createRepositoryError(error, 'Failed to create deck');
  return data as Deck;
}

export async function updateDeck(
  deckId: string,
  patch: Partial<Pick<Deck, 'name' | 'description' | 'is_active' | 'sort_order'>>,
  client: HanyuClient
): Promise<Deck> {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('decks')
    .update({ ...patch, updated_at: new Date().toISOString() } as any)
    .eq('id', deckId)
    .eq('user_id', userId)
    .select(DECK_COLUMNS)
    .single();
  if (error) throw createRepositoryError(error, 'Failed to update deck');
  return data as Deck;
}

export async function deleteDeck(deckId: string, client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const { error } = await client.from('decks').delete().eq('id', deckId).eq('user_id', userId);
  if (error) throw createRepositoryError(error, 'Failed to delete deck');
  return { id: deckId };
}

export async function addWordToDeck(
  deckId: string,
  wordId: number | string,
  client: HanyuClient
) {
  const userId = await getRequiredUserId(client);
  const numericWordId = Number(wordId);

  const { error: memberError } = await client
    .from('deck_cards')
    .upsert({ deck_id: deckId, word_id: numericWordId } as any, { onConflict: 'deck_id,word_id' });
  if (memberError) throw createRepositoryError(memberError, 'Failed to add word to deck');

  // Ensure the shared SRS card exists; never reset an existing one.
  const { error: cardError } = await client
    .from('srs_cards')
    .upsert(
      { user_id: userId, word_id: numericWordId, next_review_at: new Date().toISOString(), status: 'new' } as any,
      { onConflict: 'user_id,word_id', ignoreDuplicates: true }
    );
  if (cardError) throw createRepositoryError(cardError, 'Failed to ensure card');

  return { deck_id: deckId, word_id: numericWordId };
}

export async function removeWordFromDeck(
  deckId: string,
  wordId: number | string,
  client: HanyuClient
) {
  const numericWordId = Number(wordId);
  const { error } = await client
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)
    .eq('word_id', numericWordId);
  if (error) throw createRepositoryError(error, 'Failed to remove word from deck');
  return { deck_id: deckId, word_id: numericWordId };
}

export async function getDeckCards(deckId: string, client: HanyuClient) {
  const { data, error } = await client
    .from('deck_cards')
    .select(
      'word_id, words:word_id(id, hanzi, pinyin, meaning_en, meaning_es, hsk_level)'
    )
    .eq('deck_id', deckId);
  if (error) throw createRepositoryError(error, 'Failed to load deck cards');
  return (data || []).map((row: any) => {
    const w = Array.isArray(row.words) ? row.words[0] : row.words;
    return {
      word_id: row.word_id,
      hanzi: w?.hanzi,
      pinyin: w?.pinyin,
      meaning_en: w?.meaning_en,
      hsk_level: w?.hsk_level,
    };
  });
}