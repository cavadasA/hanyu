# Multiple Decks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user own multiple decks (curated catalog copies + custom), share SRS progress across decks, activate/pause decks, and review combined or a single deck in focus — without breaking existing users.

**Architecture:** Membership model. New tables `deck_templates`, `deck_template_words`, `decks`, `deck_cards`. `srs_cards` stays the single SRS state per word (`unique(user_id, word_id)`); `deck_cards` only decides which cards are "in play". Deck-scoped due retrieval lives in a `security definer` RPC (`get_due_cards`) because "due in active decks" needs an `EXISTS` subquery not expressible in the PostgREST query chain.

**Tech Stack:** Supabase (Postgres + RLS + plpgsql RPC), `@hanyu/data` (TS repositories over `HanyuClient`), React Native / Expo Router mobile app, Jest + @testing-library/react-native.

## Global Constraints

- Data-access rule: every repo fn takes `client: HanyuClient` as the LAST param; use `getRequiredUserId(client)`, `createRepositoryError(err, msg)`, and `callRpcVariants` from `repositories/shared`. Copy the existing style in `repositories/flashcards.ts`.
- SQL RPCs: `language plpgsql`, `security definer`, `set search_path = public`, guard `auth.uid() is null` → `raise exception 'Authentication required'`, and `grant execute ... to authenticated`. Copy `supabase/migrations/202607280002_learning_rpc.sql`.
- SRS invariant: NEVER reset or duplicate `srs_cards` when adding a word already present. One card per `(user_id, word_id)`.
- Both themes always; style through `useTheme()` colors + `tokens`; no raw hex in screens. Touch targets ≥44pt; visible `accessibilityLabel`. Copy voice: English, no em dashes, no middle-dot separators.
- Tests: mock `../lib/data`'s `getData()` (mobile) exactly as `TodayScreen.test.tsx` does; data-layer tests mock the Supabase client chain as existing repo tests do.
- Run mobile commands from `apps/mobile`. Run data-package commands from `packages/data`.
- **Git:** the requester asked for NO new branches or commits in the current session. Treat every "Commit" step below as an optional checkpoint — batch or skip git per their preference at execution time.

## File Structure

Create:
- `supabase/migrations/2026080201_decks.sql` — tables + RLS + indexes.
- `supabase/migrations/2026080202_decks_seed_and_rpc.sql` — seed templates, `add_deck_from_template`, `get_due_cards`, updated `create_starter_deck`, backfill.
- `packages/data/src/repositories/decks.ts` — deck repo.
- `packages/data/src/repositories/decks.test.ts` — deck repo tests.
- `apps/mobile/src/screens/DecksScreen.tsx` (+ `.test.tsx`) — deck list.
- `apps/mobile/src/screens/DeckCatalogScreen.tsx` (+ `.test.tsx`) — catalog.
- `apps/mobile/src/screens/DeckDetailScreen.tsx` (+ `.test.tsx`) — one deck.
- `apps/mobile/app/(app)/library/decks/_layout.tsx`, `index.tsx`, `catalog.tsx`, `[id].tsx` — routes.

Modify:
- `packages/data/src/factory.ts` — expose `decks` namespace; add `deckId?` to `flashcards.getDueCards`, deck target to `addCard`.
- `packages/data/src/repositories/flashcards.ts` — `getDueCards(limit, client, deckId?)`, `addCard(wordId, client, deckId?)`, `createStarterDeck` creates default deck.
- `packages/data/src/repositories/today.ts` — due count scoped to active decks.
- `packages/data/src/types.ts` + `packages/data/src/index.ts` — new `Deck`, `DeckTemplate`, `DeckSummary` types.
- `packages/data/src/database.types.ts` — add the four tables (or keep `as any` casts consistent with existing code).
- `apps/mobile/src/lib/data.ts` — no change (facade is generic), but confirm.
- `apps/mobile/src/screens/LibraryHomeScreen.tsx` — add a "Decks" `HubTile` → `/library/decks`.
- `apps/mobile/src/screens/CardsScreen.tsx` — accept `deckId` route param for focus mode.
- `apps/mobile/src/screens/WordsScreen.tsx` — choose destination deck when adding a word.

---

## Phase 1 — Database

### Task 1: Tables, RLS, indexes

**Files:**
- Create: `supabase/migrations/2026080201_decks.sql`

**Interfaces:**
- Produces: tables `deck_templates(id, slug, name, description, category, hsk_level, sort_order)`, `deck_template_words(template_id, word_id, sort_order)`, `decks(id, user_id, name, description, is_active, is_default, source_template_id, sort_order, created_at, updated_at)`, `deck_cards(deck_id, word_id, created_at)`.

- [ ] **Step 1: Write the migration**

```sql
-- Multiple decks: templates (catalog), user decks, membership.

create table if not exists public.deck_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text not null check (category in ('hsk','theme')),
  hsk_level int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_template_words (
  template_id uuid not null references public.deck_templates(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  sort_order int not null default 0,
  primary key (template_id, word_id)
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  source_template_id uuid references public.deck_templates(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, word_id)
);

create index if not exists idx_decks_user on public.decks(user_id);
create index if not exists idx_deck_cards_word on public.deck_cards(word_id);

alter table public.deck_templates enable row level security;
alter table public.deck_template_words enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

-- Catalog is world-readable to signed-in users, no writes.
create policy deck_templates_read on public.deck_templates
  for select to authenticated using (true);
create policy deck_template_words_read on public.deck_template_words
  for select to authenticated using (true);

-- User owns their decks.
create policy decks_owner on public.decks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Membership follows deck ownership.
create policy deck_cards_owner on public.deck_cards
  for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid()));
```

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset` (or `npx supabase migration up`) from repo root.
Expected: migration applies with no error; `\d public.decks` shows the columns above.

- [ ] **Step 3: Commit** (optional per Global Constraints)

```bash
git add supabase/migrations/2026080201_decks.sql
git commit -m "feat(db): decks, deck_templates, deck_cards tables + RLS"
```

---

### Task 2: Seed catalog + RPCs + backfill

**Files:**
- Create: `supabase/migrations/2026080202_decks_seed_and_rpc.sql`

**Interfaces:**
- Consumes: tables from Task 1; `public.words(id, hsk_level, frequency)`.
- Produces: RPC `add_deck_from_template(p_template_id uuid) returns table(deck_id uuid, inserted integer)`; RPC `get_due_cards(p_limit integer, p_deck_id uuid) returns setof public.srs_cards`; updated `create_starter_deck`; a backfill that puts every existing user's cards into a default deck.

- [ ] **Step 1: Write seed + RPC + backfill migration**

```sql
-- Seed curated catalog (HSK1-3 derive words by level; theme uses explicit list).
insert into public.deck_templates (slug, name, description, category, hsk_level, sort_order) values
  ('hsk1', 'HSK 1', 'Foundation vocabulary, HSK level 1.', 'hsk', 1, 10),
  ('hsk2', 'HSK 2', 'HSK level 2 vocabulary.', 'hsk', 2, 20),
  ('hsk3', 'HSK 3', 'HSK level 3 vocabulary.', 'hsk', 3, 30),
  ('everyday-greetings', 'Everyday Greetings', 'Core greetings and polite phrases.', 'theme', null, 40)
on conflict (slug) do nothing;

-- Theme template words (safe subset that exists in HSK1-2 seeds).
insert into public.deck_template_words (template_id, word_id, sort_order)
select t.id, w.id, row_number() over (order by w.hsk_level, w.id)
from public.deck_templates t
join public.words w on w.hanzi in ('你好','谢谢','再见','对不起','请','没关系')
where t.slug = 'everyday-greetings'
on conflict (template_id, word_id) do nothing;

-- Copy a template into a new user deck; ensure srs_cards exist. Shared SRS: on conflict do nothing.
create or replace function public.add_deck_from_template(p_template_id uuid)
returns table(deck_id uuid, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tpl public.deck_templates;
  v_deck_id uuid;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_tpl from public.deck_templates where id = p_template_id;
  if not found then
    raise exception 'Template not found';
  end if;

  insert into public.decks (user_id, name, description, source_template_id)
  values (v_user_id, v_tpl.name, v_tpl.description, v_tpl.id)
  returning id into v_deck_id;

  with source_words as (
    select w.id as word_id
    from public.words w
    where v_tpl.hsk_level is not null and w.hsk_level = v_tpl.hsk_level
    union
    select tw.word_id
    from public.deck_template_words tw
    where tw.template_id = v_tpl.id
  ), membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, sw.word_id from source_words sw
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from membership;

  insert into public.srs_cards (user_id, word_id, next_review_at, status)
  select v_user_id, dc.word_id, now(), 'new'
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  deck_id := v_deck_id;
  inserted := v_inserted;
  return next;
end;
$$;

-- Due cards scoped to the user's ACTIVE decks (combined), or a single deck when p_deck_id is set.
create or replace function public.get_due_cards(p_limit integer default 50, p_deck_id uuid default null)
returns setof public.srs_cards
language sql
security definer
set search_path = public
as $$
  select sc.*
  from public.srs_cards sc
  where sc.user_id = auth.uid()
    and sc.next_review_at <= now()
    and exists (
      select 1
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where dc.word_id = sc.word_id
        and d.user_id = auth.uid()
        and (p_deck_id is null and d.is_active or d.id = p_deck_id)
    )
  order by sc.next_review_at asc
  limit greatest(1, coalesce(p_limit, 50));
$$;

-- New users get a default deck alongside their starter cards.
create or replace function public.create_starter_deck(
  strategy text default 'hsk2_consolidation',
  p_limit integer default null
)
returns table(inserted integer, total_deck_size integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := coalesce(p_limit, 150);
  v_inserted integer := 0;
  v_deck_id uuid;
  v_levels int[] := case when strategy = 'hsk1_review' then array[1] else array[1,2] end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_limit < 1 then v_limit := 1; end if;

  insert into public.decks (user_id, name, description, is_default)
  values (v_user_id, 'HSK2 consolidation', 'Your starter deck.', true)
  returning id into v_deck_id;

  with candidates as (
    select w.id
    from public.words w
    where w.hsk_level = any(v_levels)
    order by w.hsk_level, coalesce(w.frequency, 2147483647), w.id
    limit v_limit
  ), inserted_cards as (
    insert into public.srs_cards (user_id, word_id, next_review_at, status)
    select v_user_id, c.id, now(), 'new' from candidates c
    on conflict (user_id, word_id) do nothing
    returning word_id
  ), _membership as (
    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, c.id from candidates c
    on conflict (deck_id, word_id) do nothing
    returning word_id
  )
  select count(*) into v_inserted from inserted_cards;

  inserted := v_inserted;
  select count(*) into total_deck_size from public.srs_cards where user_id = v_user_id;
  return next;
end;
$$;

grant execute on function public.add_deck_from_template(uuid) to authenticated;
grant execute on function public.get_due_cards(integer, uuid) to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;

-- Backfill: existing users' loose cards go into a default deck so the active-deck
-- due query keeps returning them.
do $$
declare r record;
declare v_deck_id uuid;
begin
  for r in select distinct user_id from public.srs_cards loop
    insert into public.decks (user_id, name, description, is_default)
    values (r.user_id, 'My deck', 'Migrated from your existing cards.', true)
    returning id into v_deck_id;

    insert into public.deck_cards (deck_id, word_id)
    select v_deck_id, sc.word_id from public.srs_cards sc where sc.user_id = r.user_id
    on conflict (deck_id, word_id) do nothing;
  end loop;
end $$;
```

- [ ] **Step 2: Apply and verify RPCs**

Run: `npx supabase db reset` from repo root.
Expected: applies clean. Manually check in SQL editor: `select * from public.deck_templates;` returns 4 rows.

- [ ] **Step 3: Commit** (optional)

```bash
git add supabase/migrations/2026080202_decks_seed_and_rpc.sql
git commit -m "feat(db): deck catalog seed, add_deck_from_template, get_due_cards, backfill"
```

---

## Phase 2 — Data layer (`@hanyu/data`)

### Task 3: `decks` repository + types + factory wiring

**Files:**
- Create: `packages/data/src/repositories/decks.ts`
- Create: `packages/data/src/repositories/decks.test.ts`
- Modify: `packages/data/src/types.ts`, `packages/data/src/index.ts`, `packages/data/src/factory.ts`

**Interfaces:**
- Consumes: `HanyuClient`, `getRequiredUserId`, `createRepositoryError`, `callRpcVariants` from `./shared`.
- Produces (called by later tasks + factory):
  - `getDecks(client): Promise<DeckSummary[]>`
  - `getDeckTemplates(client): Promise<DeckTemplate[]>`
  - `addDeckFromTemplate(templateId: string, client): Promise<{ deck_id: string; inserted: number }>`
  - `createDeck(input: { name: string; description?: string }, client): Promise<Deck>`
  - `updateDeck(deckId: string, patch: Partial<Pick<Deck,'name'|'description'|'is_active'|'sort_order'>>, client): Promise<Deck>`
  - `deleteDeck(deckId: string, client): Promise<{ id: string }>`
  - `addWordToDeck(deckId: string, wordId: number | string, client): Promise<{ deck_id: string; word_id: number }>`
  - `removeWordFromDeck(deckId: string, wordId: number | string, client): Promise<{ deck_id: string; word_id: number }>`
  - `getDeckCards(deckId: string, client): Promise<DueCard[]>`

- [ ] **Step 1: Add types to `types.ts`**

```ts
export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  source_template_id: string | null;
  sort_order: number;
}

export interface DeckSummary extends Deck {
  word_count: number;
  due_count: number;
}

export interface DeckTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: 'hsk' | 'theme';
  hsk_level: number | null;
  sort_order: number;
}
```

Export them from `index.ts` (add `Deck, DeckSummary, DeckTemplate` to the existing `export type { ... }` block).

- [ ] **Step 2: Write failing repo tests**

`packages/data/src/repositories/decks.test.ts` — mirror the mocking style of the sibling repo tests (`settings.test.ts`). Cover:

```ts
import { createDeck, updateDeck, deleteDeck, addWordToDeck } from './decks';

function clientReturning(row: unknown) {
  const chain: any = {
    from: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: row, error: null }),
    maybeSingle: async () => ({ data: row, error: null }),
  };
  chain.auth = { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) };
  return chain;
}

test('createDeck returns the created deck', async () => {
  const client = clientReturning({
    id: 'd1', user_id: 'u1', name: 'Travel', description: null,
    is_active: true, is_default: false, source_template_id: null, sort_order: 0,
  });
  const deck = await createDeck({ name: 'Travel' }, client);
  expect(deck.id).toBe('d1');
  expect(deck.name).toBe('Travel');
});

test('addWordToDeck upserts membership without throwing on duplicate', async () => {
  const client = clientReturning({ deck_id: 'd1', word_id: 5 });
  const res = await addWordToDeck('d1', 5, client);
  expect(res).toEqual({ deck_id: 'd1', word_id: 5 });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/repositories/decks.test.ts` (from `packages/data`).
Expected: FAIL — `./decks` has no such exports.

- [ ] **Step 4: Implement `decks.ts`**

```ts
import type { HanyuClient } from '../client';
import type { Deck, DeckSummary, DeckTemplate } from '../types';
import { callRpcVariants, createRepositoryError, getRequiredUserId } from './shared';

const DECK_COLUMNS =
  'id, user_id, name, description, is_active, is_default, source_template_id, sort_order';

export async function getDecks(client: HanyuClient): Promise<DeckSummary[]> {
  const userId = await getRequiredUserId(client);
  const nowIso = new Date().toISOString();

  const { data: decks, error } = await client
    .from('decks')
    .select(DECK_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw createRepositoryError(error, 'Failed to load decks');

  const { data: members, error: memberError } = await client
    .from('deck_cards')
    .select('deck_id, word_id, words:word_id(next_review_at:id)') // words join only used for existence
    .in('deck_id', (decks || []).map((d: any) => d.id));
  if (memberError) throw createRepositoryError(memberError, 'Failed to load deck membership');

  // Counts computed client-side to avoid N RPCs; due uses srs_cards per user.
  const { data: due, error: dueError } = await client
    .from('srs_cards')
    .select('word_id')
    .eq('user_id', userId)
    .lte('next_review_at', nowIso);
  if (dueError) throw createRepositoryError(dueError, 'Failed to load due words');

  const dueWords = new Set((due || []).map((r: any) => r.word_id));
  const byDeck: Record<string, { total: number; dueCount: number }> = {};
  for (const m of (members || []) as any[]) {
    const bucket = byDeck[m.deck_id] || (byDeck[m.deck_id] = { total: 0, dueCount: 0 });
    bucket.total += 1;
    if (dueWords.has(m.word_id)) bucket.dueCount += 1;
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
      'word_id, words:word_id(id, hanzi, pinyin, meaning_en, meaning_es, hsk_level), srs:word_id(status, next_review_at)'
    )
    .eq('deck_id', deckId);
  if (error) throw createRepositoryError(error, 'Failed to load deck cards');
  return (data || []).map((row: any) => {
    const w = Array.isArray(row.words) ? row.words[0] : row.words;
    return { word_id: row.word_id, hanzi: w?.hanzi, pinyin: w?.pinyin, meaning_en: w?.meaning_en, hsk_level: w?.hsk_level };
  });
}
```

Note: the `getDeckCards` `srs:word_id(...)` embed may need adjusting to your PostgREST relationships; if the embed errors, drop it and fetch `srs_cards` statuses in a second query keyed by `word_id`. Verify against the live schema in Step 6.

- [ ] **Step 5: Wire the factory**

In `packages/data/src/factory.ts`, add imports and a `decks` namespace:

```ts
import {
  addDeckFromTemplate, addWordToDeck, createDeck, deleteDeck,
  getDeckCards, getDecks, getDeckTemplates, removeWordFromDeck, updateDeck,
} from './repositories/decks';
```

```ts
    decks: {
      getDecks: () => getDecks(client),
      getDeckTemplates: () => getDeckTemplates(client),
      addDeckFromTemplate: (templateId: string) => addDeckFromTemplate(templateId, client),
      createDeck: (input: { name: string; description?: string }) => createDeck(input, client),
      updateDeck: (id: string, patch: Parameters<typeof updateDeck>[1]) => updateDeck(id, patch, client),
      deleteDeck: (id: string) => deleteDeck(id, client),
      addWordToDeck: (deckId: string, wordId: number | string) => addWordToDeck(deckId, wordId, client),
      removeWordFromDeck: (deckId: string, wordId: number | string) => removeWordFromDeck(deckId, wordId, client),
      getDeckCards: (deckId: string) => getDeckCards(deckId, client),
    },
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/repositories/decks.test.ts` then `npx tsc --noEmit` (from `packages/data`).
Expected: tests PASS; no new tsc errors.

- [ ] **Step 7: Commit** (optional)

```bash
git add packages/data/src/repositories/decks.ts packages/data/src/repositories/decks.test.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/src/factory.ts
git commit -m "feat(data): decks repository + factory wiring"
```

---

### Task 4: Deck-scoped due retrieval (`getDueCards` + factory)

**Files:**
- Modify: `packages/data/src/repositories/flashcards.ts:95-150`, `packages/data/src/factory.ts:58-69`
- Test: `packages/data/src/repositories/flashcards.test.ts` (create if absent, else extend)

**Interfaces:**
- Consumes: RPC `get_due_cards(p_limit, p_deck_id)` from Task 2; `mapCardRow`, `getSettings`.
- Produces: `getDueCards(limit: number, client, deckId?: string | null)` returning `{ cards, total, deck_size }` — cards scoped to active decks (combined) or a single deck.

- [ ] **Step 1: Write the failing test**

```ts
import { getDueCards } from './flashcards';

test('getDueCards calls get_due_cards RPC and maps rows', async () => {
  const rpc = jest.fn(async () => ({
    data: [{ id: 'c1', user_id: 'u1', word_id: 5, ease_factor: 2.5, interval_days: 0,
      repetitions: 0, next_review_at: '2020-01-01T00:00:00Z', last_reviewed_at: null,
      status: 'new', version: 1, words: { id: 5, hanzi: '你' } }],
    error: null,
  }));
  const client: any = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ error: null, count: 1 }) }) }),
  };
  // getSettings is called internally; stub via from('user_settings') maybeSingle:
  client.from = (table: string) => table === 'user_settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id:'u1', max_reviews_per_session: 100, card_order: 'due' }, error: null }) }) }) }
    : { select: () => ({ eq: () => ({ error: null, count: 1 }) }) };

  const result = await getDueCards(50, client, null);
  expect(rpc).toHaveBeenCalledWith('get_due_cards', { p_limit: 100, p_deck_id: null });
  expect(result.cards[0].hanzi).toBe('你');
});
```

Adjust the client stub to match `getSettings`/`getRequiredUserId` call shapes if they differ; the assertion that matters is `rpc('get_due_cards', { p_limit, p_deck_id })`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/repositories/flashcards.test.ts` (from `packages/data`).
Expected: FAIL — current `getDueCards` queries `srs_cards` directly, never calls `rpc`.

- [ ] **Step 3: Rewrite `getDueCards`**

Replace lines 95-150 of `flashcards.ts`:

```ts
export async function getDueCards(limit: number = 50, client: HanyuClient, deckId: string | null = null) {
  const userId = await getRequiredUserId(client);
  const settings = await getSettings(client);
  const maxFromSettings = settings.max_reviews_per_session || 100;
  const requestedLimit = Math.max(1, parseInt(String(limit), 10) || maxFromSettings);
  const effectiveLimit = Math.min(maxFromSettings, requestedLimit);

  const { data, error } = await client.rpc('get_due_cards', {
    p_limit: effectiveLimit,
    p_deck_id: deckId,
  });
  if (error) throw createRepositoryError(error, 'Failed to load due cards');

  // deck_size = number of cards in scope (active decks, or the focused deck).
  const deckSizeQuery = client
    .from('deck_cards')
    .select('word_id, decks!inner(user_id, is_active)', { count: 'exact', head: true })
    .eq('decks.user_id', userId);
  const scopedSize = deckId
    ? deckSizeQuery.eq('deck_id', deckId)
    : deckSizeQuery.eq('decks.is_active', true);
  const { count: deckSize, error: sizeError } = await scopedSize;
  if (sizeError) throw createRepositoryError(sizeError, 'Failed to load deck size');

  let cards = (data || []).map((row: any) => mapCardRow(row));
  if (settings.card_order === 'frequency') {
    cards = cards.slice().sort((a, b) => {
      const fa = Number.isFinite(Number(a.frequency)) ? Number(a.frequency) : Number.MAX_SAFE_INTEGER;
      const fb = Number.isFinite(Number(b.frequency)) ? Number(b.frequency) : Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      const da = a.next_review_at ? new Date(a.next_review_at).getTime() : 0;
      const db = b.next_review_at ? new Date(b.next_review_at).getTime() : 0;
      return da - db;
    });
  }

  return { cards, total: cards.length, deck_size: deckSize || 0 };
}
```

Note: the RPC returns `srs_cards` rows without the `words` embed. If the embed is needed for `mapCardRow`, change `get_due_cards` to `returns table(...)` selecting the joined word columns, OR fetch words in a second `.in('id', wordIds)` query and merge. Verify in Step 5 and adjust the RPC's return shape if `hanzi` comes back undefined.

- [ ] **Step 4: Update factory signature**

In `factory.ts`, replace the `getDueCards` line:

```ts
      getDueCards: (limit = 50, deckId: string | null = null) => getDueCards(limit, client, deckId),
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/repositories/flashcards.test.ts` then `npx tsc --noEmit`.
Expected: PASS; no new tsc errors.

- [ ] **Step 6: Commit** (optional)

```bash
git add packages/data/src/repositories/flashcards.ts packages/data/src/factory.ts packages/data/src/repositories/flashcards.test.ts
git commit -m "feat(data): deck-scoped getDueCards via get_due_cards RPC"
```

---

### Task 5: `today.getToday` due scoping + `addCard` deck target

**Files:**
- Modify: `packages/data/src/repositories/today.ts:21-52`, `packages/data/src/repositories/flashcards.ts:204-262`, `packages/data/src/factory.ts`

**Interfaces:**
- Consumes: RPC `get_due_cards`; tables `deck_cards`, `decks`.
- Produces: `getToday` due/deck_size scoped to active decks; `addCard(wordId, client, deckId?)` also inserts `deck_cards` for the target deck (default deck when `deckId` omitted).

- [ ] **Step 1: Write failing tests**

Extend `today` tests (create `today.test.ts` if absent) to assert the due count comes from the active-deck-scoped count, and a `flashcards` test that `addCard(word, client, 'd1')` inserts into `deck_cards`. Minimal example:

```ts
import { addCard } from './flashcards';

test('addCard inserts deck membership for the target deck', async () => {
  const inserts: any[] = [];
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'words' ? { id: 5 } : null, error: null }) }) }),
      insert: (row: any) => { inserts.push({ t, row }); return { select: () => ({ single: async () => ({ data: { id: 'c1' }, error: null }) }) }; },
      upsert: (row: any) => { inserts.push({ t, row }); return { error: null }; },
    }),
  };
  await addCard(5, client, 'd1');
  expect(inserts.some((i) => i.t === 'deck_cards' && i.row.deck_id === 'd1')).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx jest src/repositories/flashcards.test.ts -t addCard`.
Expected: FAIL — current `addCard` never touches `deck_cards`.

- [ ] **Step 3: Implement**

In `today.ts`, replace the `dueResult` computation (lines 23-27 and its error check) so the due count uses the active-deck scope. Simplest correct form — count rows returned by the RPC:

```ts
  const dueRpc = await client.rpc('get_due_cards', { p_limit: 100000, p_deck_id: null });
  if (dueRpc.error) {
    throw createRepositoryError(dueRpc.error, 'Failed to load due cards count');
  }
  const dueCount = (dueRpc.data || []).length;
```

Then use `dueCount` where `dueResult.count` was used (the `flashcards.due` field), and change `deck_size` to a scoped count of active-deck words:

```ts
  const deckSizeResult = await client
    .from('deck_cards')
    .select('word_id, decks!inner(user_id, is_active)', { count: 'exact', head: true })
    .eq('decks.user_id', userId)
    .eq('decks.is_active', true);
```

In `flashcards.ts` `addCard`, add `deckId?: string` param; after ensuring the `srs_cards` row (keep the existing insert, but treat 409 as non-fatal when a deck target is provided), resolve the target deck and upsert membership:

```ts
export async function addCard(wordId: number | string, client: HanyuClient, deckId?: string) {
  const userId = await getRequiredUserId(client);
  const numericWordId = Number(wordId);

  // Ensure the shared SRS card (idempotent; do not reset).
  const { error: cardError } = await client
    .from('srs_cards')
    .upsert(
      { user_id: userId, word_id: numericWordId, next_review_at: new Date().toISOString(), status: 'new' } as any,
      { onConflict: 'user_id,word_id', ignoreDuplicates: true }
    );
  if (cardError) throw createRepositoryError(cardError, 'Failed to add card');

  // Resolve target deck (explicit, else the default deck).
  let targetDeckId = deckId;
  if (!targetDeckId) {
    const { data: def } = await client
      .from('decks').select('id').eq('user_id', userId).eq('is_default', true).maybeSingle();
    targetDeckId = (def as any)?.id;
  }
  if (targetDeckId) {
    const { error: memberError } = await client
      .from('deck_cards')
      .upsert({ deck_id: targetDeckId, word_id: numericWordId } as any, { onConflict: 'deck_id,word_id' });
    if (memberError) throw createRepositoryError(memberError, 'Failed to add word to deck');
  }

  return { word_id: numericWordId, deck_id: targetDeckId ?? null };
}
```

Update the factory line: `addCard: (wordId, deckId?: string) => addCard(wordId, client, deckId)`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest` (from `packages/data`) then `npx tsc --noEmit`.
Expected: PASS; no new tsc errors. Existing `getToday` shape (fields) unchanged.

- [ ] **Step 5: Commit** (optional)

```bash
git add packages/data/src/repositories/today.ts packages/data/src/repositories/flashcards.ts packages/data/src/factory.ts
git commit -m "feat(data): scope today due to active decks; addCard targets a deck"
```

---

## Phase 3 — Mobile UI

Shared UI conventions (every screen): wrap in `Screen`; loading → skeleton like `TodayScreen`; error → `ErrorBanner message onRetry`; empty → `EmptyState title body actionLabel`; style via `useTheme()` + `tokens`; data via `getData().decks.*`. Follow `WordsScreen.tsx` for list + action-row patterns.

### Task 6: Decks list screen + route + Library entry

**Files:**
- Create: `apps/mobile/src/screens/DecksScreen.tsx`, `apps/mobile/src/screens/DecksScreen.test.tsx`
- Create: `apps/mobile/app/(app)/library/decks/_layout.tsx`, `apps/mobile/app/(app)/library/decks/index.tsx`
- Modify: `apps/mobile/src/screens/LibraryHomeScreen.tsx`

**Interfaces:**
- Consumes: `getData().decks.getDecks()` → `DeckSummary[]`; `updateDeck(id, { is_active })`.
- Produces: navigation targets `/library/decks/catalog` and `/library/decks/[id]`.

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, act } from '@testing-library/react-native';
import DecksScreen from './DecksScreen';

jest.mock('../lib/data', () => ({
  getData: () => ({ decks: {
    getDecks: async () => ([{ id:'d1', name:'HSK 1', description:null, is_active:true, is_default:false, source_template_id:null, sort_order:0, word_count:150, due_count:12 }]),
    updateDeck: async () => ({}),
  }}),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (cb: any) => { const R = jest.requireActual('react'); R.useEffect(cb, [cb]); } }));

test('lists the user decks with counts', async () => {
  await act(async () => { render(<DecksScreen />); });
  expect(screen.getByText('HSK 1')).toBeTruthy();
  expect(screen.getByText(/150 words/)).toBeTruthy();
  expect(screen.getByText(/12 due/)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx jest src/screens/DecksScreen.test.tsx` (from `apps/mobile`).
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `DecksScreen.tsx`**

Structure (follow `WordsScreen`/`YouScreen` patterns): header row ("Decks" heading + a "Catalog" `Button` → `/library/decks/catalog`); an EmptyState when no decks ("No decks yet", body, actionLabel "Add from catalog"); otherwise a list of `Card`s, each a `Pressable` → `/library/decks/${deck.id}` showing `deck.name`, a muted line `` `${deck.word_count} words · ${deck.due_count} due` `` (single middle-dot is allowed here as it is a metadata line with one separator per Global Constraints — use " · " once), and a `Segmented`/toggle for `is_active` calling `getData().decks.updateDeck(deck.id, { is_active: next })` with optimistic update + revert on error. A "New deck" `Button` at the bottom (creates via `createDeck` then navigates to detail; prompt for name with a simple inline `TextInput` or a follow-up screen — for v1 create "New deck" then rename in detail). Load in `useFocusEffect`, `refreshControl` via `Screen`.

- [ ] **Step 4: Run test to pass**

Run: `npx jest src/screens/DecksScreen.test.tsx`.
Expected: PASS.

- [ ] **Step 5: Add route files**

`app/(app)/library/decks/_layout.tsx`: a `Stack` (copy `app/(app)/library/grammar/_layout.tsx`).
`app/(app)/library/decks/index.tsx`: `export { default } from '../../../../src/screens/DecksScreen';` (match how other route files re-export screens — confirm the existing relative-path convention in `app/(app)/library/words.tsx`).

- [ ] **Step 6: Add Library entry**

In `LibraryHomeScreen.tsx`, add a `HubTile` (copy an existing one) titled "Decks", description "Manage your study decks", route `/library/decks`.

- [ ] **Step 7: Run mobile suite**

Run: `npx jest` (from `apps/mobile`).
Expected: all PASS.

- [ ] **Step 8: Commit** (optional)

```bash
git add apps/mobile/src/screens/DecksScreen.tsx apps/mobile/src/screens/DecksScreen.test.tsx "apps/mobile/app/(app)/library/decks" apps/mobile/src/screens/LibraryHomeScreen.tsx
git commit -m "feat(mobile): decks list screen + Library entry"
```

---

### Task 7: Catalog screen (add from template)

**Files:**
- Create: `apps/mobile/src/screens/DeckCatalogScreen.tsx`, `apps/mobile/src/screens/DeckCatalogScreen.test.tsx`
- Create: `apps/mobile/app/(app)/library/decks/catalog.tsx`

**Interfaces:**
- Consumes: `getData().decks.getDeckTemplates()`, `getData().decks.addDeckFromTemplate(id)`.

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import DeckCatalogScreen from './DeckCatalogScreen';

const add = jest.fn(async () => ({ deck_id: 'd9', inserted: 150 }));
jest.mock('../lib/data', () => ({ getData: () => ({ decks: {
  getDeckTemplates: async () => ([{ id:'t1', slug:'hsk1', name:'HSK 1', description:'Foundation', category:'hsk', hsk_level:1, sort_order:10 }]),
  addDeckFromTemplate: add,
}})}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

test('adds a template deck on press', async () => {
  await act(async () => { render(<DeckCatalogScreen />); });
  await act(async () => { fireEvent.press(screen.getByText('Add')); });
  expect(add).toHaveBeenCalledWith('t1');
});
```

- [ ] **Step 2: Run to verify fail** — `npx jest src/screens/DeckCatalogScreen.test.tsx` → FAIL (no module).

- [ ] **Step 3: Implement** — list `Card`s per template (name, muted description), each with an "Add" `Button` calling `addDeckFromTemplate(t.id)` (busy state on the pressed row like `Button busy`), then `router.back()` to the decks list. Loading skeleton, error `ErrorBanner`.

- [ ] **Step 4: Run to pass** — `npx jest src/screens/DeckCatalogScreen.test.tsx` → PASS.

- [ ] **Step 5: Route** — `app/(app)/library/decks/catalog.tsx` re-exports the screen.

- [ ] **Step 6: Run suite** — `npx jest` → PASS.

- [ ] **Step 7: Commit** (optional)

```bash
git add apps/mobile/src/screens/DeckCatalogScreen.tsx apps/mobile/src/screens/DeckCatalogScreen.test.tsx "apps/mobile/app/(app)/library/decks/catalog.tsx"
git commit -m "feat(mobile): deck catalog screen"
```

---

### Task 8: Deck detail (words, add/remove, rename, activate/pause, review)

**Files:**
- Create: `apps/mobile/src/screens/DeckDetailScreen.tsx`, `apps/mobile/src/screens/DeckDetailScreen.test.tsx`
- Create: `apps/mobile/app/(app)/library/decks/[id].tsx`

**Interfaces:**
- Consumes: `getData().decks.getDecks()` (to find the deck) or a `getDeck` (reuse getDecks + find by id), `getDeckCards(id)`, `removeWordFromDeck(id, wordId)`, `updateDeck(id, patch)`, `deleteDeck(id)`; `useLocalSearchParams()` for `id`; navigation to `/cards?deckId=${id}`.

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import DeckDetailScreen from './DeckDetailScreen';

const push = jest.fn();
jest.mock('../lib/data', () => ({ getData: () => ({ decks: {
  getDecks: async () => ([{ id:'d1', name:'Travel', description:null, is_active:true, is_default:false, source_template_id:null, sort_order:0, word_count:2, due_count:0 }]),
  getDeckCards: async () => ([{ word_id:5, hanzi:'你好', pinyin:'nǐ hǎo', meaning_en:'hello', hsk_level:1 }]),
  removeWordFromDeck: jest.fn(async () => ({})), updateDeck: jest.fn(async () => ({})),
}})}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }), useLocalSearchParams: () => ({ id: 'd1' }), useFocusEffect: (cb:any) => { const R = jest.requireActual('react'); R.useEffect(cb, [cb]); } }));

test('shows deck words and starts a focused review', async () => {
  await act(async () => { render(<DeckDetailScreen />); });
  expect(screen.getByText('你好')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Review this deck')); });
  expect(push).toHaveBeenCalledWith('/cards?deckId=d1');
});
```

- [ ] **Step 2: Run to verify fail** — FAIL (no module).

- [ ] **Step 3: Implement** — header with deck name (tap to rename via inline `TextInput` → `updateDeck(id, { name })`); an activate/pause toggle (`updateDeck(id, { is_active })`); a primary `Button` "Review this deck" → `router.push('/cards?deckId=' + id)`; a words list (`getDeckCards`) each row with hanzi/pinyin/meaning and a "Remove" action (`removeWordFromDeck` + optimistic list update); a destructive "Delete deck" `Button` (confirm via `Alert.alert`) → `deleteDeck(id)` then `router.back()`. Load in `useFocusEffect`.

- [ ] **Step 4: Run to pass** — PASS.

- [ ] **Step 5: Route** — `app/(app)/library/decks/[id].tsx` re-exports the screen.

- [ ] **Step 6: Run suite** — `npx jest` → PASS.

- [ ] **Step 7: Commit** (optional)

```bash
git add apps/mobile/src/screens/DeckDetailScreen.tsx apps/mobile/src/screens/DeckDetailScreen.test.tsx "apps/mobile/app/(app)/library/decks/[id].tsx"
git commit -m "feat(mobile): deck detail screen"
```

---

### Task 9: Reviews focus mode (deckId param)

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`, `apps/mobile/app/(app)/cards.tsx`

**Interfaces:**
- Consumes: `useLocalSearchParams()` → `{ deckId?: string }`; `getData().flashcards.getDueCards(limit, deckId)`.

- [ ] **Step 1: Failing test**

Extend `CardsScreen.test.tsx`: mock `useLocalSearchParams` to return `{ deckId: 'd1' }`, spy on `getDueCards`, assert it is called with the deckId. Example addition:

```tsx
// in the expo-router mock:
useLocalSearchParams: () => ({ deckId: 'd1' }),
// ...
test('passes deckId to getDueCards in focus mode', async () => {
  // getDueCards mock records args
  await renderCards();
  expect(mockGetDueCards).toHaveBeenCalledWith(expect.any(Number), 'd1');
});
```

- [ ] **Step 2: Run to verify fail** — the current `CardsScreen` calls `getDueCards(limit)` with no deckId → FAIL.

- [ ] **Step 3: Implement** — read `const { deckId } = useLocalSearchParams<{ deckId?: string }>();` and pass it: `getData().flashcards.getDueCards(sessionLimit, typeof deckId === 'string' ? deckId : null)`. When `deckId` present, the "Session complete" screen shows a "Back to deck" `Button` → `router.push('/library/decks/' + deckId)` in addition to "Back to Today". No behavior change when `deckId` is absent (combined).

- [ ] **Step 4: Run to pass** — `npx jest src/screens/CardsScreen.test.tsx` → PASS.

- [ ] **Step 5: Run suite** — `npx jest` → PASS (existing Today/Cards tests still green).

- [ ] **Step 6: Commit** (optional)

```bash
git add apps/mobile/src/screens/CardsScreen.tsx "apps/mobile/app/(app)/cards.tsx"
git commit -m "feat(mobile): focused per-deck review via deckId param"
```

---

### Task 10: Words screen — add to a chosen deck

**Files:**
- Modify: `apps/mobile/src/screens/WordsScreen.tsx`

**Interfaces:**
- Consumes: `getData().decks.getDecks()` (deck picker), `getData().flashcards.addCard(wordId, deckId)`.

- [ ] **Step 1: Failing test**

Extend `WordsScreen.test.tsx`: assert that adding a word calls `addCard` with a deckId. If the picker defaults to the default deck, seed `getDecks` to return one `is_default` deck and assert `addCard(word.id, 'd1')`.

```tsx
expect(mockAddCard).toHaveBeenCalledWith(5, 'd1');
```

- [ ] **Step 2: Run to verify fail** — current call is `addCard(word.id)` → FAIL on the deckId arg.

- [ ] **Step 3: Implement** — load decks on mount; keep a selected deck (default to the `is_default` one); render a compact deck selector (`Segmented` or a small picker) above/near the list; change the add handler to `getData().flashcards.addCard(word.id, selectedDeckId)`. If the user has no decks yet, keep current behavior (`addCard(word.id)` → default deck resolved server-side) and show a hint linking to `/library/decks`.

- [ ] **Step 4: Run to pass** — `npx jest src/screens/WordsScreen.test.tsx` → PASS.

- [ ] **Step 5: Run full mobile suite + typecheck**

Run: `npx jest` and `npx tsc --noEmit` (from `apps/mobile`).
Expected: all PASS; only the pre-existing `packages/data` tsc error remains (no new app errors). Note: the separate `CardStatusBadge.tsx` `colors.info` error is out of scope for this plan.

- [ ] **Step 6: Commit** (optional)

```bash
git add apps/mobile/src/screens/WordsScreen.tsx apps/mobile/src/screens/WordsScreen.test.tsx
git commit -m "feat(mobile): add word to a chosen deck"
```

---

## Self-Review (done at write time)

- **Spec coverage:** tables/RLS (Task 1) ✓; catalog seed + copy-editable templates via `add_deck_from_template` (Task 2/7) ✓; shared SRS `unique(user,word)` untouched (Tasks 2-5) ✓; active/pause (`is_active` toggle Task 6, scoping Tasks 2/4/5) ✓; combined + focus review (`get_due_cards` p_deck_id, Task 4/9) ✓; custom decks + add/remove words (Tasks 6/8/10) ✓; migration backfill (Task 2) ✓; edge case "paused+active word stays due" is satisfied by the `EXISTS ... is_active` in `get_due_cards` ✓; delete keeps `srs_cards` (Task 8 deletes only `decks`/cascade `deck_cards`) ✓.
- **Placeholder scan:** the two "Note:" callouts (PostgREST embed shape in `getDeckCards`, and the `get_due_cards` word-embed) are explicit verify-and-adjust instructions with a concrete fallback, not vague TODOs. No "add error handling"-style placeholders.
- **Type consistency:** `getDueCards(limit, client, deckId?)`, factory `getDueCards(limit, deckId?)`, `addCard(wordId, client, deckId?)`/factory `addCard(wordId, deckId?)`, RPC names `add_deck_from_template`/`get_due_cards`, and route `/cards?deckId=` are used identically across tasks.

## Open verification points (flagged, not blockers)

1. `get_due_cards` returns bare `srs_cards`; confirm `mapCardRow` still gets word fields — if `hanzi` is undefined, switch the RPC to `returns table(...)` with the joined `words` columns (called out in Task 4 Step 3).
2. `getDeckCards` embed relationship names depend on your generated PostgREST relationships; fallback to a second query is documented in Task 3 Step 4.
3. Confirm the route re-export convention by opening `app/(app)/library/words.tsx` before writing the new route files.
