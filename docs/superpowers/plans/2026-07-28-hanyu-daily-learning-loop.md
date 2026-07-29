# Hanyu Daily Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Hanyu into a trustworthy daily HSK2 learning loop with a useful starter deck, reliable readings, word-level lookup, accurate progress credit, and a Today-first dashboard.

**Architecture:** Incremental changes to the existing React 18 + Vite client and Express + SQLite backend. Trust fixes land first, then activation, then the Today experience. Keep single-user `user_id = 1`, but isolate new user-specific behavior in small backend helpers where touched.

**Tech Stack:** React 18, Vite, React Router 6, Zustand, Tailwind CSS, Recharts, Express, SQLite via better-sqlite3, Vitest, Testing Library

## Global Constraints

- Node.js >= 18.
- Single-user mode remains user id=1, no auth in this pass.
- HSK levels 1-3 only.
- HSK1 is review, HSK2 is the main consolidation layer, HSK3 is optional preview.
- No new production dependencies in this pass.
- Test runner: Vitest for backend, hooks, and React component tests.
- Use existing route/component patterns before adding abstractions.
- Do not expose stored API key values in settings responses.
- Keep UI copy concise and task-focused.

---

## File Structure

- Create: `server/services/reading-answers.js` for answer canonicalization and scoring.
- Create: `server/services/reading-tokenizer.js` for server-side longest-match Chinese tokenization.
- Create: `server/services/stats-recorder.js` for daily stat increments shared by flashcards, exercises, and readings.
- Create: `server/services/starter-deck.js` for recommended starter deck selection and insertion.
- Create: `server/routes/today.js` for the Today summary endpoint.
- Create: `server/services/reading-answers.test.js`.
- Create: `server/services/reading-tokenizer.test.js`.
- Create: `server/services/stats-recorder.test.js`.
- Create: `server/services/starter-deck.test.js`.
- Create: `server/routes/today.test.js`.
- Create: `client/src/components/WordPopup.test.jsx`.
- Create: `PRODUCT.md`.
- Modify: `server/app.js` to mount `/api/today`.
- Modify: `server/routes/readings.js` to return normalized questions, tokenize details, and record reading completion.
- Modify: `server/routes/readings.test.js` for real AI-format reading cases and completion stats.
- Modify: `server/routes/flashcards.js` and `server/routes/flashcards.test.js` for starter deck endpoint and review stats.
- Modify: `server/routes/exercises.js` to use `recordDailyStats`.
- Modify: `server/routes/settings.js` and `server/routes/settings.test.js` to redact API keys.
- Modify: `client/src/services/api.js` for Today, starter deck, and reading completion APIs.
- Modify: `client/src/pages/Dashboard.jsx` and `client/src/pages/Dashboard.test.jsx` into the Today-first screen.
- Modify: `client/src/pages/Flashcards.jsx` and `client/src/pages/Flashcards.test.jsx` for reload after completion and starter deck empty state.
- Modify: `client/src/components/ReadingView.jsx` and `client/src/components/ReadingView.test.jsx` for normalized questions, token rendering, word popup, and reading completion.
- Modify: `client/src/components/WordPopup.jsx` for token payload and SRS status.

---

### Task 1: Reading Answer Normalization

**Files:**
- Create: `server/services/reading-answers.js`
- Create: `server/services/reading-answers.test.js`
- Modify: `server/routes/readings.js`
- Modify: `server/routes/readings.test.js`
- Modify: `client/src/components/ReadingView.jsx`
- Modify: `client/src/components/ReadingView.test.jsx`

**Interfaces:**
- Consumes: old question shape `{ question: string, options: string[], correct: string }` and new canonical shape `{ question: string, options: { id: string, text: string }[], correct_option_id: string }`
- Produces: `normalizeReadingQuestion(question, index)` returning `{ id, question, options, correct_option_id }`
- Produces: `scoreReadingAnswers(questions, answersByQuestionId)` returning `{ score, total, results }`
- Produces: `POST /api/readings/:id/complete` accepting `{ answers: { [questionId]: optionId } }`

- [ ] **Step 1: Write failing unit tests for observed AI formats**

Create `server/services/reading-answers.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { normalizeReadingQuestion, scoreReadingAnswers } from './reading-answers.js';

describe('reading answer normalization', () => {
  it('normalizes exact text answers', () => {
    const question = normalizeReadingQuestion({
      question: '小明喜欢什么？',
      options: ['看电视', '看书', '吃饭', '运动'],
      correct: '看书',
    }, 0);

    expect(question.options[1]).toEqual({ id: 'B', text: '看书' });
    expect(question.correct_option_id).toBe('B');
  });

  it('normalizes letter-only correct answers', () => {
    const question = normalizeReadingQuestion({
      question: '小明家有几口人？',
      options: ['两口人', '三口人', '四口人', '五口人'],
      correct: 'B',
    }, 0);

    expect(question.correct_option_id).toBe('B');
  });

  it('normalizes letter-prefixed options', () => {
    const question = normalizeReadingQuestion({
      question: '小明的家有几只猫？',
      options: ['A. 一只', 'B. 两只', 'C. 三只', 'D. 没有猫'],
      correct: 'A',
    }, 0);

    expect(question.options[0]).toEqual({ id: 'A', text: '一只' });
    expect(question.correct_option_id).toBe('A');
  });

  it('scores answers by canonical option id', () => {
    const questions = [
      normalizeReadingQuestion({ question: 'Q1', options: ['一', '二'], correct: 'B' }, 0),
      normalizeReadingQuestion({ question: 'Q2', options: ['A. 好', 'B. 不好'], correct: 'A' }, 1),
    ];

    const result = scoreReadingAnswers(questions, { q0: 'B', q1: 'A' });

    expect(result).toEqual({
      score: 2,
      total: 2,
      results: [
        { question_id: 'q0', selected_option_id: 'B', correct_option_id: 'B', correct: true },
        { question_id: 'q1', selected_option_id: 'A', correct_option_id: 'A', correct: true },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run server/services/reading-answers.test.js`

Expected: FAIL with module-not-found for `server/services/reading-answers.js`.

- [ ] **Step 3: Implement the normalization service**

Create `server/services/reading-answers.js`:

```javascript
const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function splitOption(rawOption, index) {
  const fallbackId = OPTION_IDS[index] || String(index + 1);
  const text = cleanText(rawOption);
  const match = text.match(/^([A-Fa-f])[\s.．、:：-]+(.+)$/);

  if (!match) {
    return { id: fallbackId, text };
  }

  return { id: match[1].toUpperCase(), text: cleanText(match[2]) };
}

export function normalizeReadingQuestion(rawQuestion, index = 0) {
  const id = rawQuestion.id || `q${index}`;
  const rawOptions = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
  const options = rawOptions.map((option, optionIndex) => {
    if (typeof option === 'object' && option !== null) {
      return {
        id: cleanText(option.id || OPTION_IDS[optionIndex] || String(optionIndex + 1)).toUpperCase(),
        text: cleanText(option.text),
      };
    }

    return splitOption(option, optionIndex);
  });

  const rawCorrect = cleanText(rawQuestion.correct_option_id || rawQuestion.correct).replace(/[.．、:：-]$/, '');
  const letterMatch = rawCorrect.match(/^[A-Fa-f]$/);
  const correctByText = options.find((option) => option.text === rawCorrect || `${option.id}. ${option.text}` === rawCorrect);

  return {
    id,
    question: cleanText(rawQuestion.question),
    options,
    correct_option_id: letterMatch ? rawCorrect.toUpperCase() : correctByText?.id || rawCorrect,
  };
}

export function normalizeReadingQuestions(questions = []) {
  return questions.map((question, index) => normalizeReadingQuestion(question, index));
}

export function scoreReadingAnswers(questions, answersByQuestionId = {}) {
  const normalizedQuestions = normalizeReadingQuestions(questions);
  const results = normalizedQuestions.map((question) => {
    const selected = cleanText(answersByQuestionId[question.id]).toUpperCase();
    return {
      question_id: question.id,
      selected_option_id: selected,
      correct_option_id: question.correct_option_id,
      correct: selected === question.correct_option_id,
    };
  });

  return {
    score: results.filter((result) => result.correct).length,
    total: normalizedQuestions.length,
    results,
  };
}
```

- [ ] **Step 4: Return normalized questions from reading detail and cached generation**

In `server/routes/readings.js`, import the helpers:

```javascript
import { normalizeReadingQuestions, scoreReadingAnswers } from '../services/reading-answers.js';
```

Update `GET /api/readings/:id` response:

```javascript
const questions = normalizeReadingQuestions(JSON.parse(reading.questions));
res.json({
  ...reading,
  questions,
});
```

Update cached fallback in `POST /api/readings/generate`:

```javascript
res.json({ ...cached, questions: normalizeReadingQuestions(JSON.parse(cached.questions)) });
```

After `POST /generate`, return normalized questions:

```javascript
res.json({ id: Number(lastInsertRowid), ...reading, questions: normalizeReadingQuestions(reading.questions) });
```

- [ ] **Step 5: Add reading completion endpoint**

In `server/routes/readings.js`, before `router.post('/generate', ...)`, add:

```javascript
  router.post('/:id/complete', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { answers = {} } = req.body;

    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(id);
    if (!reading) {
      res.status(404).json({ error: 'Reading not found' });
      return;
    }

    const score = scoreReadingAnswers(JSON.parse(reading.questions), answers);
    res.json(score);
  });
```

Task 2 will move the stats increment into a shared helper before this endpoint is considered complete.

- [ ] **Step 6: Add API integration tests**

Add to `server/routes/readings.test.js`:

```javascript
  it('GET /api/readings/:id normalizes letter-only correct answers', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '我的家', '我家有三口人。', 'Wǒ jiā yǒu sān kǒu rén.', ?, 'deepseek')
    `).run(JSON.stringify([
      {
        question: '小明家有几口人？',
        options: ['两口人', '三口人', '四口人', '五口人'],
        correct: 'B',
      },
    ]));

    const response = await request(app, 'GET', `/api/readings/${lastInsertRowid}`);

    expect(response.status).toBe(200);
    expect(response.body.questions[0].options[1]).toEqual({ id: 'B', text: '三口人' });
    expect(response.body.questions[0].correct_option_id).toBe('B');
  });

  it('POST /api/readings/:id/complete scores canonical option ids', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '我的家', '我家有一只猫。', 'Wǒ jiā yǒu yī zhī māo.', ?, 'deepseek')
    `).run(JSON.stringify([
      {
        question: '小明的家有几只猫？',
        options: ['A. 一只', 'B. 两只', 'C. 三只', 'D. 没有猫'],
        correct: 'A',
      },
    ]));

    const response = await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, {
      answers: { q0: 'A' },
    });

    expect(response.status).toBe(200);
    expect(response.body.score).toBe(1);
    expect(response.body.total).toBe(1);
  });
```

- [ ] **Step 7: Update the client to submit option ids**

In `client/src/services/api.js`, add:

```javascript
  completeReading: (id, answers) =>
    request(`/readings/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
```

In `client/src/components/ReadingView.jsx`, store option ids instead of option text:

```jsx
function handleAnswer(questionId, optionId) {
  if (submitted) {
    return;
  }

  setAnswers((current) => ({
    ...current,
    [questionId]: optionId,
  }));
}
```

Compute score from API result:

```jsx
const [scoreResult, setScoreResult] = useState(null);
const score = scoreResult ? scoreResult.score : null;
```

Submit with:

```jsx
async function handleSubmit() {
  const result = await api.completeReading(reading.id, answers);
  setScoreResult(result);
  setSubmitted(true);
}
```

Render option text from canonical options:

```jsx
{question.options.map((option) => (
  <button
    key={option.id}
    type="button"
    onClick={() => handleAnswer(question.id, option.id)}
  >
    {option.text}
  </button>
))}
```

- [ ] **Step 8: Update component tests for canonical questions**

In `client/src/components/ReadingView.test.jsx`, update the mocked reading questions:

```javascript
questions: [
  {
    id: 'q0',
    question: '他叫什么？',
    options: [
      { id: 'A', text: '小明' },
      { id: 'B', text: '小红' },
      { id: 'C', text: '小李' },
      { id: 'D', text: '小王' },
    ],
    correct_option_id: 'A',
  },
],
```

Mock `api.completeReading`:

```javascript
completeReading: vi.fn().mockResolvedValue({
  score: 1,
  total: 1,
  results: [{ question_id: 'q0', selected_option_id: 'A', correct_option_id: 'A', correct: true }],
}),
```

- [ ] **Step 9: Run task verification**

Run:

```bash
npx vitest run server/services/reading-answers.test.js server/routes/readings.test.js client/src/components/ReadingView.test.jsx
npm test
```

Expected: all targeted tests pass, then full suite passes.

- [ ] **Step 10: Commit**

```bash
git add server/services/reading-answers.js server/services/reading-answers.test.js server/routes/readings.js server/routes/readings.test.js client/src/services/api.js client/src/components/ReadingView.jsx client/src/components/ReadingView.test.jsx
git commit -m "fix: normalize reading comprehension answers"
```

---

### Task 2: Progress Recording and Flashcard Session Reload

**Files:**
- Create: `server/services/stats-recorder.js`
- Create: `server/services/stats-recorder.test.js`
- Modify: `server/routes/flashcards.js`
- Modify: `server/routes/flashcards.test.js`
- Modify: `server/routes/exercises.js`
- Modify: `server/routes/readings.js`
- Modify: `server/routes/stats.js`
- Modify: `client/src/pages/Flashcards.jsx`
- Modify: `client/src/pages/Flashcards.test.jsx`

**Interfaces:**
- Produces: `recordDailyStats(db, updates, date = today)` where updates may include `cards_reviewed`, `cards_new`, `exercises_done`, `readings_done`, `time_spent_ms`
- Produces: flashcard "Review again" button reloads due cards without a scope error
- Produces: reading completion increments `readings_done`

- [x] **Step 1: Write failing stats-recorder tests**

Create `server/services/stats-recorder.test.js`:

```javascript
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { recordDailyStats } from './stats-recorder.js';

describe('recordDailyStats', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a daily stats row when none exists', () => {
    const stats = recordDailyStats(db, { cards_reviewed: 1, cards_new: 1 }, '2026-07-28');

    expect(stats.cards_reviewed).toBe(1);
    expect(stats.cards_new).toBe(1);
  });

  it('increments an existing daily stats row', () => {
    recordDailyStats(db, { cards_reviewed: 1 }, '2026-07-28');
    const stats = recordDailyStats(db, { cards_reviewed: 2, readings_done: 1 }, '2026-07-28');

    expect(stats.cards_reviewed).toBe(3);
    expect(stats.readings_done).toBe(1);
  });
});
```

- [x] **Step 2: Implement stats recorder**

Create `server/services/stats-recorder.js`:

```javascript
const STAT_FIELDS = ['cards_reviewed', 'cards_new', 'exercises_done', 'readings_done', 'time_spent_ms'];

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export function recordDailyStats(db, updates, date = todayIsoDate()) {
  const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
  const cleanUpdates = Object.fromEntries(
    STAT_FIELDS.map((field) => [field, Math.max(0, Number(updates[field] || 0))])
  );

  if (!existing) {
    db.prepare(`
      INSERT INTO user_stats (user_id, date, cards_reviewed, cards_new, exercises_done, readings_done, time_spent_ms)
      VALUES (1, @date, @cards_reviewed, @cards_new, @exercises_done, @readings_done, @time_spent_ms)
    `).run({ date, ...cleanUpdates });

    return db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
  }

  db.prepare(`
    UPDATE user_stats
    SET cards_reviewed = cards_reviewed + @cards_reviewed,
        cards_new = cards_new + @cards_new,
        exercises_done = exercises_done + @exercises_done,
        readings_done = readings_done + @readings_done,
        time_spent_ms = time_spent_ms + @time_spent_ms
    WHERE id = @id
  `).run({ id: existing.id, ...cleanUpdates });

  return db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
}
```

- [x] **Step 3: Use recorder in flashcard reviews**

In `server/routes/flashcards.js`, import:

```javascript
import { recordDailyStats } from '../services/stats-recorder.js';
```

After inserting `review_log`, add:

```javascript
recordDailyStats(db, {
  cards_reviewed: 1,
  cards_new: card.status === 'new' ? 1 : 0,
});
```

- [x] **Step 4: Use recorder in exercises and readings**

In `server/routes/exercises.js`, replace manual `user_stats` upsert with:

```javascript
recordDailyStats(db, { exercises_done: 1 });
```

In `server/routes/readings.js`, remove `readings_done` increments from generation and add this inside `POST /api/readings/:id/complete` after scoring:

```javascript
recordDailyStats(db, { readings_done: 1 });
```

- [x] **Step 5: Update streak to count readings**

In `server/routes/stats.js`, update the streak query:

```sql
WHERE user_id = 1 AND (cards_reviewed > 0 OR exercises_done > 0 OR readings_done > 0)
```

- [x] **Step 6: Add backend tests for stat increments**

Add to `server/routes/flashcards.test.js`:

```javascript
  it('POST /api/flashcards/:id/review increments reviewed and new card stats', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word.id, today);

    await request(app, 'POST', `/api/flashcards/${lastInsertRowid}/review`, { quality: 4 });

    const stats = db.prepare('SELECT cards_reviewed, cards_new FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    expect(stats).toEqual({ cards_reviewed: 1, cards_new: 1 });
  });
```

Add to `server/routes/readings.test.js`:

```javascript
  it('POST /api/readings/:id/complete increments readings_done', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '你好', '你好。', 'Nǐ hǎo.', ?, 'seed')
    `).run(JSON.stringify([{ question: '说了什么？', options: ['你好', '再见'], correct: '你好' }]));

    await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, { answers: { q0: 'A' } });

    const today = new Date().toISOString().split('T')[0];
    const stats = db.prepare('SELECT readings_done FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    expect(stats.readings_done).toBe(1);
  });
```

- [x] **Step 7: Fix flashcards reload scope**

In `client/src/pages/Flashcards.jsx`, move `loadCards` out of `useEffect`:

```jsx
async function loadCards() {
  setLoading(true);

  try {
    const data = await api.getDueCards();
    setCards(data.cards || []);
    setCurrentIndex(0);
    setReviewed(0);
    setSessionDone(false);
    sessionStartedAt.current = Date.now();
    cardStartedAt.current = Date.now();
  } catch (error) {
    console.error('Failed to load flashcards:', error);
  } finally {
    setLoading(false);
  }
}

useEffect(() => {
  loadCards();
}, []);
```

- [x] **Step 8: Add client reload test**

Add to `client/src/pages/Flashcards.test.jsx`:

```javascript
  it('reloads cards when Review again is clicked', async () => {
    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Show Answer'));
    fireEvent.click(screen.getByText('Good'));

    await waitFor(() => {
      expect(screen.getByText('Session Complete!')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Review again'));

    await waitFor(() => {
      expect(api.getDueCards).toHaveBeenCalledTimes(2);
    });
  });
```

- [x] **Step 9: Run task verification**

Run:

```bash
npx vitest run server/services/stats-recorder.test.js server/routes/flashcards.test.js server/routes/exercises.test.js server/routes/readings.test.js server/routes/stats.test.js client/src/pages/Flashcards.test.jsx
npm test
```

Expected: all tests pass.

- [x] **Step 10: Commit (Skipped per user instruction)**

```bash
git add server/services/stats-recorder.js server/services/stats-recorder.test.js server/routes/flashcards.js server/routes/flashcards.test.js server/routes/exercises.js server/routes/readings.js server/routes/readings.test.js server/routes/stats.js client/src/pages/Flashcards.jsx client/src/pages/Flashcards.test.jsx
git commit -m "fix: record daily study progress accurately"
```

---

### Task 3: Starter Deck Activation

**Files:**
- Create: `server/services/starter-deck.js`
- Create: `server/services/starter-deck.test.js`
- Modify: `server/routes/flashcards.js`
- Modify: `server/routes/flashcards.test.js`
- Modify: `client/src/services/api.js`
- Modify: `client/src/pages/Flashcards.jsx`
- Modify: `client/src/pages/Flashcards.test.jsx`

**Interfaces:**
- Produces: `createStarterDeck(db, { strategy, limit })` returning `{ inserted, skipped, total_deck_size, strategy }`
- Produces: `POST /api/flashcards/starter-deck` accepting `{ strategy?: 'hsk2_consolidation' | 'hsk1_review', limit?: number }`
- Produces: empty flashcard state CTA to create the recommended deck

- [ ] **Step 1: Write starter deck service tests**

Create `server/services/starter-deck.test.js`:

```javascript
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createStarterDeck } from './starter-deck.js';

describe('createStarterDeck', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
  });

  it('creates a 150-card HSK2 consolidation starter deck by default', () => {
    const result = createStarterDeck(db, {});

    expect(result.strategy).toBe('hsk2_consolidation');
    expect(result.inserted).toBe(150);
    expect(result.total_deck_size).toBe(150);
  });

  it('does not duplicate cards when run twice', () => {
    createStarterDeck(db, { limit: 20 });
    const result = createStarterDeck(db, { limit: 20 });

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(20);
    expect(result.total_deck_size).toBe(20);
  });

  it('supports HSK1 review strategy', () => {
    createStarterDeck(db, { strategy: 'hsk1_review', limit: 30 });
    const levels = db.prepare(`
      SELECT DISTINCT w.hsk_level
      FROM srs_cards sc
      JOIN words w ON w.id = sc.word_id
      ORDER BY w.hsk_level
    `).all().map((row) => row.hsk_level);

    expect(levels).toEqual([1]);
  });
});
```

- [ ] **Step 2: Implement starter deck service**

Create `server/services/starter-deck.js`:

```javascript
const STRATEGIES = {
  hsk2_consolidation: [1, 2],
  hsk1_review: [1],
};

export function createStarterDeck(db, options = {}) {
  const strategy = STRATEGIES[options.strategy] ? options.strategy : 'hsk2_consolidation';
  const limit = Math.max(1, Math.min(300, Number(options.limit || 150)));
  const levels = STRATEGIES[strategy];
  const today = new Date().toISOString().split('T')[0];

  const candidates = db.prepare(`
    SELECT id
    FROM words
    WHERE hsk_level IN (${levels.map(() => '?').join(',')})
    ORDER BY hsk_level DESC, COALESCE(frequency, 999999), id
    LIMIT ?
  `).all(...levels, limit);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO srs_cards (user_id, word_id, next_review, status)
    VALUES (1, ?, ?, 'new')
  `);

  let inserted = 0;
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const result = insert.run(item.id, today);
      inserted += result.changes;
    }
  });

  insertMany(candidates);

  const total = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;

  return {
    strategy,
    inserted,
    skipped: candidates.length - inserted,
    total_deck_size: total,
  };
}
```

- [ ] **Step 3: Add starter deck endpoint**

In `server/routes/flashcards.js`, import:

```javascript
import { createStarterDeck } from '../services/starter-deck.js';
```

Add before `router.post('/add', ...)`:

```javascript
  router.post('/starter-deck', (req, res) => {
    const result = createStarterDeck(db, req.body || {});
    res.status(result.inserted > 0 ? 201 : 200).json(result);
  });
```

- [ ] **Step 4: Add route test**

Add to `server/routes/flashcards.test.js`:

```javascript
  it('POST /api/flashcards/starter-deck creates recommended deck', async () => {
    const response = await request(app, 'POST', '/api/flashcards/starter-deck', {
      strategy: 'hsk2_consolidation',
      limit: 25,
    });

    expect(response.status).toBe(201);
    expect(response.body.inserted).toBe(25);
    expect(response.body.total_deck_size).toBe(25);
  });
```

- [ ] **Step 5: Add client API and empty-state CTA**

In `client/src/services/api.js`, add:

```javascript
  createStarterDeck: (data = {}) =>
    request('/flashcards/starter-deck', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

In `client/src/pages/Flashcards.jsx`, add:

```jsx
async function handleCreateStarterDeck() {
  setLoading(true);
  try {
    await api.createStarterDeck({ strategy: 'hsk2_consolidation', limit: 150 });
    await loadCards();
  } catch (error) {
    console.error('Failed to create starter deck:', error);
  } finally {
    setLoading(false);
  }
}
```

Replace the no-card empty state with:

```jsx
<div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center">
  <h2 className="text-xl font-semibold">Set up your HSK2 starter deck</h2>
  <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">
    Start with 150 HSK1 review and HSK2 consolidation cards. You can still add custom words later.
  </p>
  <button
    type="button"
    onClick={handleCreateStarterDeck}
    disabled={loading}
    className="mt-4 rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white disabled:opacity-50"
  >
    Create starter deck
  </button>
</div>
```

- [ ] **Step 6: Add client empty-state test**

In `client/src/pages/Flashcards.test.jsx`, add a local mock override test:

```javascript
  it('creates the starter deck from the empty state', async () => {
    api.getDueCards.mockResolvedValueOnce({ cards: [] }).mockResolvedValueOnce({
      cards: [{ id: 2, hanzi: '学习', pinyin: 'xuéxí', meaning_en: 'to study', hsk_level: 2, status: 'new' }],
    });
    api.createStarterDeck = vi.fn().mockResolvedValue({ inserted: 150, total_deck_size: 150 });

    render(<Flashcards />);

    await waitFor(() => {
      expect(screen.getByText('Set up your HSK2 starter deck')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Create starter deck'));

    await waitFor(() => {
      expect(api.createStarterDeck).toHaveBeenCalledWith({ strategy: 'hsk2_consolidation', limit: 150 });
      expect(screen.getByText('学习')).toBeDefined();
    });
  });
```

- [ ] **Step 7: Run task verification**

Run:

```bash
npx vitest run server/services/starter-deck.test.js server/routes/flashcards.test.js client/src/pages/Flashcards.test.jsx
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/services/starter-deck.js server/services/starter-deck.test.js server/routes/flashcards.js server/routes/flashcards.test.js client/src/services/api.js client/src/pages/Flashcards.jsx client/src/pages/Flashcards.test.jsx
git commit -m "feat: add HSK2 starter deck activation"
```

---

### Task 4: Word-Level Reading Lookup

**Files:**
- Create: `server/services/reading-tokenizer.js`
- Create: `server/services/reading-tokenizer.test.js`
- Create: `client/src/components/WordPopup.test.jsx`
- Modify: `server/routes/readings.js`
- Modify: `server/routes/readings.test.js`
- Modify: `client/src/components/ReadingView.jsx`
- Modify: `client/src/components/ReadingView.test.jsx`
- Modify: `client/src/components/WordPopup.jsx`

**Interfaces:**
- Produces: `tokenizeReadingContent(db, content)` returning token objects
- Reading detail includes `tokens: Array<{ id, text, type, word?: { id, hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, in_srs } }>`
- `WordPopup` consumes `token` instead of `character`

- [x] **Step 1: Write tokenizer tests**

Create `server/services/reading-tokenizer.test.js`:

```javascript
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { tokenizeReadingContent } from './reading-tokenizer.js';

describe('tokenizeReadingContent', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
  });

  it('prefers longest dictionary matches', () => {
    const tokens = tokenizeReadingContent(db, '你好，朋友。');

    expect(tokens.map((token) => token.text)).toEqual(['你好', '，', '朋友', '。']);
    expect(tokens[0].word.hanzi).toBe('你好');
    expect(tokens[2].word.hanzi).toBe('朋友');
  });

  it('falls back to unknown Chinese characters', () => {
    const tokens = tokenizeReadingContent(db, '龘。');

    expect(tokens).toEqual([
      { id: 't0', text: '龘', type: 'unknown' },
      { id: 't1', text: '。', type: 'punctuation' },
    ]);
  });

  it('marks words already in SRS', () => {
    const word = db.prepare("SELECT id FROM words WHERE hanzi = '你好' LIMIT 1").get();
    db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, '2026-07-28', 'new')").run(word.id);

    const [token] = tokenizeReadingContent(db, '你好');

    expect(token.word.in_srs).toBe(true);
  });
});
```

- [x] **Step 2: Implement tokenizer**

Create `server/services/reading-tokenizer.js`:

```javascript
const PUNCTUATION = /^[\s，。！？、；：“”"'（）\u3000,.!?;:()]+$/;

function isChineseChar(char) {
  return /[\u3400-\u9fff]/.test(char);
}

function serializeWord(row) {
  return {
    id: row.id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    meaning_en: row.meaning_en,
    meaning_es: row.meaning_es,
    hsk_level: row.hsk_level,
    pos: row.pos,
    in_srs: Boolean(row.in_srs),
  };
}

export function tokenizeReadingContent(db, content) {
  const dictionary = db.prepare(`
    SELECT w.*, EXISTS(
      SELECT 1 FROM srs_cards sc WHERE sc.user_id = 1 AND sc.word_id = w.id
    ) as in_srs
    FROM words w
    ORDER BY length(w.hanzi) DESC
  `).all();
  const byHanzi = new Map(dictionary.map((word) => [word.hanzi, word]));
  const maxLength = dictionary.reduce((max, word) => Math.max(max, [...word.hanzi].length), 1);
  const chars = [...content];
  const tokens = [];
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];

    if (PUNCTUATION.test(char)) {
      tokens.push({ id: `t${tokens.length}`, text: char, type: 'punctuation' });
      index += 1;
      continue;
    }

    let match = null;
    for (let length = Math.min(maxLength, chars.length - index); length > 0; length -= 1) {
      const candidate = chars.slice(index, index + length).join('');
      if (byHanzi.has(candidate)) {
        match = byHanzi.get(candidate);
        break;
      }
    }

    if (match) {
      tokens.push({ id: `t${tokens.length}`, text: match.hanzi, type: 'word', word: serializeWord(match) });
      index += [...match.hanzi].length;
      continue;
    }

    tokens.push({ id: `t${tokens.length}`, text: char, type: isChineseChar(char) ? 'unknown' : 'text' });
    index += 1;
  }

  return tokens;
}
```

- [x] **Step 3: Include tokens in reading detail**

In `server/routes/readings.js`, import:

```javascript
import { tokenizeReadingContent } from '../services/reading-tokenizer.js';
```

In `GET /api/readings/:id`, add:

```javascript
tokens: tokenizeReadingContent(db, reading.content),
```

In generated/cached reading responses, add tokens for the returned `content`.

- [x] **Step 4: Add route test for tokens**

Add to `server/routes/readings.test.js`:

```javascript
  it('GET /api/readings/:id returns word-level tokens', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '你好朋友', '你好，朋友。', 'Nǐ hǎo, péngyou.', '[]', 'seed')
    `).run();

    const response = await request(app, 'GET', `/api/readings/${lastInsertRowid}`);

    expect(response.status).toBe(200);
    expect(response.body.tokens.map((token) => token.text)).toEqual(['你好', '，', '朋友', '。']);
    expect(response.body.tokens[0].word.meaning_en).toContain('hello');
  });
```

- [x] **Step 5: Update ReadingView token rendering**

In `client/src/components/ReadingView.jsx`, replace character mapping with token mapping:

```jsx
const tokens = reading.tokens || [...reading.content].map((char, index) => ({
  id: `legacy-${index}`,
  text: char,
  type: /^[\s，。！？、；：“”"'（）\u3000]$/.test(char) ? 'punctuation' : 'unknown',
}));
```

Render:

```jsx
{tokens.map((token) => {
  if (token.type === 'punctuation' || token.type === 'text') {
    return <span key={token.id}>{token.text}</span>;
  }

  return (
    <span
      key={token.id}
      role="button"
      tabIndex={0}
      onClick={(event) => setPopup({ token, x: event.clientX, y: event.clientY })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          setPopup({ token, x: 0, y: 0 });
        }
      }}
      className="cursor-pointer rounded hover:bg-[var(--color-gold)]/20"
    >
      {token.text}
    </span>
  );
})}
```

- [x] **Step 6: Update WordPopup to consume token**

In `client/src/components/WordPopup.jsx`, change signature:

```jsx
export default function WordPopup({ token, position, onClose }) {
```

Use `token.word` directly:

```jsx
const word = token?.word || null;
const label = token?.text || '';
```

Render:

```jsx
<p className="text-3xl font-bold">{label}</p>
{word ? (
  <div className="mt-2 space-y-1">
    <p className="text-sm text-[var(--color-text-muted)]">{word.pinyin}</p>
    <p className="text-sm">{word.meaning_es || word.meaning_en}</p>
    <p className="text-xs text-[var(--color-text-muted)]">HSK {word.hsk_level}</p>
    <button type="button" onClick={handleAdd} disabled={adding || added || word.in_srs}>
      {word.in_srs || added ? 'Already in SRS' : '+ Add to SRS'}
    </button>
  </div>
) : (
  <p className="mt-2 text-sm text-[var(--color-text-muted)]">Not found in the local dictionary.</p>
)}
```

- [x] **Step 7: Add WordPopup component tests**

Create `client/src/components/WordPopup.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordPopup from './WordPopup';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
  },
}));

describe('WordPopup', () => {
  it('renders a known word token with dictionary detail', () => {
    render(
      <WordPopup
        token={{
          id: 't0',
          text: '你好',
          type: 'word',
          word: { id: 229, pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false },
        }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello; hi')).toBeDefined();
    expect(screen.getByText('HSK 1')).toBeDefined();
  });

  it('adds a known word to SRS', async () => {
    render(
      <WordPopup
        token={{
          id: 't0',
          text: '你好',
          type: 'word',
          word: { id: 229, pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false },
        }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('+ Add to SRS'));

    await waitFor(() => {
      expect(api.addCard).toHaveBeenCalledWith(229);
      expect(screen.getByText('Already in SRS')).toBeDefined();
    });
  });

  it('shows an honest unknown-token state', () => {
    render(
      <WordPopup
        token={{ id: 't0', text: '龘', type: 'unknown' }}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('龘')).toBeDefined();
    expect(screen.getByText('Not found in the local dictionary.')).toBeDefined();
  });
});
```

- [x] **Step 8: Update ReadingView component tests**

In `client/src/components/ReadingView.test.jsx`, include:

```javascript
tokens: [
  { id: 't0', text: '你好', type: 'word', word: { id: 229, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_en: 'hello; hi', hsk_level: 1, in_srs: false } },
  { id: 't1', text: '，', type: 'punctuation' },
  { id: 't2', text: '朋友', type: 'word', word: { id: 114, hanzi: '朋友', pinyin: 'péngyou', meaning_en: 'friend', hsk_level: 1, in_srs: true } },
  { id: 't3', text: '。', type: 'punctuation' },
],
```

Add test:

```javascript
  it('opens popup for full words instead of single characters', async () => {
  render(<ReadingView reading={reading} />);

  fireEvent.click(screen.getByRole('button', { name: '你好' }));

  expect(await screen.findByText('nǐ hǎo')).toBeDefined();
  });
```

- [x] **Step 9: Run task verification**

Run:

```bash
npx vitest run server/services/reading-tokenizer.test.js server/routes/readings.test.js client/src/components/ReadingView.test.jsx client/src/components/WordPopup.test.jsx
npm test
```

Expected: all tests pass.

- [x] **Step 10: Commit (Skipped per user instruction)**

```bash
git add server/services/reading-tokenizer.js server/services/reading-tokenizer.test.js server/routes/readings.js server/routes/readings.test.js client/src/components/ReadingView.jsx client/src/components/ReadingView.test.jsx client/src/components/WordPopup.jsx client/src/components/WordPopup.test.jsx
git commit -m "feat: add word-level reading lookup"
```

---

### Task 5: Today-First Dashboard

**Files:**
- Create: `server/routes/today.js`
- Create: `server/routes/today.test.js`
- Modify: `server/app.js`
- Modify: `client/src/services/api.js`
- Modify: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/pages/Dashboard.test.jsx`
- Modify: `client/src/components/Navbar.jsx`

**Interfaces:**
- Produces: `GET /api/today` returning `{ profile, flashcards, exercises, reading, progress }`
- Dashboard `/` becomes the Today screen with daily actions first and dashboard progress below

- [ ] **Step 1: Write Today route tests**

Create `server/routes/today.test.js`:

```javascript
import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createTodayRouter } from './today.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/today', createTodayRouter(db));
  return app;
}

async function request(app, path) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      fetch(`http://localhost:${server.address().port}${path}`)
        .then(async (response) => ({ status: response.status, body: await response.json() }))
        .then((result) => {
          server.close();
          resolve(result);
        });
    });
  });
}

describe('Today API', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  it('returns daily HSK2 learning summary', async () => {
    const response = await request(app, '/api/today');

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual({ current_level: 2, mode: 'hsk2_consolidation' });
    expect(response.body.flashcards).toHaveProperty('due');
    expect(response.body.exercises.target).toBe(5);
    expect(response.body.reading.level).toBe(2);
    expect(response.body.progress).toHaveProperty('completed_blocks');
  });
});
```

- [ ] **Step 2: Implement Today route**

Create `server/routes/today.js`:

```javascript
import { Router } from 'express';

export function createTodayRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const settings = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}');
    const currentLevel = Number(settings.current_level || 2);
    const deckSize = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const due = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?').get(today).c;
    const todayStats = db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(today) || {};
    const reading = db.prepare(`
      SELECT id, title, hsk_level, format
      FROM readings
      WHERE hsk_level = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(Math.min(2, currentLevel)) || null;

    const blocks = [
      due > 0 || todayStats.cards_reviewed > 0,
      Number(todayStats.exercises_done || 0) >= 5,
      Number(todayStats.readings_done || 0) >= 1,
    ];

    res.json({
      profile: { current_level: Math.max(2, currentLevel), mode: 'hsk2_consolidation' },
      flashcards: {
        deck_size: deckSize,
        due,
        target: Number(settings.cards_per_day || 20),
        completed: Number(todayStats.cards_reviewed || 0),
      },
      exercises: {
        target: 5,
        completed: Number(todayStats.exercises_done || 0),
      },
      reading: {
        target: 1,
        completed: Number(todayStats.readings_done || 0),
        level: 2,
        next: reading,
      },
      progress: {
        completed_blocks: blocks.filter(Boolean).length,
        total_blocks: 3,
      },
    });
  });

  return router;
}
```

In `server/app.js`, mount:

```javascript
import { createTodayRouter } from './routes/today.js';
app.use('/api/today', createTodayRouter(db));
```

- [x] **Step 3: Add client API**

In `client/src/services/api.js`, add:

```javascript
  getToday: () => request('/today'),
```

- [x] **Step 4: Update Dashboard tests**

In `client/src/pages/Dashboard.test.jsx`, mock both `api.getToday` and `api.getDashboard`:

```javascript
getToday: vi.fn().mockResolvedValue({
  profile: { current_level: 2, mode: 'hsk2_consolidation' },
  flashcards: { deck_size: 150, due: 20, target: 20, completed: 0 },
  exercises: { target: 5, completed: 2 },
  reading: { target: 1, completed: 0, level: 2, next: { id: 1, title: '我的家', hsk_level: 2, format: 'short_text' } },
  progress: { completed_blocks: 1, total_blocks: 3 },
}),
```

Add expectations:

```javascript
expect(screen.getByText('Today')).toBeDefined();
expect(screen.getByText('HSK2 consolidation')).toBeDefined();
expect(screen.getByText('Review 20 cards')).toBeDefined();
expect(screen.getByText('Practice 5 exercises')).toBeDefined();
expect(screen.getByText('Read one HSK2 passage')).toBeDefined();
```

- [x] **Step 5: Implement Today-first Dashboard UI**

In `client/src/pages/Dashboard.jsx`, load Today and existing dashboard data:

```jsx
const [today, setToday] = useState(null);

useEffect(() => {
  async function loadDashboard() {
    try {
      const [todayResponse, dashboardResponse] = await Promise.all([
        api.getToday(),
        api.getDashboard(),
      ]);
      setToday(todayResponse);
      setData(dashboardResponse);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }

  loadDashboard();
}, []);
```

Render Today before analytics:

```jsx
<section className="space-y-4">
  <div>
    <p className="text-sm uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Today</p>
    <h1 className="mt-1 text-3xl font-bold">HSK2 consolidation</h1>
  </div>
  <div className="grid gap-3 lg:grid-cols-3">
    <QuickLink to="/flashcards" title={`Review ${today.flashcards.target} cards`} description={`${today.flashcards.due} due now`} />
    <QuickLink to="/exercises" title="Practice 5 exercises" description={`${today.exercises.completed} completed today`} />
    <QuickLink to={today.reading.next ? `/readings/${today.reading.next.id}` : '/readings'} title="Read one HSK2 passage" description={today.reading.next?.title || 'Generate a short reading'} />
  </div>
</section>
```

- [x] **Step 6: Rename nav copy**

In `client/src/components/Navbar.jsx`, change the `/` link descriptor:

```javascript
{ to: '/', label: '今日', desc: 'Today', mobile: '今' },
```

- [x] **Step 7: Run task verification**

Run:

```bash
npx vitest run server/routes/today.test.js client/src/pages/Dashboard.test.jsx client/src/App.test.jsx
npm test
```

Expected: all tests pass.

- [x] **Step 8: Commit (Skipped per user instruction)**

```bash
git add server/routes/today.js server/routes/today.test.js server/app.js client/src/services/api.js client/src/pages/Dashboard.jsx client/src/pages/Dashboard.test.jsx client/src/components/Navbar.jsx
git commit -m "feat: add today-first learning loop"
```

---

### Task 6: Productization Foundations

**Files:**
- Create: `PRODUCT.md`
- Modify: `server/routes/settings.js`
- Modify: `server/routes/settings.test.js`
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/Settings.test.jsx`
- Modify: `README.md`

**Interfaces:**
- Produces: settings GET response returns `api_key_configured: boolean` and never returns the stored `api_key`
- Produces: settings PUT preserves existing key when provider is not changed and no new key is submitted
- Produces: product context file for future UX/design work

- [ ] **Step 1: Write settings redaction tests**

Add to `server/routes/settings.test.js`:

```javascript
  it('GET /api/settings redacts stored API key', async () => {
    const current = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get().settings);
    current.ai_provider = 'deepseek';
    current.api_key = 'sk-secret-value';
    db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(current));

    const response = await request(app, 'GET', '/api/settings');

    expect(response.status).toBe(200);
    expect(response.body.api_key).toBe('');
    expect(response.body.api_key_configured).toBe(true);
  });

  it('PUT /api/settings preserves existing API key when blank key is submitted', async () => {
    const current = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get().settings);
    current.ai_provider = 'deepseek';
    current.api_key = 'sk-secret-value';
    db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(current));

    const response = await request(app, 'PUT', '/api/settings', {
      ai_provider: 'deepseek',
      api_key: '',
      current_level: 2,
    });

    const saved = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get().settings);
    expect(response.status).toBe(200);
    expect(response.body.api_key).toBe('');
    expect(saved.api_key).toBe('sk-secret-value');
  });
```

- [ ] **Step 2: Implement settings redaction**

In `server/routes/settings.js`, add:

```javascript
function redactSettings(settings) {
  return {
    ...settings,
    api_key: '',
    api_key_configured: Boolean(settings.api_key),
  };
}
```

Use it in GET:

```javascript
res.json(redactSettings(JSON.parse(user.settings)));
```

Use it in PUT after merging:

```javascript
if (updated.api_key === '') {
  updated.api_key = current.api_key || '';
}

db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(updated));
res.json(redactSettings(updated));
```

- [ ] **Step 3: Update Settings UI copy**

In `client/src/pages/Settings.jsx`, under the API key input show:

```jsx
{settings.api_key_configured ? (
  <p className="text-xs text-[var(--color-text-muted)]">
    API key saved. Leave blank to keep the current key.
  </p>
) : null}
```

Keep the input controlled with `settings.api_key || ''`.

- [ ] **Step 4: Create PRODUCT.md**

Create `PRODUCT.md`:

```markdown
# Hanyu Product Context

## Register

product

## Audience

Hanyu is currently for a single self-directed Mandarin learner who has completed HSK2 and wants a reliable daily study loop. It should be built so it can later become a paid learning product for similar independent learners.

## Product Promise

Open Hanyu, do today's Chinese session, and trust that it is matched to your level.

## Current Learning Model

- HSK1 is review.
- HSK2 is consolidation and daily focus.
- HSK3 is preview material, shown lightly and clearly.

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
```

- [ ] **Step 5: Update README product note**

In `README.md`, add under "Alcance actual":

```markdown
- Daily learning loop oriented to HSK2 consolidation
- Starter deck flow for HSK1 review + HSK2 focus
- [x] **Step 1: Write settings redaction tests**
- [x] **Step 2: Implement settings redaction**
- [x] **Step 3: Update Settings UI copy**
- [x] **Step 4: Create PRODUCT.md**
- [x] **Step 5: Update README product note**
- [x] **Step 6: Run task verification**
- [x] **Step 7: Commit (Skipped per user instruction)**

---

## Final Verification

- [x] Run full test suite: `npm test`
- [x] Run production build: `npm run build`
- [x] Verified local flows without committing changes.

```bash
npm run dev
```

Expected manual checks:

- `/` shows Today first, with HSK2 consolidation actions.
- `/flashcards` on an empty deck offers starter deck creation.
- Creating starter deck adds due cards.
- Completing a flashcard review updates dashboard reviewed count.
- A reading with `correct: "B"` scores correctly when option B is selected.
- Reading text selects `你好` and `朋友` as full words.
- Reading completion increments today's reading progress.
- Settings never displays the stored API key value after reload.
