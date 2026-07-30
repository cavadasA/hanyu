# Hanyu Mobile P2-P4 Design

**Date:** 2026-07-30

## Context

P1 establishes the npm-workspaces monorepo, `packages/data`, the Expo Router
application, authentication, the Today/Cards/You tabs, shared mobile UI
primitives, and online flashcard review. This design defines the remaining
mobile phases:

| Phase | Outcome |
| --- | --- |
| P2 | Mobile content parity through Practice and Library |
| P3 | Durable offline flashcard review with deterministic synchronization |
| P4 | Store-ready builds, account lifecycle compliance, metadata, and test distribution |

The phases are implemented in order: P1 → P2 → P3 → P4. Each phase receives
its own implementation plan and must leave a working, independently testable
application. Plans target the completed P1 architecture documented in
`2026-07-29-hanyu-mobile-foundation.md`, even if P1 is still being constructed
when the plans are written.

## Shared Decisions

| Area | Decision |
| --- | --- |
| Product language | Keep the current English in-app copy; prepare English and Spanish store metadata in P4 |
| Navigation | Preserve the five-tab model: Today, Cards, Practice, Library, You |
| Data access | Screens consume typed operations from `@hanyu/data`; they do not call Supabase directly |
| Audio | Reuse the P1 `expo-speech` abstraction for cards, dictation, and readings |
| Error copy | Convert repository and synchronization errors through the shared user-facing error mapper |
| Testing | Pure logic first, repository contract tests second, React Native interaction tests third, signed-build smoke tests last |
| Offline scope | P3 makes Cards offline; Practice and Library remain online |
| Release scope | P4 prepares and uploads signed binaries; final production review remains an explicit store-console gate |

No phase may move Supabase service-role credentials into a client application.
All privileged account operations execute in authenticated Edge Functions.

---

## P2: Mobile Content Parity

### Goal

Add Practice and Library so the mobile application exposes the existing
exercise, reading, word, and grammar capabilities in a native interface.

### Navigation

The `(app)` tab layout mounts two new nested routes:

- Practice landing screen
  - Exercises screen
  - Readings list/generation screen
  - Reading detail screen
- Library landing screen
  - Words screen
  - Grammar list screen
  - Grammar detail screen

Each feature remains reachable within two taps of its tab. Nested stacks own
their back buttons and titles; the tab bar remains visible on landing screens.

### Data Boundary

P2 completes the public types in `packages/data/src/types.ts` and the factory
surface for the repositories already moved during P1:

- exercise generation, cached retrieval, answer submission, and attempt result;
- reading generation/listing/detail, token metadata, and comprehension
  submission;
- word search with query, HSK level, page, and page size;
- grammar list by HSK level and grammar detail;
- adding a selected word to the user's SRS deck.

Repository payloads are normalized before reaching React Native. Components do
not depend on raw Supabase row names or Edge Function response quirks.

### Practice: Exercises

The exercise flow selects an HSK level and one of five supported types:

1. fill in the blank;
2. multiple-choice translation;
3. sentence reorder;
4. dictation;
5. matching.

Each type has a focused native renderer with a common controller contract:
exercise payload in, draft answer out, and disabled/checked state in. The
controller owns generation, answer normalization, submission, explanation,
retry, and moving to the next item.

An exercise attempt is recorded exactly once when the learner checks an answer.
Repeated taps, rerenders, and navigation back to a checked item cannot duplicate
statistics. Dictation uses the shared speech hook and retains a visible replay
control. Matching and reorder interactions must remain usable with screen
readers and must not rely exclusively on drag-and-drop.

### Practice: Readings

The reading flow supports the formats already exposed by the backend, generates
or selects a reading, and opens a detail screen containing:

- title and HSK metadata;
- pinyin visibility control;
- full-text speech playback;
- display-ready word tokens;
- comprehension questions and one-time submission;
- score, correct answers, and explanations after submission.

Tokenization follows the existing longest-match backend behavior. Every known
token opens a native popup or bottom sheet containing the full token, pinyin,
meaning, HSK level, and current SRS status. An unknown Chinese character remains
selectable and is labelled as absent from the dictionary. A known word can be
added to the deck once; duplicate-card responses become an informative state,
not an error.

A reading increments progress when comprehension is submitted, never when it is
opened or generated.

### Library: Words

Words provides:

- text search across hanzi, pinyin, and meaning;
- an HSK-level filter;
- a short debounce before remote search;
- explicit page controls and page-size-stable results;
- loading, initial-empty, no-results, recoverable-error, and end-of-results
  states;
- add-to-deck status per word.

Changing the query or level returns to page one. A stale response from an older
query cannot replace a newer result.

### Library: Grammar

Grammar provides HSK-level filtering, a compact list, and a detail screen. The
detail shows title, pattern, explanation, and examples without rendering
backend-provided HTML. Missing optional fields are omitted cleanly.

### P2 Error Handling

- Generation failures preserve the selected type/level and expose retry.
- Submission failures keep the learner's draft answer.
- Speech unavailability disables only audio, not the exercise or reading.
- Search failures preserve query and filters.
- Authentication expiry follows the P1 session boundary.

### P2 Testing

- Repository tests cover payload normalization and pagination.
- Unit tests cover exercise answer normalization and the contracts for all five
  renderers.
- Component tests cover selection, disabled checked states, reorder/matching
  accessibility, dictation replay, and duplicate-submit prevention.
- Reading tests cover tokenizer metadata, unknown fallback tokens, popup
  content, add-to-deck behavior, and one-time progress recording.
- Words tests cover debounce, stale-response rejection, filter reset, and
  pagination boundaries.
- Navigation tests cover every new tab and nested route.

### P2 Success Criteria

- All five exercise types can be completed on iOS and Android.
- A reading can be generated, heard, token-inspected, answered, and counted.
- Words can be searched, filtered, paged, and added to Cards.
- Grammar can be filtered and read.
- Existing Today, Cards, and You behavior remains green.

### P2 Out of Scope

Offline Practice/Library data, speech recognition, content downloads, and new
exercise types are not included.

---

## P3: Offline Flashcard Review

### Goal

Allow a learner to finish Cards sessions without a network connection, reflect
SM-2 results immediately, and synchronize every review exactly once when a
connection returns.

### Domain Package

P3 creates platform-agnostic `packages/domain` with:

- `ReviewState`: ease factor, interval days, repetitions, status, and next
  review timestamp;
- `ReviewInput`: current state, quality `0..5`, and reviewed-at timestamp;
- `ReviewOutcome`: the complete next state;
- `applySm2(input): ReviewOutcome`.

The function is pure, rejects invalid quality values, uses an injected
timestamp, and contains no Supabase, React Native, storage, or locale
dependencies. Shared fixtures cover first review, second review, later review,
failed recall, ease-factor floor, mastered threshold, and date rollover. The
same fixtures validate the SQL calculation used by `review_flashcard`.

### Local Persistence

Mobile uses Expo SQLite for learning data. AsyncStorage remains the Supabase
session store and is not used as the review database.

The user-scoped database stores:

- the latest acknowledged server snapshot for each cached card;
- the locally projected card state shown in the UI;
- pending review events with stable UUID, card ID, quality, duration,
  reviewed-at timestamp, expected server version, queue sequence, attempt
  count, status, and last error;
- synchronization metadata including the last successful deck refresh.

Rating a card runs one SQLite transaction that inserts the pending event and
updates the projected state before the next card appears. A process-level write
mutex prevents overlapping transactions from double-enqueuing a tap.

Cards loads cached due cards immediately. When online, it refreshes the server
snapshot and merges it with pending events instead of overwriting optimistic
state. Logging out closes and removes only the active user's learning database.

### Server Contract

The migration:

- adds a monotonically increasing `version` to `srs_cards`;
- gives each mobile review a user-scoped unique `review_id`;
- stores the client `reviewed_at` value separately from server receipt time;
- preserves the existing three-argument `review_flashcard` function for web;
- adds a six-argument overload:
  `review_flashcard(card_id, quality, time_ms, review_id, reviewed_at, expected_version)`.

The six-argument overload locks the card, validates ownership and input, checks
idempotency before mutation, and returns one of `applied`, `duplicate`, or
`conflict` with authoritative card state and version. A duplicate never adds a
second review log or increments daily statistics. A conflict never mutates the
card.

### Synchronization

Only one sync worker runs per signed-in user. It starts after sign-in, on Cards
entry, when the app returns to foreground, after a session, and when network
connectivity returns.

The worker:

1. selects pending reviews in queue order while preserving order per card;
2. submits every event with all six RPC arguments;
3. acknowledges `applied` or `duplicate` and stores the authoritative result;
4. on `conflict`, downloads the remote card, treats it as the new base, and
   recomputes that card's unacknowledged local reviews in original order;
5. retries the rebased head event with the returned server version;
6. applies bounded exponential backoff to transient failures;
7. pauses on authentication failure and exposes permanent data errors for a
   manual retry.

The server is authoritative, but an offline review is never silently discarded.
The UI shows a compact pending-review count and a retry action without blocking
continued offline study.

### P3 Conflict Rule

When another device changed a card first, the remote state wins as the base.
All still-pending local events are then replayed in their original
`reviewed_at`, queue-sequence order. This deterministic rebase preserves local
learning work while preventing a stale device from overwriting server history.

### P3 Error Handling

- Storage migration failure blocks offline review and offers a safe retry; it
  does not fall back to non-durable memory.
- A deleted remote card moves its pending events to a visible permanent-error
  state.
- Corrupt cached rows are quarantined and refreshed without deleting unrelated
  pending events.
- Auth expiry pauses synchronization and routes through P1 session handling.
- Network failures do not appear as review failures after the local transaction
  has committed.

### P3 Testing

- Domain fixture tests run independently of Expo.
- Database tests cover schema migration, transactional enqueue, recovery after
  restart, and per-user deletion.
- Sync tests cover success, duplicate acknowledgement, timeout after server
  commit, conflict/rebase, several pending reviews for one card, concurrent
  cards, auth expiry, and permanent errors.
- Repository/SQL verification proves TypeScript and RPC SM-2 parity.
- Signed-build checks cover airplane-mode launch, a complete offline session,
  force-close/reopen, reconnection, and one-time statistics.

### P3 Success Criteria

- A cached Cards session is usable after force-closing and reopening offline.
- Every rating is durable before the next card is shown.
- Retrying after an ambiguous network timeout does not duplicate a review.
- Two-device conflicts converge without losing local reviews.
- Web and mobile observe the same final deck and review counts after sync.

### P3 Out of Scope

Practice/Library offline content, background sync while the app is terminated,
push notifications, and a general-purpose client database abstraction are not
included.

---

## P4: Store Release

### Goal

Produce compliant, signed iOS and Android builds, validate them through
TestFlight and Google Play Internal Testing, and prepare both store listings for
production review.

### Release Configuration

P4 finalizes:

- display name `Hanyu`;
- scheme `hanyu`;
- iOS bundle identifier and Android application ID `com.hanyu.app`;
- semantic app version beginning at `1.0.0`;
- store build-number/version-code auto-increment;
- EAS project linkage;
- `development`, `preview`, and `production` build profiles;
- iOS and Android submission profiles;
- environment-variable validation for Supabase, public web URL, support email,
  and release identifiers.

No production secret is committed. Store credentials, signing keys, service
account data, and Expo tokens stay in EAS or their respective consoles.

### Visual Assets

The release asset set contains a production icon, Android foreground/background
adaptive layers, Android monochrome icon, splash image, and web favicon. Assets
are checked for transparent padding, safe zones, light/dark backgrounds, device
density, and absence of default Expo branding. The splash screen must not hide
session restoration errors or remain visible indefinitely.

### Password Reset Deep Link

The password-reset email redirects to `hanyu://auth/reset-password`. Supabase's
redirect allow-list and the Expo scheme use the same value.

The reset route:

- handles both cold-start and already-running app entry;
- validates/exchanges the recovery parameters with Supabase;
- displays new-password and confirmation fields;
- updates the authenticated user's password;
- rejects mismatches and weak input locally;
- presents explicit expired/invalid-link recovery;
- clears recovery state and routes to the signed-in application after success.

No token is logged or persisted outside Supabase session storage.

### Account Deletion

You exposes a discoverable Delete account action. The flow explains that
learning history, settings, cards, and account access are removed, requires a
deliberate typed confirmation, and invokes an authenticated Supabase Edge
Function.

The Edge Function derives the user from the verified JWT, uses a server-only
service role to delete that Auth user, relies on verified database cascades for
owned data, and returns no privileged details. On success, mobile deletes the
local learning database, clears the session, and routes to signed-out state.

The web application also exposes a public account-deletion resource. It
explains the deletion scope and provides an authenticated path to the same
deletion operation so the Google Play listing can link directly to a functional
web request route.

### Privacy Policy and Disclosure Inventory

A public privacy page, linked from You and both store listings, describes:

- account identifiers collected by Supabase;
- learning progress, settings, generated-content inputs, and review history;
- purposes and lawful operational uses;
- processors used by the released build;
- retention and deletion behavior;
- security and international processing at a plain-language level;
- contact and account-deletion routes.

The release inventory must reflect the actual production binary. Analytics,
advertising, tracking, contacts, microphone, location, and other capabilities
must not be declared or requested unless the code actually includes them.
Privacy copy receives owner/legal review before production submission.

### Store Metadata

Version-controlled metadata includes English and Spanish:

- app name, subtitle/short description, and full description;
- keywords where supported;
- category, age-rating answers, and content declarations;
- privacy, deletion, support, and marketing URLs;
- release notes and reviewer notes;
- App Privacy and Google Data Safety answer worksheets;
- phone-size screenshots for the required device classes.

EAS Submit uploads binaries. Metadata completion, tester management, phased
release choices, and final production review remain explicit App Store Connect
and Play Console steps.

### Distribution Sequence

1. Validate configuration and run all automated tests.
2. Produce internal preview builds for physical iOS and Android devices.
3. Execute the P2 online and P3 offline smoke suites on signed builds.
4. Upload an iOS production candidate and distribute it through TestFlight
   internal testing.
5. Upload an Android App Bundle to Google Play Internal Testing.
6. Collect and resolve blocking feedback.
7. Freeze metadata, privacy disclosures, screenshots, and release notes.
8. Produce final production builds from the accepted commit.
9. Upload with EAS Submit.
10. Complete each console's review workflow.

If a Google Play personal developer account is subject to a mandatory closed
testing period, that policy becomes a documented external gate between internal
testing and production access.

### P4 Testing

- Unit/component tests cover deep-link parsing, reset states, delete
  confirmation, and cleanup after deletion.
- Edge Function tests cover unauthenticated access, deletion ownership, cascade
  effects, and repeat requests.
- Physical-device tests cover reset links with the app terminated and active.
- Deletion is verified in Auth, owned database rows, the local SQLite file, and
  the next app launch.
- Signed builds complete sign-up, Today, all P2 feature smoke flows, online
  Cards, offline Cards, sync, password reset, logout, and account deletion.
- Store checklists validate icons, splash, permissions, privacy URLs,
  screenshots, support contact, metadata, and reviewer credentials/instructions.

### P4 Success Criteria

- The same release candidate passes internal iOS and Android testing.
- Password reset works from a real email on physical devices.
- Account deletion removes server and local user data and is reachable in-app
  and on the web.
- Public privacy, support, and deletion URLs are live.
- Store metadata and privacy disclosures match the production binary.
- Production binaries are uploaded successfully and ready for manual store
  review.

### P4 Out of Scope

Paid subscriptions, in-app purchases, push notifications, over-the-air update
policy, production marketing campaigns, and guaranteed store approval dates are
not included.

---

## Cross-Phase Risks and Controls

| Risk | Control |
| --- | --- |
| P1 files change while later plans are written | Plans name the target P1 contracts and require a preflight reconciliation before implementation |
| Mobile and SQL SM-2 drift | Shared fixtures and parity verification in P3 |
| Offline retry duplicates statistics | User-scoped unique `review_id` checked before mutation |
| Remote refresh overwrites optimistic cards | Keep server snapshots separate and replay pending projections |
| Release policy changes | Re-check official Expo, Apple, Google, and Supabase documentation at P4 execution time |
| Store submission blocked by external accounts | Treat credentials, agreements, tester access, and policy-specific test periods as explicit external gates |
| Privacy declaration differs from binary | Generate disclosures from a release-time dependency and permission inventory |

## Plan Deliverables

The approved design produces:

1. `docs/superpowers/plans/2026-07-30-hanyu-mobile-content-parity-p2.md`
2. `docs/superpowers/plans/2026-07-30-hanyu-offline-review-p3.md`
3. `docs/superpowers/plans/2026-07-30-hanyu-store-release-p4.md`

Each plan uses checkbox steps, exact file paths and interfaces, test-first
cycles, expected command outcomes, focused commits, a preflight against the
completed preceding phase, and a phase-specific Definition of Done.
