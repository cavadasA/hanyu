# Hanyu Daily Learning Loop Design

**Date:** 2026-07-28
**Status:** Draft for user review
**Audience:** Personal HSK2 learner now, productizable learning tool later

## Context

Hanyu already has the core pieces of a Mandarin learning platform: HSK vocabulary, SRS flashcards, generated exercises, graded readings, grammar reference, and progress tracking. The current product gap is not feature count. The gap is trust and activation.

The app should become useful on the first real session without requiring manual deck setup. It should also stop punishing correct user actions through brittle answer checking, character-only reading lookup, and incomplete progress metrics.

The user has recently completed HSK2. The experience should therefore feel adaptive: HSK1 is review, HSK2 is the main consolidation layer, and HSK3 is a light preview only when useful.

## Goals

- Give the user a clear daily study path without manual planning.
- Seed a useful flashcard deck automatically so SRS has immediate value.
- Make reading interactions trustworthy: correct answers score correctly, and word lookup behaves like word lookup.
- Make progress metrics reflect actual study effort.
- Keep implementation compatible with later productization, without building multi-user or payments yet.

## Non-Goals

- No authentication or paid subscription flow in this pass.
- No full content marketplace, teacher tools, or social features.
- No HSK4-6 content expansion yet.
- No major redesign of the visual system unless needed for the new daily loop.

## Product Direction

The primary product promise becomes:

> Open Hanyu, do today's Chinese session, and trust that it is matched to your level.

The main daily loop is:

1. Review due flashcards.
2. Complete a short mixed exercise set.
3. Read one graded HSK2 passage.
4. See progress credited immediately.

The app should reduce decisions at the start of study. The user can still browse Words, Readings, Grammar, and Settings, but the default path is a guided "Today" session.

## User Model

The initial user profile is:

- Completed HSK2.
- Wants daily review and consolidation.
- Benefits from Spanish/English explanations, but the current vocabulary data is mostly English.
- Wants to grow toward HSK3 without being overwhelmed.

Default adaptive weighting:

- HSK1: review and weak-spot reinforcement.
- HSK2: primary study and retention.
- HSK3: optional preview, low volume, clearly labeled.

## Feature 1: Daily Session

The dashboard should evolve from a passive overview into an active "Today" screen.

Daily session blocks:

- Flashcards: due cards first, then optional new cards if below the daily target.
- Exercises: a mixed set of 5 items, biased toward HSK2 and recent weak vocabulary.
- Reading: one short HSK2 reading by default.
- Completion: a session summary showing cards reviewed, exercise result, reading score, and study time.

The user should be able to start each block independently. If they only have 5 minutes, flashcards alone should count.

Expected empty states:

- No deck yet: offer to create the recommended starter deck.
- No due cards: offer new cards or move to exercises.
- No readings available: generate or use a seeded fallback.
- AI unavailable: use cached or seeded content, with honest copy.

## Feature 2: Starter Deck

The app should provide useful SRS content by default.

Starter deck behavior:

- Add a server endpoint to create a starter deck for user 1.
- Recommended starter for this user: HSK1 review plus HSK2 focus.
- Avoid duplicates if the user already added cards.
- Respect a configurable daily new-card target.
- Show deck setup as an activation step, not as a manual table task.

Initial deck options:

- "HSK2 Consolidation" (recommended): frequent HSK1 + HSK2 words.
- "HSK1 Review": only HSK1.
- "Custom from Words": keep existing manual add flow.

Business rationale:

Manual card creation is acceptable as an advanced behavior, but it cannot be the default path. A learning product must prove value before asking for curation work.

## Feature 3: Reliable Readings

Reading comprehension should score user choices correctly regardless of AI formatting quirks.

Answer model:

- Normalize answer comparisons.
- Support correct answer as exact option text.
- Support correct answer as option letter, for example `A`, `B`, `C`, or `D`.
- Support options prefixed by letters, for example `A. 一只`.
- Prefer storing/generated questions in a canonical shape going forward.

Canonical question shape:

```json
{
  "question": "小明喜欢什么？",
  "options": [
    { "id": "A", "text": "看电视" },
    { "id": "B", "text": "看书" },
    { "id": "C", "text": "吃饭" },
    { "id": "D", "text": "运动" }
  ],
  "correct_option_id": "B"
}
```

Backward compatibility:

- Existing readings may keep the old `{ options: string[], correct: string }` format.
- The UI/API should adapt old questions at read time instead of requiring a destructive migration first.

## Feature 4: Word-Level Reading Lookup

The reading text should be segmented into words, not individual characters.

Minimum viable approach:

- Build a longest-match segmenter from the local `words` table.
- For each position in the reading content, prefer the longest matching dictionary entry.
- Punctuation and whitespace remain plain text.
- Unknown Chinese characters still render as selectable fallback tokens.

Popup behavior:

- Show full selected token, pinyin, meaning, HSK level, and SRS status if known.
- Let the user add the word to SRS from the popup.
- If the token is unknown, say it is not in the local dictionary and avoid pretending.

Future productization path:

- Replace or augment longest-match with a real Chinese segmentation library if quality becomes limiting.
- Add Spanish meanings or user notes later.

## Feature 5: Progress and Trust

The app should credit real study actions.

Stats behavior:

- Reviewing a card increments `cards_reviewed`.
- First review of a new card can increment `cards_new`.
- Exercises increment `exercises_done` when checked.
- Readings increment `readings_done` when the reading comprehension is submitted, not merely when content is generated.
- Streak counts flashcards, exercises, and readings.
- The dashboard should explain today's remaining work in the context of the daily session.

Business rationale:

Progress systems are trust systems. If the user studies and the app does not reflect it, streaks and dashboards become decorative rather than motivating.

## Feature 6: Productization Foundations

Keep these as lightweight foundations, not full commercial features:

- Add `PRODUCT.md` with audience, promise, tone, and current product principles.
- Avoid returning stored API keys from settings responses.
- Keep user id hardcoded for now, but isolate user-specific operations behind helper functions where touched.
- Use clear empty states and error recovery in the main learning surfaces.
- Add tests around real observed failure modes, especially generated reading formats.

## Data Flow

Daily session:

1. Client requests session summary.
2. Server reads settings, deck status, due cards, cached/generated exercises, and reading availability.
3. Client renders actionable blocks with completion state.
4. Each completed action writes stats immediately.
5. Dashboard refreshes or updates local state after completion.

Reading lookup:

1. Reading detail endpoint returns reading content and questions.
2. Client or server obtains dictionary entries relevant to the reading.
3. Text is tokenized with longest-match.
4. User selects a token.
5. Popup resolves dictionary detail and SRS status.

Preferred implementation split:

- Server owns canonical answer normalization helpers and starter deck creation.
- Client owns interaction state and display.
- Tokenization may start client-side using a dictionary payload, but server-side tokenization is acceptable if simpler.

## Error Handling

- If starter deck creation partially overlaps an existing deck, insert missing cards and report how many were added.
- If AI generation fails, fallback to seeded/cached content before showing an error.
- If a reading question has invalid data, show the question but disable submission for that item and log a clear server/client warning.
- If dictionary lookup finds multiple candidates, choose the longest exact match and expose enough metadata to debug later.
- If adding to SRS fails because the word already exists, show "Already in SRS" instead of treating it as success or failure ambiguously.

## Testing

Add focused tests for:

- Reading answer normalization: exact text, letter-only correct answer, letter-prefixed options, whitespace differences.
- Existing DB reading examples that currently score incorrectly.
- Reading tokenization with `你好`, `朋友`, and unknown fallback characters.
- Starter deck creation: inserts expected cards, avoids duplicates, respects HSK level strategy.
- Flashcard review stats: cards reviewed, new cards, streak behavior.
- Flashcards "Review again" reloads the session without scope errors.
- Settings API does not return the stored API key value.

## Rollout Order

1. Fix reading answer normalization and tests.
2. Fix flashcard session reload and stats credit.
3. Add starter deck endpoint and empty-state CTA.
4. Add word-level reading lookup.
5. Convert dashboard into the first version of Today.
6. Add `PRODUCT.md` and tighten settings API behavior.

This order restores trust first, then improves activation, then shapes the broader daily product.

## Implementation Defaults

- Starter deck size: 150 cards, biased toward frequent HSK1 and HSK2.
- Reading tokenization: server-side in the first implementation, so the client receives display-ready tokens and dictionary metadata.
- Daily session route: replace the dashboard at `/` with the Today experience, while preserving dashboard-style progress sections below the daily actions.

Deferred decisions:

- Whether to introduce a dedicated `/today` route later if the product needs a separate analytics dashboard.
- Whether to replace longest-match tokenization with a dedicated Chinese segmentation library after testing real reading quality.
