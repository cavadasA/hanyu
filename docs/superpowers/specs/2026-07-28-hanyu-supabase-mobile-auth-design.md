# Hanyu Supabase Mobile Auth Design

**Date:** 2026-07-28
**Status:** Draft for user review
**Audience:** Personal HSK learner now, deployable web and mobile product later

## Context

Hanyu is currently a local full-stack app: React + Vite in `client`, Express in
`server`, and SQLite via `better-sqlite3`. The current codebase was created
quickly and intentionally keeps V1 simple: single user, no authentication, and
all user data stored locally in `hanyu.db`.

The product direction has changed. Hanyu should be deployable as a real web app
and compatible with building a mobile app in parallel. The user prefers a
Supabase-first architecture where web and mobile talk almost directly to
Supabase instead of keeping a custom Express API as the permanent backend.

This is the right moment to make that migration. The Express layer is still
small, the database schema is clear, and the app has not yet accumulated enough
backend-specific behavior to justify carrying a separate server into production.

## Decision

Adopt a Supabase-first architecture:

- Supabase Auth provides real login from the first deployed version.
- Supabase Postgres replaces SQLite as the source of truth.
- React web and the future Expo/React Native mobile app use Supabase directly
  for normal reads and writes.
- Row Level Security protects all user-owned data.
- Supabase Edge Functions and Postgres RPC handle sensitive or transactional
  operations.
- The existing Express server becomes migration reference code, then can be
  removed once the web client no longer depends on `/api`.

This is not a "no backend" design. It is a thin-backend design where Supabase
owns database, auth, policies, generated APIs, and server-side functions.

## Goals

- Deploy Hanyu as a real authenticated web app.
- Replace the hardcoded `user_id = 1` model with Supabase Auth users.
- Create one shared data model for web and mobile.
- Avoid storing provider API keys in browser or mobile clients.
- Preserve current learning features: words, grammar, flashcards, reviews,
  exercises, readings, settings, stats, and daily progress.
- Make the migration incremental so the app remains testable after each phase.

## Non-Goals

- No payments or subscriptions in this migration.
- No teacher/admin product surface.
- No social features.
- No HSK4-6 content expansion.
- No offline-first mobile sync in the first Supabase migration.
- No permanent custom Express API unless a future need clearly justifies it.

## Product Shape

The deployed product should feel like:

> Sign in anywhere, continue today's Chinese session, and keep progress synced
> across web and mobile.

Auth is part of the core experience rather than an afterthought. The first
screen for signed-out users is login/signup. The first screen for signed-in
users is the daily learning dashboard.

## Architecture

### Runtime Architecture

| Surface | Responsibility |
| --- | --- |
| React web app | Browser UI, authenticated Supabase client, learning interactions |
| Expo mobile app | Mobile UI, authenticated Supabase client, same product flows |
| Supabase Auth | Email/password login, session refresh, user identity |
| Supabase Postgres | Main data store, global content, user progress |
| Supabase RLS | Row ownership and access control |
| Postgres RPC | Small transactional operations close to data |
| Supabase Edge Functions | AI generation and secret-backed server operations |
| Static hosting | Serve the built React app |

### Client Boundary

Clients may directly access:

- global read content such as `words` and `grammar_points`;
- the authenticated user's own `profile`, `user_settings`, `srs_cards`,
  `review_log`, and `user_stats`;
- generated/cached content that policies allow them to read.

Clients must not directly handle:

- DeepSeek or Gemini API keys;
- service-role Supabase keys;
- cross-user writes;
- flashcard review updates that must atomically update card state, review log,
  and stats;
- starter deck creation if it inserts many rows based on server-side rules.

## Data Model

### `profiles`

One row per Supabase Auth user.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key references auth.users(id)` | Same id as Auth user |
| `display_name` | `text` | Optional |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |
| `updated_at` | `timestamptz not null default now()` | Updated by trigger |

RLS:

- Users can select, insert, and update only their own profile.

### `user_settings`

Typed replacement for the current JSON blob in `users.settings`.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid primary key references profiles(id)` | Owner |
| `theme` | `text not null default 'light'` | `light`, `dark`, or `system` |
| `current_level` | `integer not null default 2` | Check between 1 and 6 |
| `cards_per_day` | `integer not null default 20` | Check between 1 and 100 |
| `max_reviews_per_session` | `integer not null default 100` | Check between 1 and 300 |
| `card_order` | `text not null default 'due'` | `due` or `frequency` |
| `ai_provider` | `text not null default 'none'` | `none`, `deepseek`, `gemini` |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |
| `updated_at` | `timestamptz not null default now()` | Updated by trigger |

API keys are not stored here. Production AI keys live in Supabase secrets and
are used only by Edge Functions. If per-user keys are ever required, they must
be encrypted and never returned to clients.

RLS:

- Users can select, insert, and update only their own settings.

### `words`

Global vocabulary table migrated from SQLite.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint generated by default as identity primary key` | Stable numeric id |
| `hanzi` | `text not null` | Chinese characters |
| `pinyin` | `text not null` | Tone-mark pinyin |
| `meaning_en` | `text not null` | English meaning |
| `meaning_es` | `text` | Spanish meaning when available |
| `hsk_level` | `integer not null` | Check between 1 and 6 |
| `pos` | `text` | Part of speech |
| `frequency` | `integer` | Optional rank |

RLS:

- Authenticated users can read all rows.
- Clients cannot insert, update, or delete rows.
- Seed/import scripts use a privileged local migration connection.

### `grammar_points`

Global grammar reference table migrated from SQLite.

RLS:

- Authenticated users can read all rows.
- Clients cannot insert, update, or delete rows.

### `srs_cards`

User-owned SRS card state.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Client-safe id |
| `user_id` | `uuid not null references profiles(id)` | Owner |
| `word_id` | `bigint not null references words(id)` | Vocabulary item |
| `ease_factor` | `numeric not null default 2.5` | SM-2 ease |
| `interval_days` | `integer not null default 0` | Days until next review |
| `repetitions` | `integer not null default 0` | Consecutive remembered reviews |
| `next_review_at` | `timestamptz not null` | Due timestamp |
| `last_reviewed_at` | `timestamptz` | Last review timestamp |
| `status` | `text not null default 'new'` | `new`, `learning`, `review`, `mastered` |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |
| `updated_at` | `timestamptz not null default now()` | Updated by trigger |

Constraints:

- Unique `(user_id, word_id)` prevents duplicate cards.

RLS:

- Users can select their own cards.
- Users can insert their own cards.
- Direct updates are limited to safe fields only if needed.
- Review mutations should use RPC or Edge Function to preserve invariants.

### `review_log`

Immutable-ish history of SRS reviews.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Log id |
| `user_id` | `uuid not null references profiles(id)` | Owner |
| `card_id` | `uuid not null references srs_cards(id)` | Reviewed card |
| `reviewed_at` | `timestamptz not null default now()` | Review timestamp |
| `quality` | `integer not null` | Check between 0 and 5 |
| `time_ms` | `integer` | Optional response time |

RLS:

- Users can read their own review log.
- Users should not directly edit old review rows.
- Inserts happen through `review_flashcard` RPC or Edge Function.

### `user_stats`

Daily user activity counters.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Row id |
| `user_id` | `uuid not null references profiles(id)` | Owner |
| `date` | `date not null` | User activity date |
| `cards_reviewed` | `integer not null default 0` | Reviews completed |
| `cards_new` | `integer not null default 0` | New cards first reviewed |
| `exercises_done` | `integer not null default 0` | Exercise completions |
| `readings_done` | `integer not null default 0` | Reading completions |
| `time_spent_ms` | `integer not null default 0` | Study time |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |
| `updated_at` | `timestamptz not null default now()` | Updated by trigger |

Constraints:

- Unique `(user_id, date)`.

RLS:

- Users can read their own stats.
- Stats increments should happen through RPC/Edge Functions or constrained
  update helpers to avoid accidental client-side counter drift.

### `generated_exercises`

Generated or fallback exercise content. This replaces the current single
`exercises` table as reusable content.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Content id |
| `type` | `text not null` | Existing exercise type enum |
| `hsk_level` | `integer not null` | Check between 1 and 6 |
| `prompt` | `jsonb not null` | Exercise body |
| `answer` | `jsonb not null` | Canonical answer |
| `source_model` | `text` | `fallback`, `deepseek`, `gemini` |
| `created_by` | `uuid references profiles(id)` | Null for global fallback |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |

RLS:

- Authenticated users can read global fallback rows.
- Users can read rows they generated.
- Writes happen through Edge Functions.

### `exercise_attempts`

User-specific exercise result history.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Attempt id |
| `user_id` | `uuid not null references profiles(id)` | Owner |
| `exercise_id` | `uuid references generated_exercises(id)` | Optional content link |
| `submitted_answer` | `jsonb not null` | User answer |
| `is_correct` | `boolean not null` | Result |
| `feedback` | `jsonb` | Optional correction metadata |
| `created_at` | `timestamptz not null default now()` | Attempt timestamp |

RLS:

- Users can read their own attempts.
- Inserts happen directly only if validation is simple; otherwise through RPC.

### `generated_readings`

Generated or fallback reading content.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Reading id |
| `hsk_level` | `integer not null` | Check between 1 and 6 |
| `format` | `text not null` | `short_text`, `story`, `dialogue` |
| `title` | `text not null` | Reading title |
| `content` | `text not null` | Chinese text |
| `pinyin_text` | `text` | Optional pinyin |
| `questions` | `jsonb not null default '[]'::jsonb` | Canonical questions |
| `source_model` | `text` | `fallback`, `deepseek`, `gemini` |
| `created_by` | `uuid references profiles(id)` | Null for global fallback |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |

RLS:

- Authenticated users can read global fallback rows.
- Users can read rows they generated.
- Writes happen through Edge Functions.

### `reading_attempts`

User-specific reading completion and comprehension score.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Attempt id |
| `user_id` | `uuid not null references profiles(id)` | Owner |
| `reading_id` | `uuid not null references generated_readings(id)` | Reading |
| `answers` | `jsonb not null` | Submitted answers |
| `score` | `integer not null` | Correct count |
| `total` | `integer not null` | Question count |
| `created_at` | `timestamptz not null default now()` | Attempt timestamp |

RLS:

- Users can select and insert only their own attempts.

## Authentication

Initial auth mode:

- Email/password signup and login.
- Password reset enabled through Supabase Auth.
- Session persistence handled by Supabase client libraries.
- Web callback URL configured for local development and production domain.
- Mobile deep link callback added when Expo app is created.

Post-signup bootstrap:

1. Auth user is created.
2. Database trigger creates `profiles` row.
3. Database trigger or first-login client call creates `user_settings`.
4. Signed-in user lands on Today dashboard.
5. Empty deck state offers starter deck creation.

## Security Model

RLS is mandatory for all app tables.

Principles:

- Global content can be readable by authenticated users.
- User-owned tables require `user_id = auth.uid()`.
- Clients never receive service-role keys.
- AI provider secrets live only in Supabase Edge Function secrets.
- Direct table updates are allowed only where the client cannot violate product
  invariants.
- Operations that touch multiple tables should be RPC or Edge Functions.

## Server-Side Operations

### `review_flashcard`

Preferred implementation: Postgres RPC.

Input:

- `card_id uuid`
- `quality integer`
- `time_ms integer`

Behavior:

- Confirms the card belongs to `auth.uid()`.
- Applies SM-2.
- Updates `srs_cards`.
- Inserts `review_log`.
- Increments `user_stats.cards_reviewed`.
- Increments `user_stats.cards_new` if this is the first review of a new card.
- Returns updated card state and next due summary.

### `create_starter_deck`

Preferred implementation: Postgres RPC if selection logic stays SQL-only, Edge
Function if it becomes more complex.

Input:

- `strategy text`, initially `hsk2_consolidation` or `hsk1_review`.

Behavior:

- Inserts missing `srs_cards` for the authenticated user.
- Avoids duplicates through `(user_id, word_id)`.
- Returns inserted count and total deck count.

### `generate_exercise`

Preferred implementation: Edge Function.

Behavior:

- Reads authenticated user's settings.
- Uses Supabase secrets for provider API keys.
- Falls back to seeded content if provider is `none` or generation fails.
- Stores generated content in `generated_exercises`.
- Returns one exercise payload.

### `check_exercise`

Preferred implementation: RPC or Edge Function.

Behavior:

- Normalizes answer.
- Inserts `exercise_attempts`.
- Increments `user_stats.exercises_done`.
- Returns correctness and feedback.

### `generate_reading`

Preferred implementation: Edge Function.

Behavior:

- Reads authenticated user's settings.
- Uses Supabase secrets for provider API keys.
- Falls back to seeded reading if provider is `none` or generation fails.
- Stores generated reading in `generated_readings`.
- Returns reading payload.

### `submit_reading_attempt`

Preferred implementation: RPC or Edge Function.

Behavior:

- Normalizes answer formats.
- Inserts `reading_attempts`.
- Increments `user_stats.readings_done`.
- Returns score and corrected answers.

## Web Migration

Replace `client/src/services/api.js` with a Supabase-backed data layer.

New client modules:

- `client/src/services/supabaseClient.js`: initializes Supabase with public URL
  and anon key.
- `client/src/services/auth.js`: signup, login, logout, session helpers.
- `client/src/services/repositories/words.js`: word queries.
- `client/src/services/repositories/grammar.js`: grammar queries.
- `client/src/services/repositories/flashcards.js`: deck, due cards, review RPC.
- `client/src/services/repositories/exercises.js`: function invocation and
  attempts.
- `client/src/services/repositories/readings.js`: function invocation and
  attempts.
- `client/src/services/repositories/stats.js`: dashboard stats queries.
- `client/src/services/repositories/settings.js`: settings reads and updates.

Routing changes:

- Signed-out users see an auth page.
- Signed-in users see the existing app shell.
- Protected routes redirect to auth if no session exists.

Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The anon key is safe to expose only with correct RLS policies. The service-role
key must never be added to Vite, Expo, or any browser/mobile environment.

## Mobile Compatibility

The future mobile app should use Expo/React Native and share product contracts
with web.

Recommended structure when mobile begins:

```text
hanyu/
|-- apps/
|   |-- web/
|   `-- mobile/
|-- packages/
|   |-- domain/
|   `-- supabase/
|-- supabase/
|   |-- migrations/
|   |-- functions/
|   `-- seed.sql
```

Do not restructure into a monorepo before the Supabase migration unless the web
implementation becomes awkward. The first step can keep the current `client/`
folder and introduce shared modules later.

Shared contracts to preserve:

- table names and column names;
- RPC/function names;
- canonical exercise and reading JSON shapes;
- auth session behavior;
- typed repository function signatures.

## Deployment

Production components:

- Supabase hosted project for Auth, Postgres, RLS, and Edge Functions.
- Static web hosting for the React build.
- Expo/EAS later for mobile builds.

Deployment setup:

- Configure Supabase project URL and anon key in web hosting env vars.
- Configure Edge Function secrets for `DEEPSEEK_API_KEY` and
  `GEMINI_API_KEY` if those providers are enabled.
- Configure Auth redirect URLs for local web, production web, and later mobile
  deep links.
- Run Supabase migrations in CI or with the Supabase CLI before deploying app
  code that depends on schema changes.

## Migration Strategy

### Phase 1: Supabase Project Foundation

- Add Supabase CLI project files.
- Create initial Postgres migration for tables, constraints, indexes, triggers,
  and RLS policies.
- Convert SQLite seed JSON into Supabase seed SQL or import scripts.
- Add local `.env.example` for Supabase client variables.

Success criteria:

- A fresh Supabase database can be created from migrations and seeds.
- Authenticated test users can read global words and grammar.
- User A cannot read User B's cards, settings, stats, or attempts.

### Phase 2: Auth in Web Client

- Add Supabase JS client.
- Add auth store/session handling.
- Add login, signup, logout, and password reset UI.
- Protect existing app routes.
- Keep Express routes temporarily available while data migration continues.

Success criteria:

- A real user can sign up, sign in, refresh the page, and remain signed in.
- Signed-out users cannot access learning routes.

### Phase 3: Read-Only Content Migration

- Move `words` and `grammar_points` reads from Express to Supabase.
- Keep UI behavior the same.
- Remove migrated Express route usage from the client.

Success criteria:

- Words and Grammar pages work from Supabase in local and deployed web.

### Phase 4: User Settings and Flashcards

- Migrate settings to `user_settings`.
- Migrate SRS card queries to Supabase.
- Implement `create_starter_deck`.
- Implement `review_flashcard`.
- Update flashcard UI to use RPC results.

Success criteria:

- A signed-in user can create a starter deck, review due cards, and see stats
  update without Express.

### Phase 5: Exercises, Readings, and AI

- Implement generation Edge Functions.
- Implement attempt/check RPC or Edge Functions.
- Store generated content and attempts in Supabase.
- Keep fallback content available when AI is disabled or fails.

Success criteria:

- Exercises and readings work without exposing provider API keys to the client.
- Completion updates stats correctly.

### Phase 6: Dashboard and Deploy Cleanup

- Move dashboard/streak queries to Supabase views/RPC where useful.
- Remove obsolete client `/api` calls.
- Remove or archive Express/SQLite runtime files after parity is verified.
- Deploy the web app against hosted Supabase.

Success criteria:

- `npm run build` succeeds.
- The deployed web app supports signup, login, learning flows, and persistent
  progress.
- No production user flow depends on local SQLite or Express.

### Phase 7: Mobile App Start

- Create Expo app.
- Reuse Supabase auth and repository contracts.
- Implement login, Today dashboard, flashcards, and settings first.
- Add exercises/readings after the core daily loop works.

Success criteria:

- A user can sign in on mobile and see the same deck/progress as web.

## Testing

Database:

- RLS tests for user-owned tables.
- Migration smoke test on a fresh Supabase local database.
- Seed import test for vocabulary and grammar counts.
- RPC tests for `review_flashcard`, starter deck, stats increments, and answer
  normalization.

Web:

- Auth route tests for signed-out and signed-in states.
- Repository tests with mocked Supabase client responses.
- Regression tests for Words, Grammar, Flashcards, Settings, Exercises,
  Readings, and Dashboard pages after each migration phase.

End-to-end:

- Signup to starter deck flow.
- Review one flashcard and verify dashboard stats.
- Generate/check one exercise with fallback mode.
- Open and submit one reading attempt.

Mobile later:

- Auth session persistence.
- Shared repository compatibility.
- Web/mobile same-user data visibility.

## Rollback and Risk

Primary risks:

- RLS policy mistakes can either leak data or block legitimate flows.
- Direct client writes can bypass product invariants if too much logic leaves
  the server side.
- Edge Function local development adds a second runtime.
- Migrating all routes at once would make regressions harder to isolate.

Mitigations:

- Build and test RLS before wiring the UI.
- Keep multi-table mutations in RPC/Edge Functions.
- Migrate one feature area at a time.
- Keep Express running locally until each replacement path is verified.
- Use separate Supabase projects for local/staging and production if the app is
  shared beyond personal use.

## Open Decisions Resolved

- Real login is required from the first deployed version.
- Supabase-first is preferred over permanent Express API.
- Web and mobile should share one backend contract.
- AI calls must run server-side through Edge Functions.
- Offline-first mobile sync is deferred.

## References

- Supabase Data APIs: https://supabase.com/docs/guides/api
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
