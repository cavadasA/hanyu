# Hanyu Offline Flashcard Review (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cards sessions durable offline and synchronize every local review exactly once through a conflict-aware `review_flashcard` RPC.

**Architecture:** A new dependency-free `@hanyu/domain` package owns deterministic SM-2. Mobile stores acknowledged card snapshots, projected card state, and review events in a user-scoped Expo SQLite database. A single sync engine sends stable event IDs to a backward-compatible six-argument RPC, acknowledges duplicates, and rebases pending events on authoritative remote state after conflicts.

**Tech Stack:** TypeScript, Vitest, PostgreSQL/PLpgSQL, Supabase JS, Expo SQLite, Expo Network, Expo Crypto, Jest, React Native Testing Library.

## Global Constraints

- Begin only after P2 and all P2/P1 tests pass.
- Preserve the existing three-argument `review_flashcard(card_id, quality, time_ms)` for web.
- The mobile overload always receives all six arguments; do not use SQL defaults that make overload resolution ambiguous.
- Keep SM-2 behavior identical to migration `202607280002_learning_rpc.sql`: quality `< 3` resets to one day; first success is one day; second is six; later intervals multiply by ease; ease floors at `1.3`; mastered means interval `>= 21` and repetitions `>= 5`.
- A local review is committed to SQLite before Cards advances.
- Never silently discard a pending review.
- One `review_id` can affect card state, `review_log`, and `user_stats` at most once.
- Practice and Library remain online-only.
- Do not promise terminated-app background sync.

---

### Task 1: Create `@hanyu/domain` and lock SM-2 fixtures

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/sm2.ts`
- Create: `packages/domain/src/sm2.test.ts`
- Create: `packages/domain/src/fixtures.ts`
- Create: `packages/domain/src/index.ts`
- Modify: `package.json`
- Modify: `vitest.config.js`

**Interfaces:**
- Consumes: no runtime package.
- Produces: `ReviewState`, `ReviewInput`, `ReviewOutcome`, `applySm2`, and `SM2_FIXTURES`.

- [ ] **Step 1: Add failing fixture tests**

```ts
import { applySm2, SM2_FIXTURES } from './index';

for (const fixture of SM2_FIXTURES) {
  it(fixture.name, () => {
    expect(applySm2(fixture.input)).toEqual(fixture.expected);
  });
}

it.each([-1, 6, Number.NaN])('rejects quality %s', quality => {
  expect(() => applySm2({ ...SM2_FIXTURES[0].input, quality })).toThrow(
    'quality must be an integer between 0 and 5',
  );
});
```

Fixtures must include failure, first/second/later success, ease floor, mastered,
and a UTC month/year boundary.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- packages/domain/src/sm2.test.ts
```

Expected: FAIL because `@hanyu/domain` does not exist.

- [ ] **Step 3: Implement the exact types and formula**

```ts
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';
export interface ReviewState {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  status: CardStatus;
  next_review_at: string;
}
export interface ReviewInput {
  state: ReviewState;
  quality: number;
  reviewed_at: string;
}
export interface ReviewOutcome extends ReviewState {
  last_reviewed_at: string;
}
export function applySm2(input: ReviewInput): ReviewOutcome;
```

Use UTC calendar arithmetic:

```ts
const next = new Date(`${reviewedAt.slice(0, 10)}T00:00:00.000Z`);
next.setUTCDate(next.getUTCDate() + intervalDays);
```

Round the ease value to two decimals with `Math.round(value * 100) / 100`.

- [ ] **Step 4: Export the workspace package**

Set `"name": "@hanyu/domain"`, `"type": "module"`, and an exports map to
`src/index.ts`. Add root `typecheck:domain` if the root scripts have per-package
typechecks.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test -- packages/domain/src/sm2.test.ts
npx tsc -p packages/domain/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain package.json package-lock.json vitest.config.js
git commit -m "feat(domain): add deterministic SM-2 engine"
```

---

### Task 2: Add an idempotent, versioned review RPC

**Files:**
- Create: `supabase/migrations/202607300001_offline_review_sync.sql`
- Create: `supabase/tests/offline_review_sync.sql`
- Modify: `packages/data/src/database.types.ts` by regeneration

**Interfaces:**
- Consumes: existing `srs_cards`, `review_log`, `user_stats`, and three-argument RPC.
- Produces: six-argument `review_flashcard` returning sync outcome and authoritative card state.

- [ ] **Step 1: Write SQL verification cases first**

In a transaction with a test authenticated user/card, assert:

1. matching version returns `applied` and version `1`;
2. the same UUID returns `duplicate` and leaves one log/stat increment;
3. stale `expected_version` returns `conflict` and changes nothing;
4. invalid quality and another user's card are rejected;
5. the old three-argument RPC still succeeds.

Use fixed UUIDs and finish with `rollback`.

- [ ] **Step 2: Run against local Supabase and confirm failure**

```bash
npx supabase start
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/offline_review_sync.sql
```

Expected: FAIL because `version` and the six-argument function do not exist.

- [ ] **Step 3: Add version and idempotency columns**

```sql
alter table public.srs_cards
  add column if not exists version bigint not null default 0;

alter table public.review_log
  add column if not exists client_review_id uuid,
  add column if not exists client_reviewed_at timestamptz,
  add column if not exists result_snapshot jsonb;

create unique index if not exists review_log_user_client_review_unique
  on public.review_log(user_id, client_review_id)
  where client_review_id is not null;
```

- [ ] **Step 4: Implement the six-argument overload**

Exact input names:

```sql
public.review_flashcard(
  card_id uuid,
  quality integer,
  time_ms integer,
  review_id uuid,
  reviewed_at timestamptz,
  expected_version bigint
)
```

Return:

```sql
returns table(
  outcome text,
  card_id uuid,
  interval integer,
  next_review timestamptz,
  ease_factor numeric,
  repetitions integer,
  status text,
  version bigint,
  last_reviewed_at timestamptz
)
```

Algorithm order is mandatory:

```sql
-- 1. auth/input validation
-- 2. lookup client_review_id; if found, select and return the current card as duplicate
-- 3. select the owned card for update
-- 4. compare version; return conflict without mutation
-- 5. calculate the existing SM-2 formula using reviewed_at::date
-- 6. update card and version = version + 1
-- 7. insert review_log with result_snapshot
-- 8. increment stats for timezone('utc', reviewed_at)::date
-- 9. return applied
```

Keep the original three-argument function unchanged and grant both signatures
to `authenticated`. `result_snapshot` is retained for audit, but a duplicate
response returns the current authoritative card/version so a retry cannot
regress the cache after a later review from another device.

- [ ] **Step 5: Run SQL tests and regenerate types**

```bash
npx supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/offline_review_sync.sql
npm run gen:types
```

Expected: SQL test exits `0`; generated `Database` includes `version` and both
RPC signatures.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607300001_offline_review_sync.sql supabase/tests/offline_review_sync.sql packages/data/src/database.types.ts
git commit -m "feat(db): make flashcard review idempotent"
```

---

### Task 3: Expose online sync operations through `@hanyu/data`

**Files:**
- Create: `packages/data/src/repositories/offline-reviews.test.ts`
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/repositories/flashcards.ts`
- Modify: `packages/data/src/factory.ts`
- Modify: `packages/data/src/index.ts`

**Interfaces:**
- Consumes: Task 2 RPC.
- Produces: `ReviewEvent`, `ReviewSyncResult`, `reviewCardEvent`, and `getCard`.

- [ ] **Step 1: Write failing repository tests**

```ts
await data.flashcards.reviewCardEvent({
  card_id: 'card-1',
  quality: 4,
  time_ms: 1200,
  review_id: '00000000-0000-4000-8000-000000000001',
  reviewed_at: '2026-07-30T08:00:00.000Z',
  expected_version: 3,
});

expect(client.rpc).toHaveBeenCalledWith('review_flashcard', {
  card_id: 'card-1', quality: 4, time_ms: 1200,
  review_id: expect.any(String),
  reviewed_at: '2026-07-30T08:00:00.000Z',
  expected_version: 3,
});
```

Cover `applied`, `duplicate`, `conflict`, and malformed/empty responses.

- [ ] **Step 2: Verify failure**

```bash
npm test -- packages/data/src/repositories/offline-reviews.test.ts
```

Expected: FAIL because `reviewCardEvent` is absent.

- [ ] **Step 3: Add exact contracts**

```ts
export interface ReviewEvent {
  card_id: string;
  quality: number;
  time_ms: number | null;
  review_id: string;
  reviewed_at: string;
  expected_version: number;
}
export interface VersionedCard extends DueCard {
  version: number;
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_review_at: string;
  last_reviewed_at: string | null;
}
export interface ReviewSyncResult {
  outcome: 'applied' | 'duplicate' | 'conflict';
  card: VersionedCard;
}
```

- [ ] **Step 4: Implement and export**

`reviewCardEvent(event)` passes all six named args and normalizes one RPC row.
`getCard(id)` selects one owned card joined with its word and returns
`VersionedCard`. Leave P1 `reviewCard(id, quality, timeMs)` unchanged for web
and online compatibility.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- packages/data/src/repositories/offline-reviews.test.ts packages/data/src/factory.test.ts
git add packages/data/src
git commit -m "feat(data): expose offline review sync contract"
```

Expected: tests PASS, then commit succeeds.

---

### Task 4: Build the user-scoped SQLite review store

**Files:**
- Create: `apps/mobile/src/offline/schema.ts`
- Create: `apps/mobile/src/offline/ReviewStore.ts`
- Create: `apps/mobile/src/offline/ReviewStore.test.ts`
- Create: `apps/mobile/src/offline/openReviewStore.ts`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Consumes: `VersionedCard`, `ReviewEvent`, and `@hanyu/domain`.
- Produces: transactional `ReviewStore`.

- [ ] **Step 1: Install Expo dependencies**

```bash
cd apps/mobile
npx expo install expo-sqlite expo-network expo-crypto
cd ../..
```

Expected: SDK-compatible versions appear in mobile `package.json`.

- [ ] **Step 2: Write failing store tests**

Use an in-memory SQLite adapter and test schema migration, card upsert,
transactional event enqueue, pending order, acknowledgement, error marking,
projection replacement, and database deletion for one user.

- [ ] **Step 3: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/ReviewStore.test.ts
```

Expected: FAIL because the store is missing.

- [ ] **Step 4: Create schema version 1**

```sql
create table cached_cards (
  card_id text primary key,
  server_version integer not null,
  server_json text not null,
  projected_json text not null,
  updated_at text not null
);
create table pending_reviews (
  review_id text primary key,
  card_id text not null,
  quality integer not null check (quality between 0 and 5),
  time_ms integer,
  reviewed_at text not null,
  expected_version integer not null,
  queue_sequence integer not null unique,
  state text not null check (state in ('pending','syncing','permanent_error')),
  attempt_count integer not null default 0,
  last_error text
);
create table sync_meta (key text primary key, value text not null);
create index pending_reviews_card_sequence
  on pending_reviews(card_id, queue_sequence);
```

Store the schema version in `PRAGMA user_version`.

- [ ] **Step 5: Implement the store contract**

```ts
export interface ReviewStore {
  cacheCards(cards: VersionedCard[]): Promise<void>;
  getDueProjectedCards(now: string, limit: number): Promise<VersionedCard[]>;
  enqueueAndProject(event: ReviewEvent, projected: VersionedCard): Promise<void>;
  listPending(): Promise<QueuedReviewEvent[]>;
  acknowledge(reviewId: string, serverCard: VersionedCard): Promise<void>;
  rebase(card: VersionedCard, events: QueuedReviewEvent[]): Promise<void>;
  markPermanentError(reviewId: string, message: string): Promise<void>;
  pendingCount(): Promise<number>;
  close(): Promise<void>;
  destroy(): Promise<void>;
}
```

Define `QueuedReviewEvent` as `ReviewEvent & { queue_sequence: number;
state: 'pending' | 'syncing' | 'permanent_error'; attempt_count: number;
last_error: string | null }`.

`acknowledge` runs one transaction: remove the acknowledged event, store the
returned server card as the new snapshot, replay any remaining events for that
card with `applySm2`, and save the final projection. It must not replace the
projection with server state while later local events remain.

Open `hanyu-review-${userId}.db`; validate `userId` before deriving the file
name. Every multi-write method uses `withTransactionAsync`.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/ReviewStore.test.ts
git add apps/mobile/src/offline apps/mobile/package.json package-lock.json
git commit -m "feat(mobile): persist offline review state"
```

Expected: PASS, then commit succeeds.

---

### Task 5: Add the local-first review service

**Files:**
- Create: `apps/mobile/src/offline/OfflineReviewService.ts`
- Create: `apps/mobile/src/offline/OfflineReviewService.test.ts`
- Create: `apps/mobile/src/offline/OfflineReviewProvider.tsx`
- Create: `apps/mobile/src/offline/OfflineReviewProvider.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/package.json` to depend on `@hanyu/domain`

**Interfaces:**
- Consumes: Tasks 1, 3, 4 and active session user ID.
- Produces: `loadDueCards`, `rateCard`, pending count, and lifecycle cleanup.

- [ ] **Step 1: Write failing service tests**

Test cache-first load, online refresh merge, rating while offline, store failure
before advance, synchronous double-tap guard, and UUID/time injection.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/OfflineReviewService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement local rating**

```ts
async rateCard(card: VersionedCard, quality: number, timeMs: number | null) {
  const reviewedAt = clock.now().toISOString();
  const outcome = applySm2({ state: card, quality, reviewed_at: reviewedAt });
  const event: ReviewEvent = {
    card_id: card.id,
    quality,
    time_ms: timeMs,
    review_id: randomUUID(),
    reviewed_at: reviewedAt,
    expected_version: card.version,
  };
  await store.enqueueAndProject(event, { ...card, ...outcome });
  return { ...card, ...outcome };
}
```

Do not mutate screen state until `enqueueAndProject` resolves.

- [ ] **Step 4: Implement provider lifecycle**

Open the user database after session resolution, expose `service`, `ready`,
`pendingCount`, and `refreshPendingCount`, and destroy the user DB after
successful logout/account deletion. Close it on provider unmount.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/OfflineReviewService.test.ts src/offline/OfflineReviewProvider.test.tsx
git add apps/mobile/src/offline apps/mobile/app/_layout.tsx apps/mobile/package.json package-lock.json
git commit -m "feat(mobile): add local-first review service"
```

Expected: PASS, then commit succeeds.

---

### Task 6: Implement idempotent synchronization

**Files:**
- Create: `apps/mobile/src/offline/ReviewSyncEngine.ts`
- Create: `apps/mobile/src/offline/ReviewSyncEngine.test.ts`
- Create: `apps/mobile/src/offline/backoff.ts`
- Modify: `apps/mobile/src/offline/OfflineReviewProvider.tsx`

**Interfaces:**
- Consumes: `ReviewStore`, `reviewCardEvent`, `getCard`, network/app lifecycle.
- Produces: serialized `sync(): Promise<SyncSummary>`.

- [ ] **Step 1: Write failing success/idempotency tests**

Cover: applied, duplicate, timeout after server commit followed by duplicate,
two cards, two reviews on one card, concurrent `sync()` calls sharing one
promise, and pending count updates.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/ReviewSyncEngine.test.ts
```

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement a single-flight FIFO worker**

```ts
export interface SyncSummary { applied: number; duplicates: number; conflicts: number; remaining: number }

sync(): Promise<SyncSummary> {
  if (this.inFlight) return this.inFlight;
  this.inFlight = this.run().finally(() => { this.inFlight = null; });
  return this.inFlight;
}
```

Submit the queue in order. On `applied` or `duplicate`, call
`store.acknowledge(review_id, result.card)`.

- [ ] **Step 4: Add bounded transient retry**

Use delays `[1000, 2000, 5000, 10000, 30000]` ms with injected timers in tests.
Network/5xx errors remain pending. Authentication errors stop the run. Card
not-found/validation errors become `permanent_error` and are never auto-deleted.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/ReviewSyncEngine.test.ts
git add apps/mobile/src/offline
git commit -m "feat(mobile): synchronize review queue idempotently"
```

Expected: PASS, then commit succeeds.

---

### Task 7: Implement deterministic conflict rebase

**Files:**
- Create: `apps/mobile/src/offline/rebase.ts`
- Create: `apps/mobile/src/offline/rebase.test.ts`
- Modify: `apps/mobile/src/offline/ReviewSyncEngine.ts`
- Modify: `apps/mobile/src/offline/ReviewSyncEngine.test.ts`

**Interfaces:**
- Consumes: remote `VersionedCard`, pending events for that card, and `applySm2`.
- Produces: reprojected events/cards with sequential expected versions.

- [ ] **Step 1: Write failing rebase tests**

Use a remote card at version `7` and two local events in reverse insertion/time
examples. Assert sorting by `reviewed_at`, then `queue_sequence`; expected
versions `7` and `8`; both local outcomes preserved; no other card changes.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/rebase.test.ts
```

Expected: FAIL because rebase logic is absent.

- [ ] **Step 3: Implement the pure rebase**

```ts
export function rebasePending(
  remote: VersionedCard,
  events: Array<ReviewEvent & { queue_sequence: number }>,
): { projected: VersionedCard; events: ReviewEvent[] };
```

Start from remote, apply each event with its original `reviewed_at`, set each
event's `expected_version` to `remote.version + index`, and return the final
projection.

- [ ] **Step 4: Wire conflict handling**

On RPC `conflict`, call `getCard(card_id)`, load all unacknowledged events for
that card, compute rebase, persist it transactionally, and retry the head once
in the current sync run. A second immediate conflict ends the run and retries
on the next trigger to avoid a live-lock with another device.

- [ ] **Step 5: Run conflict suite and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/offline/rebase.test.ts src/offline/ReviewSyncEngine.test.ts
git add apps/mobile/src/offline
git commit -m "feat(mobile): rebase conflicting offline reviews"
```

Expected: PASS, then commit succeeds.

---

### Task 8: Integrate offline review into Cards and app lifecycle

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`
- Modify: `apps/mobile/src/screens/CardsScreen.test.tsx`
- Create: `apps/mobile/src/ui/SyncStatus.tsx`
- Create: `apps/mobile/src/ui/SyncStatus.test.tsx`
- Modify: `apps/mobile/src/offline/OfflineReviewProvider.tsx`
- Modify: `apps/mobile/src/session/SessionProvider.tsx`

**Interfaces:**
- Consumes: offline provider/service/sync engine.
- Produces: cache-first Cards, durable ratings, pending/error UI, and sync triggers.

- [ ] **Step 1: Replace online-only screen tests with local-first cases**

Test cached launch without network, rating advances only after durable commit,
pending count, manual retry, online refresh, empty uncached offline state, and
permanent-error details.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/CardsScreen.test.tsx src/ui/SyncStatus.test.tsx
```

Expected: FAIL against the online-only P1 screen.

- [ ] **Step 3: Integrate Cards**

Replace direct `getDueCards/reviewCard` calls with `service.loadDueCards()` and
`service.rateCard()`. Render:

```tsx
<SyncStatus
  pending={pendingCount}
  syncing={syncing}
  permanentErrors={permanentErrors}
  onRetry={() => void sync()}
/>
```

Keep P1 review modes/audio unchanged.

- [ ] **Step 4: Add sync triggers**

Subscribe to Expo Network connectivity, `AppState` foreground, Cards focus, and
session completion. Each calls the single-flight `sync()`. Do not register a
background task.

- [ ] **Step 5: Add cleanup to sign-out**

The sign-out flow closes and deletes the active user review DB only after the
user confirms logout. A failed remote sign-out still clears the local session
using the existing P1 semantics and must also clear the user cache.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/CardsScreen.test.tsx src/ui/SyncStatus.test.tsx src/offline
git add apps/mobile/src/screens/CardsScreen* apps/mobile/src/ui/SyncStatus* apps/mobile/src/offline apps/mobile/src/session/SessionProvider.tsx
git commit -m "feat(mobile): use offline-first Cards sessions"
```

Expected: PASS, then commit succeeds.

---

### Task 9: Verify cross-device convergence and document operations

**Files:**
- Create: `docs/testing/p3-offline-review-matrix.md`
- Modify: `apps/mobile/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed P3.
- Produces: repeatable local, signed-build, and two-device verification.

- [ ] **Step 1: Run the full automated suite**

```bash
npm test
npm test -w @hanyu/mobile -- --runInBand
npx tsc -p packages/domain/tsconfig.json --noEmit
npx tsc -p packages/data/tsconfig.json --noEmit
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: all commands pass.

- [ ] **Step 2: Verify ambiguous-timeout idempotency**

On local Supabase, submit a fixed six-argument RPC twice and query:

```sql
select count(*) from review_log
where client_review_id = '00000000-0000-4000-8000-000000000042';
```

Expected: `1`; `user_stats.cards_reviewed` increased by one.

- [ ] **Step 3: Execute the signed-build matrix**

Document and perform: load deck online; enable airplane mode; complete ten
ratings; force-close; reopen offline; verify state; reconnect; verify pending
count reaches zero; compare web totals. Repeat with another device changing the
same card before reconnecting the first.

- [ ] **Step 4: Verify per-user isolation**

Sign out, sign in as another account, and confirm no cached cards/pending count
from the first account. Sign back in to the first account; because logout
deletes its DB, expect an online refresh rather than stale local data.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/testing/p3-offline-review-matrix.md apps/mobile/README.md README.md
git commit -m "docs: add offline review verification runbook"
```

## Definition of Done for P3

- [ ] Domain and SQL SM-2 fixtures agree.
- [ ] The old web RPC and new mobile overload both pass.
- [ ] An offline rating is atomic and survives force-close.
- [ ] A duplicate `review_id` produces one log and one stats increment.
- [ ] Conflicts rebase without losing pending local reviews.
- [ ] Auth failures pause sync; permanent errors remain visible.
- [ ] Two physical devices converge to the same server deck.
- [ ] P1 and P2 regression suites remain green.
