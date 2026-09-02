# Hanyu Product Context

## Register

product

## Audience

Hanyu is for a single self-directed Mandarin learner **preparing for the HSK 2
exam under the HSK 3.0 standard, 2025-11 revision**. It should be built so it
can later become a paid learning product for similar independent learners.

Consolidation is a state the learner reaches for a given item, established by
evidence, not an assumption the product makes about the whole level.

## Product Promise

Open Hanyu, do today's Chinese session, and trust that it is matched to your level.

## Current Learning Model

- HSK 1 is prerequisite material. What the learner already demonstrates is
  suspended rather than drilled.
- HSK 2 is the target: 204 words, 125 characters and the full official grammar
  outline for the level.
- HSK 3 is preview material, shown lightly and clearly.

The syllabus of record is the HSK 3.0 revision of November 2025. Its exact
sources and checksums live in `data/sources.json`; `npm run coverage` reports
how much of it the app currently carries.

## Tone

Calm, direct, and motivating. The app should feel like a serious study companion, not a gamified toy or generic AI dashboard.

## Product Principles

- Trust beats novelty.
- First value must not require manual content setup.
- Progress shown in the UI must match real study actions.
- Reading tools should behave in terms of Chinese words, not isolated characters.
- AI can generate content, but the product must validate and normalize its output before showing scores.

## Anti-References

- Empty dashboards that look impressive but do not tell the learner what to do next.
- Flashcard apps that force manual deck curation before first value.
- AI tutor flows that mark correct answers wrong because the data contract is brittle.
