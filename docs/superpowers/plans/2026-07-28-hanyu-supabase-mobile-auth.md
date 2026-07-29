# Hanyu Supabase Mobile Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Hanyu from local Express + SQLite single-user mode to a Supabase-first authenticated platform that can serve both the current web app and a future Expo mobile app.

**Architecture:** Supabase Auth owns identity, Supabase Postgres owns data, Row Level Security protects user rows, and web/mobile clients access Supabase directly for normal operations. Multi-table learning mutations and secret-backed AI calls move to Postgres RPC or Supabase Edge Functions, while the existing Express server stays as a temporary migration reference until no production flow uses `/api`.

**Tech Stack:** React 18, Vite, Supabase JS, Supabase Auth, Postgres, RLS, PL/pgSQL RPC, Supabase Edge Functions with Deno, Vitest, Testing Library.

**Supabase Project:** Remote hosted project `ycchpixzhlsvivzloyvh` (`https://ycchpixzhlsvivzloyvh.supabase.co`). All schema, seeds, and functions are managed through the Supabase Web Dashboard SQL Editor and CLI remote commands. No local Docker stack.

## Global Constraints

- Real login is required from the first deployed Supabase version.
- Do not expose service-role keys, DeepSeek keys, or Gemini keys in browser or mobile environments.
- All user-owned tables must enforce `user_id = auth.uid()` through RLS.
- Global content tables are readable by authenticated users and writable only through migrations/seeds.
- Keep Express/SQLite available until the migrated web flow has parity.
- Preserve existing user-facing flows: dashboard, words, grammar, flashcards, exercises, readings, settings, and stats.
- Mobile compatibility means stable table names, RPC/function names, and repository signatures before creating the Expo app.
- Use Supabase Edge Function secrets for AI provider credentials.
- Hanyu uses a dedicated hosted Supabase project (`ycchpixzhlsvivzloyvh`). Do not connect to any other Supabase project.
- Apply migrations and seeds via the Supabase Web Dashboard SQL Editor, or via CLI with `npx supabase link --project-ref ycchpixzhlsvivzloyvh` + `npx supabase db push`.
- Do not run `supabase start`, `supabase stop`, `supabase db reset`, or `supabase test db` — there is no local Docker stack.
- Deploy Edge Functions with `npx supabase functions deploy` after linking.
- Hanyu uses repo-local env files only (`.env.local`); do not reuse shell-level Supabase environment variables from another project.

---

## File Structure

Create or modify these files during the migration:

```text
hanyu/
|-- .env.example
|-- package.json
|-- package-lock.json
|-- supabase/
|   |-- seed.sql
|   |-- verification-queries.sql
|   |-- migrations/
|   |   |-- 202607280001_initial_schema.sql
|   |   |-- 202607280002_learning_rpc.sql
|   |   `-- 202607280003_dashboard_rpc.sql
|   `-- functions/
|       |-- _shared/
|       |   |-- cors.ts
|       |   |-- supabase.ts
|       |   `-- ai.ts
|       |-- generate-exercise/
|       |   `-- index.ts
|       `-- generate-reading/
|           `-- index.ts
|-- scripts/
|   |-- build-supabase-seed.js
|   `-- build-supabase-seed.test.js
|-- client/src/
|   |-- pages/
|   |   `-- Auth.jsx
|   |-- routes/
|   |   `-- ProtectedRoute.jsx
|   |-- services/
|   |   |-- supabaseClient.js
|   |   |-- supabaseClient.test.js
|   |   |-- auth.js
|   |   |-- auth.test.js
|   |   `-- repositories/
|   |       |-- words.js
|   |       |-- words.test.js
|   |       |-- grammar.js
|   |       |-- grammar.test.js
|   |       |-- flashcards.js
|   |       |-- flashcards.test.js
|   |       |-- settings.js
|   |       |-- settings.test.js
|   |       |-- stats.js
|   |       |-- stats.test.js
|   |       |-- exercises.js
|   |       |-- exercises.test.js
|   |       |-- readings.js
|   |       `-- readings.test.js
|   |-- stores/
|   |   |-- authStore.js
|   |   `-- authStore.test.js
|   |-- App.jsx
|   |-- services/api.js
|   |-- pages/Words.jsx
|   |-- pages/Grammar.jsx
|   |-- pages/Flashcards.jsx
|   |-- pages/Settings.jsx
|   |-- pages/Dashboard.jsx
|   |-- pages/Exercises.jsx
|   `-- pages/Readings.jsx
|-- README.md
`-- docs/superpowers/specs/2026-07-28-hanyu-supabase-mobile-auth-design.md
```

Ownership boundaries:

- `supabase/migrations/`: schema, RLS, triggers, RPC, views.
- `supabase/functions/`: server-side TypeScript for AI-backed operations.
- `scripts/build-supabase-seed.js`: deterministic conversion from existing JSON seeds to `supabase/seed.sql`.
- `client/src/services/repositories/`: stable client data contract shared later with mobile.
- `client/src/services/api.js`: temporary compatibility facade; remove only after every page stops using old Express-only behavior.

### Task 0: Supabase Environment Setup

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces env convention: Hanyu browser env vars live in `.env.local` inside this repo.
- Produces: `.env.example` with the remote project URL template.
- Project ref: `ycchpixzhlsvivzloyvh`
- Project URL: `https://ycchpixzhlsvivzloyvh.supabase.co`

- [ ] **Step 1: Ensure local env files are ignored**

Add these lines to `.gitignore` if missing:

```gitignore
.env
.env.local
.env.*.local
!.env.example
supabase/.temp/
```

- [ ] **Step 2: Create env example**

Create `.env.example`:

```dotenv
# Hanyu Supabase — remote hosted project only, no local Docker stack.
VITE_SUPABASE_URL=https://ycchpixzhlsvivzloyvh.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-anon-key-from-dashboard

# Edge Function secrets only. Never expose these to browser or mobile clients.
# Set them via: npx supabase secrets set DEEPSEEK_API_KEY=<value>
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
```

- [ ] **Step 3: Create `.env.local` with real credentials**

Copy `.env.example` to `.env.local` and paste the anon key from the Supabase dashboard → Settings → API → `anon` `public` key.

- [ ] **Step 4: Commit**

Run:

```bash
git add .gitignore .env.example
git commit -m "chore: add supabase env setup"
```

### Task 1: Supabase Tooling and Environment Contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `client/src/services/supabaseClient.js`
- Create: `client/src/services/supabaseClient.test.js`

**Interfaces:**
- Produces: `createSupabaseBrowserClient(env?: object): SupabaseClient`
- Produces: `getSupabaseEnv(env?: object): { url: string, anonKey: string }`
- Produces: `getSupabaseClient(): SupabaseClient`
- Consumes later: all repository modules use `getSupabaseClient()` from `client/src/services/supabaseClient.js`

- [ ] **Step 1: Install Supabase browser client**

Run:

```bash
npm install @supabase/supabase-js
```

Expected:

- `package.json` has `@supabase/supabase-js` in `dependencies`.
- `package-lock.json` is updated.

- [ ] **Step 2: Install Supabase CLI as a repo-local dev dependency**

The CLI is used for `link`, `db push`, and `functions deploy` against the remote project. No local Docker stack.

Run:

```bash
npm install --save-dev supabase
```

Expected:

- `package.json` has `supabase` in `devDependencies`.
- No local Supabase containers are started by installing this package.

- [ ] **Step 3: Add Supabase scripts to `package.json`**

Add these scripts while keeping the existing scripts:

```json
{
  "supabase:link": "npx supabase link --project-ref ycchpixzhlsvivzloyvh",
  "supabase:push": "npx supabase db push",
  "supabase:deploy-functions": "npx supabase functions deploy",
  "build:supabase-seed": "node scripts/build-supabase-seed.js"
}
```

- [ ] **Step 4: Create `.env.example`**

This was already created in Task 0. Verify it exists with the correct remote URL:

```dotenv
VITE_SUPABASE_URL=https://ycchpixzhlsvivzloyvh.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-anon-key-from-dashboard
```

- [ ] **Step 5: Write the failing Supabase env test**

Create `client/src/services/supabaseClient.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { getSupabaseEnv } from './supabaseClient';

describe('getSupabaseEnv', () => {
  it('returns configured Supabase URL and anon key', () => {
    expect(
      getSupabaseEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'anon-key',
    });
  });

  it('throws a clear error when env vars are missing', () => {
    expect(() => getSupabaseEnv({})).toThrow(
      'Missing Supabase environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY'
    );
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run:

```bash
npx vitest run client/src/services/supabaseClient.test.js
```

Expected: FAIL with an import or missing function error for `getSupabaseEnv`.

- [ ] **Step 7: Implement `client/src/services/supabaseClient.js`**

Create:

```js
import { createClient } from '@supabase/supabase-js';

export function getSupabaseEnv(env = import.meta.env) {
  const missing = [];

  if (!env.VITE_SUPABASE_URL) {
    missing.push('VITE_SUPABASE_URL');
  }

  if (!env.VITE_SUPABASE_ANON_KEY) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(', ')}`);
  }

  return {
    url: env.VITE_SUPABASE_URL,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
  };
}

export function createSupabaseBrowserClient(env = import.meta.env) {
  const { url, anonKey } = getSupabaseEnv(env);

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let browserClient;

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }

  return browserClient;
}
```

- [ ] **Step 8: Run focused test**

Run:

```bash
npx vitest run client/src/services/supabaseClient.test.js
```

Expected: PASS.

- [ ] **Step 9: Run build smoke**

Run:

```bash
npm run build
```

Expected: PASS with `.env.local` containing the remote project URL and anon key.

- [ ] **Step 10: Commit**

Run:

```bash
git add package.json package-lock.json .env.example client/src/services/supabaseClient.js client/src/services/supabaseClient.test.js
git commit -m "chore: add supabase client tooling"
```

### Task 2: Supabase Remote Schema, RLS, and Auth Bootstrap

**Files:**
- Create: `supabase/migrations/202607280001_initial_schema.sql`
- Create: `supabase/verification-queries.sql`

**Interfaces:**
- Produces tables: `profiles`, `user_settings`, `words`, `grammar_points`, `srs_cards`, `review_log`, `user_stats`, `generated_exercises`, `exercise_attempts`, `generated_readings`, `reading_attempts`
- Produces trigger function: `public.handle_new_user()`
- Consumes later: repositories and RPC functions rely on these table and column names

- [ ] **Step 1: Create migration directory**

Create the `supabase/migrations/` directory to store migration SQL files as version-controlled reference.

- [ ] **Step 2: Create verification queries file**

Create `supabase/verification-queries.sql` — run these in the Supabase SQL Editor after applying each migration to confirm correctness:

```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected: exercise_attempts, generated_exercises, generated_readings,
-- grammar_points, profiles, reading_attempts, review_log,
-- srs_cards, user_settings, user_stats, words

-- Verify RLS is enabled on all app tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;

-- Verify RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verify trigger function
SELECT proname FROM pg_proc
WHERE proname IN ('handle_new_user', 'set_updated_at')
ORDER BY proname;
```

- [ ] **Step 5: Create initial schema migration**

Create `supabase/migrations/202607280001_initial_schema.sql`:

```sql
create extension if not exists pgcrypto;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  current_level integer not null default 2 check (current_level between 1 and 6),
  cards_per_day integer not null default 20 check (cards_per_day between 1 and 100),
  max_reviews_per_session integer not null default 100 check (max_reviews_per_session between 1 and 300),
  card_order text not null default 'due' check (card_order in ('due', 'frequency')),
  ai_provider text not null default 'none' check (ai_provider in ('none', 'deepseek', 'gemini')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create table public.words (
  id bigint generated by default as identity primary key,
  hanzi text not null,
  pinyin text not null,
  meaning_en text not null,
  meaning_es text,
  hsk_level integer not null check (hsk_level between 1 and 6),
  pos text,
  frequency integer,
  created_at timestamptz not null default now(),
  unique (hanzi, pinyin, meaning_en, hsk_level)
);

create index words_hsk_level_idx on public.words(hsk_level);
create index words_hanzi_idx on public.words(hanzi);
create index words_search_idx on public.words using gin (
  to_tsvector('simple', coalesce(hanzi, '') || ' ' || coalesce(pinyin, '') || ' ' || coalesce(meaning_en, '') || ' ' || coalesce(meaning_es, ''))
);

create table public.grammar_points (
  id bigint generated by default as identity primary key,
  hsk_level integer not null check (hsk_level between 1 and 6),
  title text not null,
  explanation text not null,
  examples jsonb not null default '[]'::jsonb,
  order_idx integer,
  created_at timestamptz not null default now(),
  unique (hsk_level, title)
);

create index grammar_points_hsk_level_idx on public.grammar_points(hsk_level);

create table public.srs_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  ease_factor numeric not null default 2.5 check (ease_factor >= 1.3),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  status text not null default 'new' check (status in ('new', 'learning', 'review', 'mastered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index srs_cards_user_id_idx on public.srs_cards(user_id);
create index srs_cards_next_review_at_idx on public.srs_cards(next_review_at);

create trigger srs_cards_set_updated_at
before update on public.srs_cards
for each row execute function public.set_updated_at();

create table public.review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.srs_cards(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  quality integer not null check (quality between 0 and 5),
  time_ms integer check (time_ms is null or time_ms >= 0)
);

create index review_log_user_id_idx on public.review_log(user_id);
create index review_log_card_id_idx on public.review_log(card_id);

create table public.user_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  cards_reviewed integer not null default 0 check (cards_reviewed >= 0),
  cards_new integer not null default 0 check (cards_new >= 0),
  exercises_done integer not null default 0 check (exercises_done >= 0),
  readings_done integer not null default 0 check (readings_done >= 0),
  time_spent_ms integer not null default 0 check (time_spent_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create trigger user_stats_set_updated_at
before update on public.user_stats
for each row execute function public.set_updated_at();

create table public.generated_exercises (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching')),
  hsk_level integer not null check (hsk_level between 1 and 6),
  prompt jsonb not null,
  answer jsonb not null,
  source_model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index generated_exercises_type_level_idx on public.generated_exercises(type, hsk_level);
create index generated_exercises_created_by_idx on public.generated_exercises(created_by);

create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid references public.generated_exercises(id) on delete set null,
  submitted_answer jsonb not null,
  is_correct boolean not null,
  feedback jsonb,
  created_at timestamptz not null default now()
);

create index exercise_attempts_user_id_idx on public.exercise_attempts(user_id);

create table public.generated_readings (
  id uuid primary key default gen_random_uuid(),
  hsk_level integer not null check (hsk_level between 1 and 6),
  format text not null check (format in ('short_text', 'story', 'dialogue')),
  title text not null,
  content text not null,
  pinyin_text text,
  questions jsonb not null default '[]'::jsonb,
  source_model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index generated_readings_level_format_idx on public.generated_readings(hsk_level, format);
create index generated_readings_created_by_idx on public.generated_readings(created_by);

create table public.reading_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reading_id uuid not null references public.generated_readings(id) on delete cascade,
  answers jsonb not null,
  score integer not null check (score >= 0),
  total integer not null check (total >= 0),
  created_at timestamptz not null default now()
);

create index reading_attempts_user_id_idx on public.reading_attempts(user_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.words enable row level security;
alter table public.grammar_points enable row level security;
alter table public.srs_cards enable row level security;
alter table public.review_log enable row level security;
alter table public.user_stats enable row level security;
alter table public.generated_exercises enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.generated_readings enable row level security;
alter table public.reading_attempts enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "user_settings_select_own" on public.user_settings for select using (user_id = auth.uid());
create policy "user_settings_insert_own" on public.user_settings for insert with check (user_id = auth.uid());
create policy "user_settings_update_own" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "words_select_authenticated" on public.words for select to authenticated using (true);
create policy "grammar_points_select_authenticated" on public.grammar_points for select to authenticated using (true);

create policy "srs_cards_select_own" on public.srs_cards for select using (user_id = auth.uid());
create policy "srs_cards_insert_own" on public.srs_cards for insert with check (user_id = auth.uid());
create policy "srs_cards_update_own" on public.srs_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "review_log_select_own" on public.review_log for select using (user_id = auth.uid());

create policy "user_stats_select_own" on public.user_stats for select using (user_id = auth.uid());

create policy "generated_exercises_select_available" on public.generated_exercises
for select using (created_by is null or created_by = auth.uid());

create policy "exercise_attempts_select_own" on public.exercise_attempts for select using (user_id = auth.uid());
create policy "exercise_attempts_insert_own" on public.exercise_attempts for insert with check (user_id = auth.uid());

create policy "generated_readings_select_available" on public.generated_readings
for select using (created_by is null or created_by = auth.uid());

create policy "reading_attempts_select_own" on public.reading_attempts for select using (user_id = auth.uid());
create policy "reading_attempts_insert_own" on public.reading_attempts for insert with check (user_id = auth.uid());
```

- [ ] **Step 5: Apply schema to the remote project**

Option A — SQL Editor:

1. Open `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`
2. Paste the full contents of `supabase/migrations/202607280001_initial_schema.sql`
3. Run it
4. Run the queries from `supabase/verification-queries.sql` to confirm all tables, RLS, and triggers are in place
5. Check the Table Editor to visually confirm the 11 tables exist

Option B — CLI push:

```bash
npm run supabase:link
npx supabase db push
```

Then run verification queries in the SQL Editor.

- [ ] **Step 6: Commit**

Run:

```bash
git add supabase/migrations/202607280001_initial_schema.sql supabase/verification-queries.sql
git commit -m "feat: add supabase schema and rls"
```

### Task 3: Deterministic Supabase Seed Generation

**Files:**
- Create: `scripts/build-supabase-seed.js`
- Create: `scripts/build-supabase-seed.test.js`
- Create/Modify: `supabase/seed.sql`

**Interfaces:**
- Produces CLI command: `npm run build:supabase-seed`
- Produces seed artifact: `supabase/seed.sql`
- Consumes: `server/db/seeds/hsk1-words.json`, `server/db/seeds/hsk2-words.json`, `server/db/seeds/hsk3-words.json`, `server/db/seeds/grammar-points.json`, `server/db/seeds/exercises-pool.json`

- [ ] **Step 1: Write failing seed escaping test**

Create `scripts/build-supabase-seed.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { sqlLiteral, toJsonbLiteral } from './build-supabase-seed';

describe('Supabase seed builder', () => {
  it('escapes SQL string literals', () => {
    expect(sqlLiteral("teacher's book")).toBe("'teacher''s book'");
  });

  it('renders null as SQL null', () => {
    expect(sqlLiteral(null)).toBe('null');
  });

  it('renders JSON as a jsonb literal', () => {
    expect(toJsonbLiteral([{ text: "A's answer" }])).toBe(`'[{"text":"A''s answer"}]'::jsonb`);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx vitest run scripts/build-supabase-seed.test.js
```

Expected: FAIL because `scripts/build-supabase-seed.js` does not exist.

- [ ] **Step 3: Implement seed generator**

Create `scripts/build-supabase-seed.js`:

```js
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const seedDir = join(rootDir, 'server', 'db', 'seeds');
const outputPath = join(rootDir, 'supabase', 'seed.sql');

export function sqlLiteral(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

export function toJsonbLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value).replaceAll("'", "''"))}::jsonb`;
}

function readJson(name) {
  return JSON.parse(readFileSync(join(seedDir, name), 'utf-8'));
}

function wordRows() {
  const rows = [];

  for (const level of [1, 2, 3]) {
    const words = readJson(`hsk${level}-words.json`);
    for (const word of words) {
      rows.push(
        `(${sqlLiteral(word.hanzi)}, ${sqlLiteral(word.pinyin)}, ${sqlLiteral(word.meaning_en)}, ${sqlLiteral(word.meaning_es)}, ${level}, ${sqlLiteral(word.pos)}, ${word.frequency ?? 'null'})`
      );
    }
  }

  return rows;
}

function grammarRows() {
  return readJson('grammar-points.json').map((point) =>
    `(${point.hsk_level}, ${sqlLiteral(point.title)}, ${sqlLiteral(point.explanation)}, ${toJsonbLiteral(point.examples)}, ${point.order_idx ?? 'null'})`
  );
}

function exerciseRows() {
  return readJson('exercises-pool.json').map((exercise) =>
    `(${sqlLiteral(exercise.type)}, ${exercise.hsk_level}, ${toJsonbLiteral(exercise.prompt)}, ${toJsonbLiteral(exercise.answer)}, 'fallback', null)`
  );
}

export function buildSeedSql() {
  return `-- Generated by scripts/build-supabase-seed.js
insert into public.words (hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency)
values
${wordRows().join(',\n')}
on conflict (hanzi, pinyin, meaning_en, hsk_level) do nothing;

insert into public.grammar_points (hsk_level, title, explanation, examples, order_idx)
values
${grammarRows().join(',\n')}
on conflict (hsk_level, title) do nothing;

insert into public.generated_exercises (type, hsk_level, prompt, answer, source_model, created_by)
values
${exerciseRows().join(',\n')};
`;
}

if (process.argv[1] && process.argv[1].endsWith('build-supabase-seed.js')) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildSeedSql());
  console.log(`Wrote ${outputPath}`);
}
```

- [ ] **Step 4: Run focused test**

Run:

```bash
npx vitest run scripts/build-supabase-seed.test.js
```

Expected: PASS.

- [ ] **Step 5: Generate seed SQL**

Run:

```bash
npm run build:supabase-seed
```

Expected:

- `supabase/seed.sql` exists.
- It inserts `public.words`, `public.grammar_points`, and `public.generated_exercises`.

- [ ] **Step 6: Apply seed to the remote project**

1. Open `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`
2. Paste the full contents of `supabase/seed.sql`
3. Run it
4. Verify row counts:

```sql
select hsk_level, count(*) from public.words group by hsk_level order by hsk_level;
select count(*) from public.grammar_points;
select count(*) from public.generated_exercises;
```

- [ ] **Step 7: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add scripts/build-supabase-seed.js scripts/build-supabase-seed.test.js supabase/seed.sql package.json
git commit -m "feat: generate supabase seed data"
```

### Task 4: Web Authentication Shell

**Files:**
- Create: `client/src/services/auth.js`
- Create: `client/src/services/auth.test.js`
- Create: `client/src/stores/authStore.js`
- Create: `client/src/stores/authStore.test.js`
- Create: `client/src/pages/Auth.jsx`
- Create: `client/src/routes/ProtectedRoute.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Navbar.jsx`

**Interfaces:**
- Produces: `signUp({ email, password, displayName })`
- Produces: `signIn({ email, password })`
- Produces: `signOut()`
- Produces: `getSession()`
- Produces: `onAuthStateChange(callback)`
- Produces: `useAuthStore` with `{ session, user, loading, setSession, clearSession }`
- Consumes: `supabase` from `client/src/services/supabaseClient.js`

- [ ] **Step 1: Write failing auth service test**

Create `client/src/services/auth.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from './auth';

describe('createAuthService', () => {
  it('signs in with email and password', async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
    };
    const auth = createAuthService(supabase);

    const result = await auth.signIn({ email: 'me@example.com', password: 'secret123' });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret123',
    });
    expect(result.user.id).toBe('user-1');
  });

  it('throws Supabase auth errors', async () => {
    const supabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: new Error('no session') }),
      },
    };
    const auth = createAuthService(supabase);

    await expect(auth.signOut()).rejects.toThrow('no session');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx vitest run client/src/services/auth.test.js
```

Expected: FAIL because `createAuthService` does not exist.

- [ ] **Step 3: Implement auth service**

Create `client/src/services/auth.js`:

```js
import { getSupabaseClient } from './supabaseClient';

function unwrap({ data, error }) {
  if (error) {
    throw error;
  }

  return data;
}

export function createAuthService(client = getSupabaseClient()) {
  return {
    async signUp({ email, password, displayName }) {
      return unwrap(
        await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split('@')[0],
            },
          },
        })
      );
    },

    async signIn({ email, password }) {
      return unwrap(await client.auth.signInWithPassword({ email, password }));
    },

    async signOut() {
      return unwrap(await client.auth.signOut());
    },

    async getSession() {
      return unwrap(await client.auth.getSession());
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback);
    },
  };
}

export const auth = createAuthService();
```

- [ ] **Step 4: Write failing auth store test**

Create `client/src/stores/authStore.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { useAuthStore } from './authStore';

describe('useAuthStore', () => {
  it('stores and clears a session', () => {
    const session = { user: { id: 'user-1', email: 'me@example.com' } };

    useAuthStore.getState().setSession(session);
    expect(useAuthStore.getState().user.email).toBe('me@example.com');

    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
```

- [ ] **Step 5: Implement auth store**

Create `client/src/stores/authStore.js`:

```js
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (session) =>
    set({
      session,
      user: session?.user || null,
      loading: false,
    }),
  clearSession: () =>
    set({
      session: null,
      user: null,
      loading: false,
    }),
  setLoading: (loading) => set({ loading }),
}));
```

- [ ] **Step 6: Create protected route**

Create `client/src/routes/ProtectedRoute.jsx`:

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function ProtectedRoute() {
  const { loading, session } = useAuthStore();

  if (loading) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading session...</div>;
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 7: Create auth page**

Create `client/src/pages/Auth.jsx` with email/password signup and login:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/auth';
import { useAuthStore } from '../stores/authStore';

export default function Auth() {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data =
        mode === 'sign-up'
          ? await auth.signUp({ email, password, displayName })
          : await auth.signIn({ email, password });

      if (data.session) {
        setSession(data.session);
        navigate('/', { replace: true });
      } else {
        setError('Check your email to finish signing in.');
      }
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text)]">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h1 className="text-2xl font-bold">Hanyu</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {mode === 'sign-in' ? 'Sign in to continue learning.' : 'Create your learning account.'}
        </p>

        {mode === 'sign-up' ? (
          <label className="mt-4 block text-sm">
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            />
          </label>
        ) : null}

        <label className="mt-4 block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
          />
        </label>

        <label className="mt-4 block text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Working...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          className="mt-3 w-full text-sm text-[var(--color-text-muted)]"
        >
          {mode === 'sign-in' ? 'Create an account' : 'Use an existing account'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Wire auth into `App.jsx`**

Change `client/src/App.jsx` to initialize the session and protect app routes:

```jsx
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './routes/ProtectedRoute';
import { auth } from './services/auth';
import { useAuthStore } from './stores/authStore';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Exercises from './pages/Exercises';
import Flashcards from './pages/Flashcards';
import Grammar from './pages/Grammar';
import Readings from './pages/Readings';
import Settings from './pages/Settings';
import Words from './pages/Words';
import { useAppStore } from './stores/appStore';

export default function App() {
  const { theme } = useAppStore();
  const { setSession, clearSession } = useAuthStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    auth.getSession().then(({ session }) => {
      if (mounted) {
        setSession(session);
      }
    });

    const { data } = auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
      } else {
        clearSession();
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [clearSession, setSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="auth" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="flashcards" element={<Flashcards />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="readings" element={<Readings />} />
            <Route path="readings/:id" element={<Readings />} />
            <Route path="grammar" element={<Grammar />} />
            <Route path="words" element={<Words />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Add logout to `Navbar.jsx`**

Add a button that calls:

```js
await auth.signOut();
useAuthStore.getState().clearSession();
```

Expected UI behavior:

- Signed-in users can sign out.
- After sign out, the browser navigates to `/auth`.

- [ ] **Step 10: Run tests**

Run:

```bash
npx vitest run client/src/services/auth.test.js client/src/stores/authStore.test.js client/src/App.test.jsx
npm run build
```

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add client/src/services/auth.js client/src/services/auth.test.js client/src/stores/authStore.js client/src/stores/authStore.test.js client/src/pages/Auth.jsx client/src/routes/ProtectedRoute.jsx client/src/App.jsx client/src/components/Navbar.jsx
git commit -m "feat: add supabase auth shell"
```

### Task 5: Supabase Repositories for Words and Grammar

**Files:**
- Create: `client/src/services/repositories/words.js`
- Create: `client/src/services/repositories/words.test.js`
- Create: `client/src/services/repositories/grammar.js`
- Create: `client/src/services/repositories/grammar.test.js`
- Modify: `client/src/pages/Words.jsx`
- Modify: `client/src/pages/Grammar.jsx`

**Interfaces:**
- Produces: `getWords({ page, search, level, limit }, client?): Promise<{ words, total }>`
- Produces: `getWord(id, client?): Promise<object>`
- Produces: `getGrammar(level, client?): Promise<object[]>`
- Produces: `getGrammarPoint(level, id, client?): Promise<object>`

- [ ] **Step 1: Write failing words repository test**

Create `client/src/services/repositories/words.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { getWords } from './words';

function createQuery(result) {
  return {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
}

describe('words repository', () => {
  it('queries paginated words with level and search filters', async () => {
    const query = createQuery({ data: [{ id: 1, hanzi: '你' }], count: 1, error: null });
    const client = { from: vi.fn(() => query) };

    const result = await getWords({ page: 2, limit: 50, level: '2', search: 'ni' }, client);

    expect(client.from).toHaveBeenCalledWith('words');
    expect(query.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(query.eq).toHaveBeenCalledWith('hsk_level', 2);
    expect(query.or).toHaveBeenCalledWith('hanzi.ilike.%ni%,pinyin.ilike.%ni%,meaning_en.ilike.%ni%,meaning_es.ilike.%ni%');
    expect(query.range).toHaveBeenCalledWith(50, 99);
    expect(result).toEqual({ words: [{ id: 1, hanzi: '你' }], total: 1 });
  });
});
```

- [ ] **Step 2: Implement words repository**

Create `client/src/services/repositories/words.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function getWords({ page = 1, search = '', level = '', limit = 50 } = {}, client = getSupabaseClient()) {
  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;
  let query = client.from('words').select('*', { count: 'exact' });

  if (search) {
    const escaped = String(search).replaceAll('%', '\\%').replaceAll(',', '');
    query = query.or(
      `hanzi.ilike.%${escaped}%,pinyin.ilike.%${escaped}%,meaning_en.ilike.%${escaped}%,meaning_es.ilike.%${escaped}%`
    );
  }

  if (level) {
    query = query.eq('hsk_level', Number(level));
  }

  const { data, count, error } = await query.order('hsk_level').order('frequency').range(from, to);
  throwIfError(error);

  return {
    words: data || [],
    total: count || 0,
  };
}

export async function getWord(id, client = getSupabaseClient()) {
  const { data, error } = await client.from('words').select('*').eq('id', id).single();
  throwIfError(error);
  return data;
}
```

- [ ] **Step 3: Write grammar repository test**

Create `client/src/services/repositories/grammar.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { getGrammar } from './grammar';

describe('grammar repository', () => {
  it('loads grammar by level ordered by order index', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: 1, title: '了' }], error: null }),
    };
    const client = { from: vi.fn(() => query) };

    const result = await getGrammar(2, client);

    expect(client.from).toHaveBeenCalledWith('grammar_points');
    expect(query.eq).toHaveBeenCalledWith('hsk_level', 2);
    expect(query.order).toHaveBeenCalledWith('order_idx');
    expect(result).toEqual([{ id: 1, title: '了' }]);
  });
});
```

- [ ] **Step 4: Implement grammar repository**

Create `client/src/services/repositories/grammar.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function getGrammar(level, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('grammar_points')
    .select('*')
    .eq('hsk_level', Number(level))
    .order('order_idx');
  throwIfError(error);
  return data || [];
}

export async function getGrammarPoint(level, id, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('grammar_points')
    .select('*')
    .eq('hsk_level', Number(level))
    .eq('id', id)
    .single();
  throwIfError(error);
  return data;
}
```

- [ ] **Step 5: Update pages**

In `client/src/pages/Words.jsx`, replace:

```js
import { api } from '../services/api';
```

with:

```js
import { addCard } from '../services/repositories/flashcards';
import { getWords } from '../services/repositories/words';
```

Replace `api.getWords(params)` with `getWords(params)` and `api.addCard(wordId)` with `addCard(wordId)`.

In `client/src/pages/Grammar.jsx`, replace API calls with `getGrammar` and `getGrammarPoint`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run client/src/services/repositories/words.test.js client/src/services/repositories/grammar.test.js client/src/pages/Words.test.jsx client/src/pages/Grammar.test.jsx
```

Expected: PASS after mocks are updated to target repository functions instead of `api`.

- [ ] **Step 7: Commit**

Run:

```bash
git add client/src/services/repositories/words.js client/src/services/repositories/words.test.js client/src/services/repositories/grammar.js client/src/services/repositories/grammar.test.js client/src/pages/Words.jsx client/src/pages/Grammar.jsx client/src/pages/Words.test.jsx client/src/pages/Grammar.test.jsx
git commit -m "feat: read words and grammar from supabase"
```

### Task 6: Flashcards RPC and Web Repository

**Files:**
- Create: `supabase/migrations/202607280002_learning_rpc.sql`
- Create: `client/src/services/repositories/flashcards.js`
- Create: `client/src/services/repositories/flashcards.test.js`
- Modify: `client/src/pages/Flashcards.jsx`
- Modify: `client/src/pages/Flashcards.test.jsx`

**Interfaces:**
- Produces RPC: `public.create_starter_deck(strategy text, card_limit integer)`
- Produces RPC: `public.review_flashcard(card_id uuid, quality integer, time_ms integer)`
- Produces: `getDueCards(limit, client?): Promise<{ cards: object[] }>`
- Produces: `addCard(wordId, client?): Promise<object>`
- Produces: `createStarterDeck({ strategy, limit }, client?): Promise<object>`
- Produces: `reviewCard(id, quality, timeMs, client?): Promise<object>`

- [ ] **Step 1: Write RPC migration**

Create `supabase/migrations/202607280002_learning_rpc.sql`:

```sql
create function public.ensure_today_stats(target_user_id uuid, target_date date default current_date)
returns public.user_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  stats_row public.user_stats;
begin
  insert into public.user_stats (user_id, date)
  values (target_user_id, target_date)
  on conflict (user_id, date) do nothing;

  select *
  into stats_row
  from public.user_stats
  where user_id = target_user_id and date = target_date;

  return stats_row;
end;
$$;

create function public.create_starter_deck(strategy text default 'hsk2_consolidation', card_limit integer default 150)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_count integer := 0;
  total_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if strategy not in ('hsk2_consolidation', 'hsk1_review') then
    raise exception 'Unsupported starter deck strategy: %', strategy;
  end if;

  with selected_words as (
    select id
    from public.words
    where (
      strategy = 'hsk1_review' and hsk_level = 1
    ) or (
      strategy = 'hsk2_consolidation' and hsk_level in (1, 2)
    )
    order by hsk_level desc, frequency nulls last, id
    limit greatest(1, least(card_limit, 300))
  ),
  inserted as (
    insert into public.srs_cards (user_id, word_id, next_review_at, status)
    select current_user_id, id, now(), 'new'
    from selected_words
    on conflict (user_id, word_id) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  select count(*) into total_count
  from public.srs_cards
  where user_id = current_user_id;

  return jsonb_build_object(
    'inserted_count', inserted_count,
    'total_count', total_count,
    'strategy', strategy
  );
end;
$$;

create function public.review_flashcard(card_id uuid, quality integer, time_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  card_row public.srs_cards;
  new_ease numeric;
  new_interval integer;
  new_repetitions integer;
  new_status text;
  was_new boolean;
  next_review timestamptz;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if quality < 0 or quality > 5 then
    raise exception 'Quality must be between 0 and 5';
  end if;

  select *
  into card_row
  from public.srs_cards
  where id = card_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Card not found';
  end if;

  was_new := card_row.status = 'new' and card_row.repetitions = 0;
  new_ease := greatest(1.3, card_row.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if quality < 3 then
    new_repetitions := 0;
    new_interval := 1;
    new_status := 'learning';
  else
    new_repetitions := card_row.repetitions + 1;

    if card_row.repetitions = 0 then
      new_interval := 1;
    elsif card_row.repetitions = 1 then
      new_interval := 6;
    else
      new_interval := greatest(1, round(card_row.interval_days * new_ease)::integer);
    end if;

    new_status := case when new_interval >= 30 then 'mastered' else 'review' end;
  end if;

  next_review := now() + make_interval(days => new_interval);

  update public.srs_cards
  set
    ease_factor = new_ease,
    interval_days = new_interval,
    repetitions = new_repetitions,
    next_review_at = next_review,
    last_reviewed_at = now(),
    status = new_status
  where id = card_id and user_id = current_user_id
  returning * into card_row;

  insert into public.review_log (user_id, card_id, quality, time_ms)
  values (current_user_id, card_id, quality, time_ms);

  perform public.ensure_today_stats(current_user_id, current_date);

  update public.user_stats
  set
    cards_reviewed = cards_reviewed + 1,
    cards_new = cards_new + case when was_new then 1 else 0 end
  where user_id = current_user_id and date = current_date;

  return jsonb_build_object(
    'card', to_jsonb(card_row),
    'next_review', next_review,
    'status', new_status
  );
end;
$$;

grant execute on function public.ensure_today_stats(uuid, date) to authenticated;
grant execute on function public.create_starter_deck(text, integer) to authenticated;
grant execute on function public.review_flashcard(uuid, integer, integer) to authenticated;
```

- [ ] **Step 2: Apply RPC migration to the remote project**

1. Open `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`
2. Paste the full contents of `supabase/migrations/202607280002_learning_rpc.sql`
3. Run it
4. Verify the functions exist:

```sql
select proname
from pg_proc
where proname in ('ensure_today_stats', 'create_starter_deck', 'review_flashcard')
order by proname;
```

- [ ] **Step 3: Write flashcards repository test**

Create `client/src/services/repositories/flashcards.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { createStarterDeck, reviewCard } from './flashcards';

describe('flashcards repository', () => {
  it('calls create_starter_deck RPC', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { inserted_count: 3 }, error: null }),
    };

    const result = await createStarterDeck({ strategy: 'hsk2_consolidation', limit: 150 }, client);

    expect(client.rpc).toHaveBeenCalledWith('create_starter_deck', {
      strategy: 'hsk2_consolidation',
      card_limit: 150,
    });
    expect(result.inserted_count).toBe(3);
  });

  it('calls review_flashcard RPC', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { next_review: '2026-07-29T00:00:00Z' }, error: null }),
    };

    const result = await reviewCard('card-1', 4, 1200, client);

    expect(client.rpc).toHaveBeenCalledWith('review_flashcard', {
      card_id: 'card-1',
      quality: 4,
      time_ms: 1200,
    });
    expect(result.next_review).toBe('2026-07-29T00:00:00Z');
  });
});
```

- [ ] **Step 4: Implement flashcards repository**

Create `client/src/services/repositories/flashcards.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function getDueCards(limit = 50, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('srs_cards')
    .select('*, words(*)')
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at')
    .limit(limit);
  throwIfError(error);

  return {
    cards: (data || []).map((card) => ({
      ...card,
      ...(card.words || {}),
      word: card.words,
    })),
  };
}

export async function addCard(wordId, client = getSupabaseClient()) {
  const { data: userData, error: userError } = await client.auth.getUser();
  throwIfError(userError);

  const { data, error } = await client
    .from('srs_cards')
    .insert({
      user_id: userData.user.id,
      word_id: wordId,
      next_review_at: new Date().toISOString(),
      status: 'new',
    })
    .select()
    .single();
  throwIfError(error);
  return data;
}

export async function createStarterDeck({ strategy = 'hsk2_consolidation', limit = 150 } = {}, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('create_starter_deck', {
    strategy,
    card_limit: limit,
  });
  throwIfError(error);
  return data;
}

export async function reviewCard(id, quality, timeMs, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('review_flashcard', {
    card_id: id,
    quality,
    time_ms: timeMs,
  });
  throwIfError(error);
  return data;
}
```

- [ ] **Step 5: Update `Flashcards.jsx` imports**

Replace:

```js
import { api } from '../services/api';
```

with:

```js
import { createStarterDeck, getDueCards, reviewCard } from '../services/repositories/flashcards';
import { logTime } from '../services/repositories/stats';
```

Replace calls:

```js
api.getDueCards()
api.reviewCard(card.id, quality, timeMs)
api.logTime(Date.now() - sessionStartedAt.current)
api.createStarterDeck({ strategy: 'hsk2_consolidation', limit: 150 })
```

with:

```js
getDueCards()
reviewCard(card.id, quality, timeMs)
logTime(Date.now() - sessionStartedAt.current)
createStarterDeck({ strategy: 'hsk2_consolidation', limit: 150 })
```

- [ ] **Step 6: Run tests**

Run:

```bash
npx vitest run client/src/services/repositories/flashcards.test.js client/src/pages/Flashcards.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add supabase/migrations/202607280002_learning_rpc.sql client/src/services/repositories/flashcards.js client/src/services/repositories/flashcards.test.js client/src/pages/Flashcards.jsx client/src/pages/Flashcards.test.jsx
git commit -m "feat: move flashcards to supabase rpc"
```

### Task 7: Settings and Dashboard Repositories

**Files:**
- Create: `supabase/migrations/202607280003_dashboard_rpc.sql`
- Create: `client/src/services/repositories/settings.js`
- Create: `client/src/services/repositories/settings.test.js`
- Create: `client/src/services/repositories/stats.js`
- Create: `client/src/services/repositories/stats.test.js`
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/Settings.test.jsx`
- Modify: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Produces RPC: `public.get_dashboard()`
- Produces RPC: `public.log_study_time(ms integer)`
- Produces: `getSettings(client?): Promise<object>`
- Produces: `updateSettings(data, client?): Promise<object>`
- Produces: `getDashboard(client?): Promise<object>`
- Produces: `logTime(ms, client?): Promise<object>`

- [ ] **Step 1: Create dashboard RPC migration**

Create `supabase/migrations/202607280003_dashboard_rpc.sql`:

```sql
create function public.log_study_time(ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if ms < 0 then
    raise exception 'Study time must be non-negative';
  end if;

  perform public.ensure_today_stats(current_user_id, current_date);

  update public.user_stats
  set time_spent_ms = time_spent_ms + ms
  where user_id = current_user_id and date = current_date;

  return jsonb_build_object('logged_ms', ms);
end;
$$;

create function public.get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  today_stats public.user_stats;
  total_cards integer;
  due_cards integer;
  distribution jsonb;
  recent_activity jsonb;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_today_stats(current_user_id, current_date);

  select *
  into today_stats
  from public.user_stats
  where user_id = current_user_id and date = current_date;

  select count(*) into total_cards
  from public.srs_cards
  where user_id = current_user_id;

  select count(*) into due_cards
  from public.srs_cards
  where user_id = current_user_id and next_review_at <= now();

  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  into distribution
  from (
    select status, count(*)::integer
    from public.srs_cards
    where user_id = current_user_id
    group by status
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object('date', date, 'activity', activity) order by date), '[]'::jsonb)
  into recent_activity
  from (
    select
      date,
      (cards_reviewed + exercises_done + readings_done)::integer as activity
    from public.user_stats
    where user_id = current_user_id and date >= current_date - interval '13 days'
  ) activity_rows;

  return jsonb_build_object(
    'total_cards', total_cards,
    'due_cards', due_cards,
    'today', to_jsonb(today_stats),
    'srs_distribution', distribution,
    'recent_activity', recent_activity
  );
end;
$$;

grant execute on function public.log_study_time(integer) to authenticated;
grant execute on function public.get_dashboard() to authenticated;
```

- [ ] **Step 2: Apply dashboard RPC migration to the remote project**

1. Open `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`
2. Paste the full contents of `supabase/migrations/202607280003_dashboard_rpc.sql`
3. Run it
4. Verify the functions exist:

```sql
select proname
from pg_proc
where proname in ('log_study_time', 'get_dashboard')
order by proname;
```

- [ ] **Step 3: Write settings repository test**

Create `client/src/services/repositories/settings.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { updateSettings } from './settings';

describe('settings repository', () => {
  it('updates only supported settings columns', async () => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { theme: 'dark' }, error: null }),
    };
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn(() => query),
    };

    const result = await updateSettings({ theme: 'dark', api_key: 'secret' }, client);

    expect(query.update).toHaveBeenCalledWith({ theme: 'dark' });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ theme: 'dark' });
  });
});
```

- [ ] **Step 4: Implement settings repository**

Create `client/src/services/repositories/settings.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

const ALLOWED_SETTINGS = [
  'theme',
  'current_level',
  'cards_per_day',
  'max_reviews_per_session',
  'card_order',
  'ai_provider',
];

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

async function getCurrentUserId(client) {
  const { data, error } = await client.auth.getUser();
  throwIfError(error);
  return data.user.id;
}

export async function getSettings(client = getSupabaseClient()) {
  const userId = await getCurrentUserId(client);
  const { data, error } = await client.from('user_settings').select('*').eq('user_id', userId).single();
  throwIfError(error);
  return data;
}

export async function updateSettings(data, client = getSupabaseClient()) {
  const userId = await getCurrentUserId(client);
  const changes = Object.fromEntries(
    Object.entries(data).filter(([key, value]) => ALLOWED_SETTINGS.includes(key) && value !== undefined)
  );

  const { data: updated, error } = await client
    .from('user_settings')
    .update(changes)
    .eq('user_id', userId)
    .select()
    .single();
  throwIfError(error);
  return updated;
}
```

- [ ] **Step 5: Write stats repository test**

Create `client/src/services/repositories/stats.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { getDashboard, logTime } from './stats';

describe('stats repository', () => {
  it('loads dashboard through RPC', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { total_cards: 2 }, error: null }) };

    await expect(getDashboard(client)).resolves.toEqual({ total_cards: 2 });
    expect(client.rpc).toHaveBeenCalledWith('get_dashboard');
  });

  it('logs study time through RPC', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { logged_ms: 500 }, error: null }) };

    await expect(logTime(500, client)).resolves.toEqual({ logged_ms: 500 });
    expect(client.rpc).toHaveBeenCalledWith('log_study_time', { ms: 500 });
  });
});
```

- [ ] **Step 6: Implement stats repository**

Create `client/src/services/repositories/stats.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function getDashboard(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('get_dashboard');
  throwIfError(error);
  return data;
}

export async function logTime(ms, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('log_study_time', { ms });
  throwIfError(error);
  return data;
}
```

- [ ] **Step 7: Update Settings and Dashboard pages**

In `client/src/pages/Settings.jsx`, replace `api.getSettings()` and `api.updateSettings(data)` with repository calls.

In `client/src/pages/Dashboard.jsx`, replace `api.getDashboard()` with `getDashboard()`.

Keep the existing display names by mapping Supabase response keys in the page:

```js
const dashboard = {
  totalCards: data.total_cards,
  dueCards: data.due_cards,
  today: data.today,
  srsDistribution: data.srs_distribution,
  recentActivity: data.recent_activity,
};
```

- [ ] **Step 8: Run tests**

Run:

```bash
npx vitest run client/src/services/repositories/settings.test.js client/src/services/repositories/stats.test.js client/src/pages/Settings.test.jsx client/src/pages/Dashboard.test.jsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add supabase/migrations/202607280003_dashboard_rpc.sql client/src/services/repositories/settings.js client/src/services/repositories/settings.test.js client/src/services/repositories/stats.js client/src/services/repositories/stats.test.js client/src/pages/Settings.jsx client/src/pages/Settings.test.jsx client/src/pages/Dashboard.jsx client/src/pages/Dashboard.test.jsx
git commit -m "feat: move settings and dashboard to supabase"
```

### Task 8: Edge Functions for Exercise and Reading Generation

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/_shared/ai.ts`
- Create: `supabase/functions/generate-exercise/index.ts`
- Create: `supabase/functions/generate-reading/index.ts`
- Create: `client/src/services/repositories/exercises.js`
- Create: `client/src/services/repositories/exercises.test.js`
- Create: `client/src/services/repositories/readings.js`
- Create: `client/src/services/repositories/readings.test.js`
- Modify: `client/src/pages/Exercises.jsx`
- Modify: `client/src/pages/Readings.jsx`

**Interfaces:**
- Produces Edge Function: `generate-exercise`
- Produces Edge Function: `generate-reading`
- Produces: `generateExercise(type, level, client?): Promise<object>`
- Produces: `checkExercise(id, answer, client?): Promise<object>`
- Produces: `getReadings(params, client?): Promise<object>`
- Produces: `getReading(id, client?): Promise<object>`
- Produces: `generateReading(level, format, client?): Promise<object>`

- [ ] **Step 1: Create shared CORS helper**

Create `supabase/functions/_shared/cors.ts`:

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
```

- [ ] **Step 2: Create shared Supabase helper**

Create `supabase/functions/_shared/supabase.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function createUserClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error('Missing Supabase function environment');
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  });
}
```

- [ ] **Step 3: Create AI/fallback helper**

Create `supabase/functions/_shared/ai.ts`:

```ts
export async function getProviderName(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('ai_provider')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data?.ai_provider || 'none';
}

export async function pickFallbackExercise(supabase: any, type: string, level: number) {
  const { data, error } = await supabase
    .from('generated_exercises')
    .select('*')
    .eq('type', type)
    .eq('hsk_level', level)
    .is('created_by', null)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

export async function pickFallbackReading(supabase: any, level: number, format: string) {
  const { data, error } = await supabase
    .from('generated_readings')
    .select('*')
    .eq('hsk_level', level)
    .eq('format', format)
    .is('created_by', null)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}
```

- [ ] **Step 4: Implement `generate-exercise` Edge Function**

Create `supabase/functions/generate-exercise/index.ts`:

```ts
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getProviderName, pickFallbackExercise } from '../_shared/ai.ts';
import { createUserClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createUserClient(req);
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { type, level } = await req.json();
    const hskLevel = Number(level);
    const provider = await getProviderName(supabase, userData.user.id);

    if (provider !== 'none') {
      return jsonResponse({ error: 'AI generation is not implemented for this provider yet' }, 501);
    }

    const fallback = await pickFallbackExercise(supabase, type, hskLevel);

    if (!fallback) {
      return jsonResponse({ error: 'No fallback exercise available' }, 404);
    }

    return jsonResponse(fallback);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
```

- [ ] **Step 5: Implement `generate-reading` Edge Function**

Create `supabase/functions/generate-reading/index.ts`:

```ts
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getProviderName, pickFallbackReading } from '../_shared/ai.ts';
import { createUserClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createUserClient(req);
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { level, format } = await req.json();
    const hskLevel = Number(level);
    const provider = await getProviderName(supabase, userData.user.id);

    if (provider !== 'none') {
      return jsonResponse({ error: 'AI generation is not implemented for this provider yet' }, 501);
    }

    const fallback = await pickFallbackReading(supabase, hskLevel, format);

    if (!fallback) {
      return jsonResponse({ error: 'No fallback reading available' }, 404);
    }

    return jsonResponse(fallback);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
```

- [ ] **Step 6: Write repository tests**

Create `client/src/services/repositories/exercises.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { generateExercise } from './exercises';

describe('exercises repository', () => {
  it('invokes generate-exercise function', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { id: 'exercise-1' }, error: null }),
      },
    };

    await expect(generateExercise('fill_blank', 2, client)).resolves.toEqual({ id: 'exercise-1' });
    expect(client.functions.invoke).toHaveBeenCalledWith('generate-exercise', {
      body: { type: 'fill_blank', level: 2 },
    });
  });
});
```

Create `client/src/services/repositories/readings.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { generateReading } from './readings';

describe('readings repository', () => {
  it('invokes generate-reading function', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { id: 'reading-1' }, error: null }),
      },
    };

    await expect(generateReading(2, 'short_text', client)).resolves.toEqual({ id: 'reading-1' });
    expect(client.functions.invoke).toHaveBeenCalledWith('generate-reading', {
      body: { level: 2, format: 'short_text' },
    });
  });
});
```

- [ ] **Step 7: Implement exercise and reading repositories**

Create `client/src/services/repositories/exercises.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function generateExercise(type, level, client = getSupabaseClient()) {
  const { data, error } = await client.functions.invoke('generate-exercise', {
    body: { type, level },
  });
  throwIfError(error);
  return data;
}

export async function checkExercise(id, answer, client = getSupabaseClient()) {
  const { data, error } = await client.from('exercise_attempts').insert({
    exercise_id: id,
    submitted_answer: answer,
    is_correct: false,
    feedback: { pending_server_check: true },
  }).select().single();
  throwIfError(error);
  return data;
}
```

Create `client/src/services/repositories/readings.js`:

```js
import { getSupabaseClient } from '../supabaseClient';

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

export async function getReadings({ level = '', format = '', limit = 20 } = {}, client = getSupabaseClient()) {
  let query = client.from('generated_readings').select('id, hsk_level, format, title, created_at, source_model');

  if (level) {
    query = query.eq('hsk_level', Number(level));
  }

  if (format) {
    query = query.eq('format', format);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  throwIfError(error);
  return { readings: data || [] };
}

export async function getReading(id, client = getSupabaseClient()) {
  const { data, error } = await client.from('generated_readings').select('*').eq('id', id).single();
  throwIfError(error);
  return data;
}

export async function generateReading(level, format, client = getSupabaseClient()) {
  const { data, error } = await client.functions.invoke('generate-reading', {
    body: { level, format },
  });
  throwIfError(error);
  return data;
}
```

- [ ] **Step 8: Update pages and tests**

In `client/src/pages/Exercises.jsx`, replace `api.generateExercise`, `api.checkExercise`, and `api.getExerciseHistory` with repository functions. Keep exercise history hidden or backed by direct `exercise_attempts` query in the repository.

In `client/src/pages/Readings.jsx`, replace reading list/detail/generation calls with repository functions.

Update page tests to mock repository functions.

- [ ] **Step 9: Deploy Edge Functions to remote project**

Ensure the project is linked:

```bash
npm run supabase:link
```

Deploy both functions:

```bash
npx supabase functions deploy generate-exercise
npx supabase functions deploy generate-reading
```

Set Edge Function secrets if AI providers are enabled:

```bash
npx supabase secrets set DEEPSEEK_API_KEY=<value>
npx supabase secrets set GEMINI_API_KEY=<value>
```

Verify in the Supabase dashboard → Edge Functions that both functions appear and are active.

- [ ] **Step 10: Run tests**

Run:

```bash
npx vitest run client/src/services/repositories/exercises.test.js client/src/services/repositories/readings.test.js client/src/pages/Exercises.test.jsx client/src/pages/Readings.test.jsx
npm run build
```

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add supabase/functions client/src/services/repositories/exercises.js client/src/services/repositories/exercises.test.js client/src/services/repositories/readings.js client/src/services/repositories/readings.test.js client/src/pages/Exercises.jsx client/src/pages/Readings.jsx
git commit -m "feat: add supabase functions for generated learning content"
```

### Task 9: Remove Production `/api` Dependency and Document Deployment

**Files:**
- Modify: `client/src/services/api.js`
- Modify: `server/app.js`
- Modify: `README.md`
- Create: `docs/deployment-supabase.md`

**Interfaces:**
- Produces deployment doc with hosted Supabase setup, env vars, migrations, seeds, Edge Function secrets, and web hosting steps.
- Preserves: `npm start` as local legacy Express mode until the user explicitly removes it.

- [ ] **Step 1: Find remaining `/api` imports**

Run:

```bash
rg -n "from '../services/api'|from \"../services/api\"|api\\." client/src
```

Expected: no page imports rely on `client/src/services/api.js`. If output exists, migrate that file to a repository before continuing.

- [ ] **Step 2: Convert `api.js` to a legacy warning facade**

Modify `client/src/services/api.js`:

```js
export const api = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`Legacy API method api.${String(property)} was called after Supabase migration`);
    },
  }
);
```

- [ ] **Step 3: Write deployment doc**

Create `docs/deployment-supabase.md`:

```markdown
# Hanyu Supabase Deployment

## Required Services

- Supabase hosted project (`ycchpixzhlsvivzloyvh`) for Auth, Postgres, RLS, and Edge Functions.
- Static web hosting for the React build.
- Expo/EAS for the later mobile app.

## Development Setup

1. Copy `.env.example` to `.env.local`.
2. Paste the anon key from the Supabase dashboard (Settings → API) into `.env.local`.
3. Run `npm install`.
4. Run `npm run build:supabase-seed`.
5. Apply migrations in the SQL Editor: `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`
6. Apply `supabase/seed.sql` in the SQL Editor.
7. Run `npm run dev`.

## Applying Migrations via CLI

```bash
npm run supabase:link
npx supabase db push
```

## Deploying Edge Functions

```bash
npm run supabase:link
npx supabase functions deploy generate-exercise
npx supabase functions deploy generate-reading
npx supabase secrets set DEEPSEEK_API_KEY=<value>
npx supabase secrets set GEMINI_API_KEY=<value>
```

## Web Hosting Env Vars

Set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not set service-role or provider API keys in web hosting env vars.

## Deploy Verification

- Sign up with a real email.
- Confirm login redirects to the Today dashboard.
- Create starter deck.
- Review one flashcard.
- Refresh and verify progress persists.
- Sign out and confirm protected routes redirect to `/auth`.
```

- [ ] **Step 4: Update README**

Add a "Supabase deployment" section that links to `docs/deployment-supabase.md` and says:

```markdown
## Supabase Deployment

The production path is Supabase-first: Auth, Postgres, RLS, and Edge Functions. See `docs/deployment-supabase.md` for setup, required environment variables, and verification steps.
```

- [ ] **Step 5: Run final verification**

Run:

```bash
rg -n "localhost:3001|/api" client/src
npm test
npm run build
```

Expected:

- `rg` finds no production client dependency on `/api`.
- Tests pass.
- Build passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add client/src/services/api.js README.md docs/deployment-supabase.md
git commit -m "docs: document supabase deployment path"
```

### Task 10: Mobile App Bootstrap Contract

**Files:**
- Create: `docs/mobile-app-bootstrap.md`
- Create: `packages/supabase-contract/README.md`
- Create: `packages/supabase-contract/index.js`

**Interfaces:**
- Produces: shared contract list for Expo implementation.
- Produces: `packages/supabase-contract/index.js` exporting table names, RPC names, and Edge Function names.

- [ ] **Step 1: Create shared contract package**

Create `packages/supabase-contract/index.js`:

```js
export const tables = {
  profiles: 'profiles',
  userSettings: 'user_settings',
  words: 'words',
  grammarPoints: 'grammar_points',
  srsCards: 'srs_cards',
  reviewLog: 'review_log',
  userStats: 'user_stats',
  generatedExercises: 'generated_exercises',
  exerciseAttempts: 'exercise_attempts',
  generatedReadings: 'generated_readings',
  readingAttempts: 'reading_attempts',
};

export const rpc = {
  createStarterDeck: 'create_starter_deck',
  reviewFlashcard: 'review_flashcard',
  logStudyTime: 'log_study_time',
  getDashboard: 'get_dashboard',
};

export const functions = {
  generateExercise: 'generate-exercise',
  generateReading: 'generate-reading',
};
```

- [ ] **Step 2: Document contract package**

Create `packages/supabase-contract/README.md`:

```markdown
# Hanyu Supabase Contract

This package defines stable Supabase table, RPC, and Edge Function names shared by the web app and the future Expo mobile app.

Do not rename exported identifiers without updating both clients and the Supabase migration plan.
```

- [ ] **Step 3: Create mobile bootstrap doc**

Create `docs/mobile-app-bootstrap.md`:

```markdown
# Hanyu Mobile App Bootstrap

## Recommended Stack

- Expo
- React Native
- `@supabase/supabase-js`
- Shared Supabase contract from `packages/supabase-contract`

## First Mobile Scope

1. Auth: email/password login and signup.
2. Today dashboard: read `get_dashboard`.
3. Flashcards: read due cards and call `review_flashcard`.
4. Settings: read and update `user_settings`.

## Deferred Mobile Scope

- AI exercise generation.
- Reading generation.
- Offline-first sync.
- Push notifications.

## Required Environment

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Do not put service-role keys, DeepSeek keys, or Gemini keys in Expo environment variables.
```

- [ ] **Step 4: Run repository references check**

Run:

```bash
rg -n "create_starter_deck|review_flashcard|log_study_time|get_dashboard|generate-exercise|generate-reading" client supabase packages docs
```

Expected: output includes the new contract package and current web/Supabase usage.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/mobile-app-bootstrap.md packages/supabase-contract
git commit -m "docs: define mobile supabase contract"
```

## Final Verification

After all tasks are complete, run:

```bash
npm test
npm run build
npm run build:supabase-seed
rg -n "from '../services/api'|from \"../services/api\"|api\\.|localhost:3001|better-sqlite3" client/src
```

Then verify in the Supabase dashboard (`https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh`):

- All 11 tables exist in the Table Editor
- RLS is enabled on all tables
- RPC functions (`create_starter_deck`, `review_flashcard`, `log_study_time`, `get_dashboard`, `ensure_today_stats`) exist
- Edge Functions (`generate-exercise`, `generate-reading`) are deployed
- Seed data is present (words, grammar_points, generated_exercises)

Expected:

- Vitest passes.
- Vite build passes.
- The `rg` command finds no production client dependency on Express, SQLite, or `/api`.
- Remote Supabase project has all schema, data, and functions in place.

## References

- Supabase Data APIs: https://supabase.com/docs/guides/api
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase CLI: https://supabase.com/docs/guides/local-development/cli/getting-started
