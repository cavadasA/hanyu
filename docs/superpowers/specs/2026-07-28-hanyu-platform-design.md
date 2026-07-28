# Hanyu — Interactive Chinese Learning Platform

**Date:** 2026-07-28
**Status:** Approved
**Author:** User + Copilot

## Overview

Hanyu is a web-based interactive platform for learning Mandarin Chinese (HSK levels 1-3). It combines spaced repetition flashcards, AI-generated dynamic exercises, graded readings, grammar references, and progress tracking in a single application.

**Target user:** Personal use (single user), designed to be scalable to multi-user in the future.

## Goals

- Practice and reinforce HSK 1-3 vocabulary through spaced repetition (SM-2 algorithm)
- Generate varied, contextual exercises using AI (DeepSeek or Gemini)
- Provide graded reading material adapted to the user's level
- Track progress with visual statistics and streak motivation
- Support audio (pronunciation playback and speech recognition)

## Non-Goals (V1)

- Mobile native app (web-only for now, responsive design)
- Multi-user authentication (single hardcoded user)
- HSK levels 4-6 (data structure supports it, content not pre-loaded)
- Offline mode / PWA

---

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + React Router v6 |
| State management | Zustand |
| Styling | Tailwind CSS (dark/light theme via CSS variables) |
| Charts | Recharts |
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| AI providers | DeepSeek API, Google Gemini API (configurable) |
| Audio | Web Speech API (SpeechSynthesis + SpeechRecognition) |

### Project Structure

```
hanyu/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── FlashCard.jsx
│   │   │   ├── ExerciseRenderer.jsx
│   │   │   ├── ReadingView.jsx
│   │   │   ├── AudioButton.jsx
│   │   │   ├── PinyinToggle.jsx
│   │   │   └── ThemeToggle.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Flashcards.jsx
│   │   │   ├── Exercises.jsx
│   │   │   ├── Readings.jsx
│   │   │   ├── Grammar.jsx
│   │   │   ├── Words.jsx
│   │   │   └── Settings.jsx
│   │   ├── hooks/
│   │   │   ├── useSpacedRepetition.js
│   │   │   ├── useSpeech.js
│   │   │   └── useExercise.js
│   │   ├── services/
│   │   │   └── api.js              # Axios/fetch wrapper for backend calls
│   │   ├── stores/
│   │   │   └── appStore.js         # Zustand global state
│   │   └── styles/
│   │       └── theme.css           # CSS variables for dark/light
│   ├── index.html
│   └── vite.config.js
├── server/
│   ├── routes/
│   │   ├── flashcards.js
│   │   ├── exercises.js
│   │   ├── readings.js
│   │   ├── grammar.js
│   │   ├── words.js
│   │   ├── stats.js
│   │   └── settings.js
│   ├── services/
│   │   ├── srs-engine.js           # SM-2 algorithm implementation
│   │   ├── ai-connector.js         # Strategy pattern for AI providers
│   │   ├── deepseek-provider.js
│   │   ├── gemini-provider.js
│   │   └── exercise-generator.js   # Prompt templates + response parsing
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 001-initial-schema.sql
│   │   ├── seeds/
│   │   │   ├── hsk1-words.json
│   │   │   ├── hsk2-words.json
│   │   │   ├── hsk3-words.json
│   │   │   └── grammar-points.json
│   │   └── index.js                # Database connection + helpers
│   └── app.js                      # Express server entry point
├── data/                            # Raw data from HSK-3.0 repo (TSV)
├── scripts/
│   └── import-hsk-data.js          # Script to parse TSV -> seed JSON
├── package.json
└── README.md
```

---

## Data Model (SQLite)

### `users`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| username | TEXT UNIQUE | Username |
| created_at | TEXT | ISO timestamp |
| settings | TEXT | JSON blob (theme, current_level, cards_per_day, ai_provider, api_key) |

V1: Single user with id=1, no auth.

### `words`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| hanzi | TEXT NOT NULL | Chinese characters (e.g., 你好) |
| pinyin | TEXT NOT NULL | Pinyin with tone marks (e.g., nǐ hǎo) |
| meaning_en | TEXT NOT NULL | English translation |
| meaning_es | TEXT | Spanish translation (optional) |
| hsk_level | INTEGER NOT NULL | 1, 2, or 3 |
| pos | TEXT | Part of speech |
| frequency | INTEGER | Usage frequency rank |

**Data source:** [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0) — `New HSK (2021)/HSK List/` TSV files.

### `grammar_points`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| hsk_level | INTEGER NOT NULL | 1, 2, or 3 |
| title | TEXT NOT NULL | Grammar point title |
| explanation | TEXT NOT NULL | Full explanation |
| examples | TEXT NOT NULL | JSON array of example sentences |
| order_idx | INTEGER | Display order within level |

### `srs_cards`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER | FK → users.id (default 1) |
| word_id | INTEGER | FK → words.id |
| ease_factor | REAL | SM-2 ease factor (default 2.5) |
| interval | INTEGER | Days until next review (default 0) |
| repetitions | INTEGER | Consecutive correct reviews (default 0) |
| next_review | TEXT NOT NULL | ISO date of next scheduled review |
| last_review | TEXT | ISO date of last review |
| status | TEXT | new, learning, review, or mastered |

### `review_log`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| card_id | INTEGER | FK → srs_cards.id |
| reviewed_at | TEXT NOT NULL | ISO timestamp |
| quality | INTEGER NOT NULL | User rating 0-5 (SM-2 scale) |
| time_ms | INTEGER | Response time in milliseconds |

### `exercises`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| type | TEXT NOT NULL | fill_blank, multiple_choice, reorder, dictation, matching |
| hsk_level | INTEGER NOT NULL | Target HSK level |
| prompt | TEXT NOT NULL | JSON: exercise content |
| answer | TEXT NOT NULL | Correct answer |
| generated_at | TEXT NOT NULL | ISO timestamp |
| source_model | TEXT | deepseek or gemini |

### `readings`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| hsk_level | INTEGER NOT NULL | Target HSK level |
| format | TEXT NOT NULL | short_text, story, dialogue |
| title | TEXT NOT NULL | Title in Chinese |
| content | TEXT NOT NULL | Full text in Chinese |
| pinyin_text | TEXT | Text with pinyin annotations |
| questions | TEXT NOT NULL | JSON array of comprehension questions |
| generated_at | TEXT NOT NULL | ISO timestamp |
| source_model | TEXT | deepseek or gemini |

### `user_stats`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER | FK → users.id (default 1) |
| date | TEXT NOT NULL | YYYY-MM-DD |
| cards_reviewed | INTEGER | Cards reviewed today |
| cards_new | INTEGER | New cards learned today |
| exercises_done | INTEGER | Exercises completed today |
| readings_done | INTEGER | Readings completed today |
| time_spent_ms | INTEGER | Total study time today |
| streak_days | INTEGER | Current streak |

UNIQUE constraint on (user_id, date).

---

## Feature: Flashcards (SRS)

### Algorithm: SM-2

Implementation of the SuperMemo 2 algorithm:

```
After each review with quality q (0-5):
  if q < 3: reset (repetitions = 0, interval = 1)
  else:
    if repetitions == 0: interval = 1
    else if repetitions == 1: interval = 6
    else: interval = round(interval * ease_factor)
    repetitions += 1

  ease_factor = max(1.3, ease_factor + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)))
  next_review = today + interval days
```

### User Flow

1. User navigates to `/flashcards`
2. System queries cards where `next_review <= today`, ordered by priority (overdue first, then new)
3. Card displays **hanzi** prominently (large font)
4. User thinks, then taps "Show Answer"
5. Reveals: pinyin, meaning, example sentence
6. User can tap audio button to hear pronunciation (TTS)
7. User rates: Again (0) | Hard (3) | Good (4) | Easy (5)
8. SM-2 recalculates, card scheduled for next review
9. Next card appears (or session complete)

### Card Modes

| Mode | Front | Back |
|------|-------|------|
| Recognition | Hanzi | Pinyin + Meaning |
| Recall | Meaning | Hanzi + Pinyin |
| Listening | Audio only | Hanzi + Pinyin + Meaning |

### Configuration (per user)

- `new_cards_per_day`: 20 (default)
- `max_reviews_per_session`: 100 (default)
- `card_order`: frequency or hsk_order
- `level_filter`: [1, 2, 3] or subset

---

## Feature: Dynamic Exercises (AI-Generated)

### AI Connector (Strategy Pattern)

```javascript
// Interface
class AIProvider {
  async generateExercise(type, level, context) // returns ExerciseJSON
  async generateReading(level, format)         // returns ReadingJSON
}

// Implementations
class DeepSeekProvider extends AIProvider { ... }
class GeminiProvider extends AIProvider { ... }
```

Configuration stored in user settings. API key stored in SQLite (encrypted at rest in V2).

### Exercise Types

#### 1. Fill in the Blank

```json
{
  "type": "fill_blank",
  "sentence": "我___去学校。",
  "options": ["每天", "昨天", "已经", "可能"],
  "correct": "每天",
  "explanation": "每天 (měitiān) means 'every day' — fits the habitual action pattern."
}
```

#### 2. Multiple Choice (Translation)

```json
{
  "type": "multiple_choice",
  "question": "What does 高兴 mean?",
  "options": ["sad", "happy", "angry", "tired"],
  "correct": "happy"
}
```

#### 3. Sentence Reorder

```json
{
  "type": "reorder",
  "words": ["去", "我", "学校", "明天", "想"],
  "correct_order": ["我", "明天", "想", "去", "学校"],
  "translation": "I want to go to school tomorrow."
}
```

#### 4. Dictation

```json
{
  "type": "dictation",
  "audio_text": "今天天气很好",
  "pinyin": "jīntiān tiānqì hěn hǎo",
  "accept_pinyin": true
}
```

TTS plays the sentence; user types what they hear in characters (or pinyin as fallback).

#### 5. Matching

```json
{
  "type": "matching",
  "pairs": [
    {"left": "学生", "right": "student"},
    {"left": "老师", "right": "teacher"},
    {"left": "医生", "right": "doctor"},
    {"left": "朋友", "right": "friend"},
    {"left": "同学", "right": "classmate"}
  ]
}
```

### Prompt Strategy

The AI prompt includes:
- Target HSK level and word list for that level
- Exercise type with expected JSON schema
- Words the user frequently gets wrong (personalization)
- Instruction to use only vocabulary at or below the target level

Exercises are cached in the `exercises` table to avoid redundant API calls. Cache invalidation: regenerate after 30 days or on user request.

### Fallback (No API Key)

If no API key is configured, serve from a pre-generated pool of exercises (seeded during initial setup with ~50 exercises per type per level).

---

## Feature: Graded Reading

### Generation

AI generates texts using vocabulary constrained to the user's current HSK level (and below). Each reading includes comprehension questions.

### Formats

| Format | Length | Description |
|--------|--------|-------------|
| short_text | 100-200 chars | Email, description, opinion |
| story | 300-500 chars | Narrative with beginning-middle-end |
| dialogue | 150-300 chars | Conversation (2-3 speakers) |

### Reading Interface

- **Header:** Title (Chinese + pinyin)
- **Body:** Text in large Chinese characters
- **Pinyin toggle:** Show/hide pinyin above each character (ruby annotations)
- **Tap any character:** Popup with pinyin + meaning + add to flashcards
- **Audio button:** TTS reads the full text
- **Vocabulary sidebar:** New words from this text not yet in user's SRS deck
- **Comprehension questions:** 3-5 multiple choice questions after reading
- **Score:** Displayed after answering all questions, with explanations

### Adding Words to SRS

From any reading, the user can tap a word and choose "Add to Flashcards." This creates a new `srs_cards` entry with status='new' and schedules it for the next session.

---

## Feature: Grammar Reference

### Content

- Grammar points organized by HSK level (1, 2, 3)
- Each point: title, explanation in plain language, structural pattern, 3-5 example sentences with pinyin and translation
- Initial data sourced from krmanik/HSK-3.0 repo's Grammar folder
- Cross-linked from exercises and readings when a grammar point is relevant

### Interface

- Left sidebar: level selector + list of grammar points
- Main area: selected grammar point with examples
- Each example sentence: Chinese + pinyin (toggleable) + English translation
- Audio button per example sentence

---

## Feature: Dashboard and Progress

### Metrics Displayed

- **Daily streak:** Calendar heatmap (GitHub contributions style)
- **Cards overview:** New today / Reviewed today / Due tomorrow / Total mastered (per level)
- **SRS distribution:** Pie or bar chart showing cards by status (new/learning/review/mastered)
- **Learning curve:** Line chart of cumulative mastered cards over time
- **Exercise stats:** Completed by type, accuracy percentage
- **Reading stats:** Completed count, average comprehension score
- **Time studied:** Today / this week / all time

### Streak Logic

A day "counts" if the user reviews at least 1 card OR completes at least 1 exercise. Streak resets at midnight local time if no activity the previous day.

---

## Feature: Audio (Web Speech API)

### Text-to-Speech (TTS)

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'zh-CN';
utterance.rate = 0.8; // Slightly slower for learners
speechSynthesis.speak(utterance);
```

Used in: Flashcards (pronunciation), Readings (full text), Exercises (dictation prompt).

### Speech-to-Text (STT)

```javascript
const recognition = new SpeechRecognition();
recognition.lang = 'zh-CN';
recognition.interimResults = true;
recognition.start();
```

Used in: Pronunciation practice exercises. User speaks, system transcribes, compares to expected.

### Browser Compatibility

- TTS: Supported in all modern browsers (Chrome, Firefox, Safari, Edge)
- STT: Best support in Chrome/Edge (WebKit-based). Firefox has limited support.
- Fallback: If STT unavailable, dictation exercises switch to typed input mode with a notice.

---

## API Endpoints

### Flashcards

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/flashcards/due | Get cards due for review today |
| POST | /api/flashcards/:id/review | Submit review result (body: { quality: 0-5 }) |
| GET | /api/flashcards/stats | SRS statistics summary |
| POST | /api/flashcards/add | Add a word to SRS deck (body: { word_id }) |

### Exercises

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/exercises/generate | Generate exercise (body: { type, level }) |
| POST | /api/exercises/:id/check | Check answer (body: { answer }) |
| GET | /api/exercises/history | Past exercises with results |

### Readings

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/readings/generate | Generate reading (body: { level, format }) |
| GET | /api/readings | List cached readings |
| GET | /api/readings/:id | Get specific reading |

### Grammar

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/grammar/:level | Grammar points for a level |
| GET | /api/grammar/:level/:id | Specific grammar point |

### Words

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/words | List words (query: level, search, page) |
| GET | /api/words/:id | Single word detail |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/stats/dashboard | Full dashboard data |
| GET | /api/stats/streak | Current streak info |
| POST | /api/stats/log-time | Log study time (body: { ms }) |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/settings | Get user settings |
| PUT | /api/settings | Update user settings |

---

## Navigation (Frontend Routes)

| Path | Page | Description |
|------|------|-------------|
| / | Dashboard | Overview with stats, streak, quick actions |
| /flashcards | Flashcards | SRS review session |
| /exercises | Exercises | Choose type then do exercise |
| /readings | Readings | Browse/generate readings |
| /readings/:id | Reading Detail | Read + answer questions |
| /grammar | Grammar | Browse grammar by level |
| /words | Word Explorer | Searchable vocabulary table |
| /settings | Settings | API keys, preferences, theme |

---

## UI/UX

### Theme System

- Dark mode and light mode via CSS custom properties
- Toggle in header/navbar
- Persist preference in user settings (SQLite)
- Chinese-inspired accent colors (vermilion red #E23D28, gold #D4A017)

### Responsive Design

- Desktop: sidebar navigation + main content
- Tablet/Mobile: bottom navigation bar, full-width cards
- Breakpoints: 768px (tablet), 1024px (desktop)

### Typography

- Chinese text: system fonts (PingFang SC, Microsoft YaHei, Noto Sans SC)
- Large characters in flashcard view (48-64px)
- Pinyin: smaller, muted color, positioned above characters (ruby annotation style)

---

## Authentication (Future V2)

- JWT-based authentication
- bcrypt password hashing
- Register/Login pages
- Each user gets independent SRS progress
- API key stored per-user (encrypted)
- Rate limiting on AI generation endpoints

---

## Data Seeding

### Source

Repository: [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0)
Path: `New HSK (2021)/HSK List/` — contains TSV files with columns: hanzi, pinyin, meaning, pos, frequency.

### Import Script (scripts/import-hsk-data.js)

1. Download/clone relevant TSV files from the repo
2. Parse TSV into structured JSON
3. Write seed files: hsk1-words.json, hsk2-words.json, hsk3-words.json
4. Grammar points from `New HSK (2021)/HSK Grammar/`
5. Run seed script to populate SQLite on first `npm run seed`

---

## Development Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:client": "cd client && vite",
    "dev:server": "cd server && nodemon app.js",
    "build": "cd client && vite build",
    "migrate": "node server/db/migrate.js",
    "seed": "node server/db/seed.js",
    "import-hsk": "node scripts/import-hsk-data.js",
    "start": "node server/app.js"
  }
}
```

---

## Error Handling

- AI generation failures: Return cached exercise or show "AI unavailable, try again" message
- Invalid API key: Clear error message in Settings with link to provider docs
- Speech API unsupported: Graceful degradation to text-only mode
- Network errors: Toast notification with retry option
- Database errors: Logged server-side, generic error to client

---

## Testing Strategy

- **Unit tests:** SM-2 algorithm, AI prompt generation, response parsing
- **Integration tests:** API endpoints with test SQLite database
- **Frontend:** Component tests for FlashCard, ExerciseRenderer
- **E2E (future):** Playwright for critical flows (review session, exercise completion)
- **Test runner:** Vitest (compatible with Vite, fast)

---

## Summary

| Feature | Implementation |
|---------|---------------|
| Flashcards + SRS | SM-2 algorithm, 3 card modes, configurable daily limits |
| Exercises | 5 types, AI-generated (DeepSeek/Gemini), cached, with fallback |
| Readings | 3 formats, AI-generated, interactive (tap words, pinyin toggle, TTS) |
| Grammar | Pre-loaded from HSK-3.0 repo, organized by level |
| Dashboard | Streak, charts, per-level stats (Recharts) |
| Audio | Web Speech API (TTS + STT), graceful fallback |
| Data | HSK 1-3 vocabulary pre-seeded from krmanik/HSK-3.0 |
| Auth | V1: single user, V2: JWT multi-user |
| Theme | Dark/light toggle, Chinese-inspired colors |
