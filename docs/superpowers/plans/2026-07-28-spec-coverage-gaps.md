# Spec Coverage Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the coverage gaps between the approved spec (`docs/superpowers/specs/2026-07-28-hanyu-platform-design.md`) and the current implementation: fix the exercise answer normalization bug, add interactive reading comprehension, flashcard card modes, fallback exercise pool, dashboard stats enrichment, STT support, reading word popup, and extended flashcard settings.

**Architecture:** Incremental additions to the existing React 18 + Vite frontend and Node.js + Express + SQLite backend. Each task is independently testable. No new dependencies are introduced.

**Tech Stack:** React 18, Vite, Vitest, Zustand, Tailwind CSS, Recharts, Express, SQLite (better-sqlite3), Web Speech API

## Global Constraints

- Node.js >= 18
- Single-user mode (user id=1, no auth in V1)
- HSK levels 1-3 only
- All dates stored as ISO 8601 strings in SQLite
- Test runner: Vitest for all tests
- ESM modules throughout (`"type": "module"` in package.json)
- Accent colors: vermilion red `#E23D28`, gold `#D4A017`
- Chinese fonts: system fallback stack `'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`

---

### Task 1: Fix Exercise Answer Normalization

**Files:**
- Modify: `server/routes/exercises.js`
- Modify: `server/routes/exercises.test.js`

**Interfaces:**
- Consumes: `exercises` table (`prompt` JSON, `answer` text)
- Produces: `POST /api/exercises/:id/check` now normalizes answers for `reorder` and `matching` types by comparing against the prompt JSON instead of the flat `answer` column

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/exercises.test.js`, inside the existing `describe('Exercises API', ...)` block, after the existing tests:

```javascript
  it('POST /api/exercises/:id/check handles reorder answer as joined string', async () => {
    const prompt = {
      type: 'reorder',
      words: ['去', '我', '学校', '明天', '想'],
      correct_order: ['我', '明天', '想', '去', '学校'],
      translation: 'I want to go to school tomorrow.',
    };
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('reorder', 1, ?, '我明天想去学校', datetime('now'))
    `).run(JSON.stringify(prompt));

    const res = await req(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, {
      answer: '我明天想去学校',
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('POST /api/exercises/:id/check handles matching answer', async () => {
    const prompt = {
      type: 'matching',
      pairs: [
        { left: '学生', right: 'student' },
        { left: '老师', right: 'teacher' },
      ],
    };
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('matching', 1, ?, 'matched', datetime('now'))
    `).run(JSON.stringify(prompt));

    const res = await req(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, {
      answer: 'matched',
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('POST /api/exercises/:id/check rejects wrong reorder', async () => {
    const prompt = {
      type: 'reorder',
      words: ['去', '我', '学校'],
      correct_order: ['我', '去', '学校'],
      translation: 'I go to school.',
    };
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('reorder', 1, ?, '我去学校', datetime('now'))
    `).run(JSON.stringify(prompt));

    const res = await req(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, {
      answer: '去我学校',
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/exercises.test.js`
Expected: New reorder/matching tests fail because current check uses strict `exercise.answer === answer`.

- [ ] **Step 3: Fix the answer checking logic**

In `server/routes/exercises.js`, replace the body of `router.post('/:id/check', ...)` with logic that normalizes by type. The full replacement for the check handler:

```javascript
  router.post('/:id/check', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { answer } = req.body;

    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid exercise ID' });
      return;
    }

    if (answer === undefined) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    const prompt = JSON.parse(exercise.prompt);
    let isCorrect = false;

    switch (exercise.type) {
      case 'reorder': {
        const expected = (prompt.correct_order || []).join('');
        isCorrect = answer === expected;
        break;
      }
      case 'matching':
        isCorrect = answer === 'matched';
        break;
      case 'dictation': {
        const normalized = answer.trim().toLowerCase();
        const expected = (prompt.audio_text || exercise.answer).trim().toLowerCase();
        const acceptPinyin = (normalized === (prompt.pinyin || '').trim().toLowerCase());
        isCorrect = normalized === expected || acceptPinyin;
        break;
      }
      default:
        isCorrect = exercise.answer === answer;
        break;
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT id FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    if (existing) {
      db.prepare('UPDATE user_stats SET exercises_done = exercises_done + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO user_stats (user_id, date, exercises_done) VALUES (1, ?, 1)').run(today);
    }

    const correctAnswer = exercise.type === 'reorder'
      ? (prompt.correct_order || []).join('')
      : exercise.answer;

    res.json({ correct: isCorrect, correct_answer: correctAnswer });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/exercises.test.js`
Expected: All 7 tests PASS (4 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add server/routes/exercises.js server/routes/exercises.test.js
git commit -m "fix: normalize exercise answer checking for reorder, matching, and dictation types"
```

---

### Task 2: Interactive Reading Comprehension

**Files:**
- Modify: `client/src/components/ReadingView.jsx`
- Modify: `client/src/components/ReadingView.test.jsx`

**Interfaces:**
- Consumes: `reading` prop with `.questions` array of `{ question, options, correct }`
- Produces: interactive comprehension section with answer selection, submit button, scoring, and correct/incorrect visual feedback

- [ ] **Step 1: Write the failing tests**

Replace the contents of `client/src/components/ReadingView.test.jsx` with:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadingView from './ReadingView';

const reading = {
  id: 1,
  title: '你好',
  content: '你好，我叫小明。',
  pinyin_text: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.',
  questions: [
    { question: '他叫什么？', options: ['小明', '小红', '小李', '小王'], correct: '小明' },
    { question: '他说了什么？', options: ['你好', '再见', '谢谢', '对不起'], correct: '你好' },
  ],
};

describe('ReadingView', () => {
  it('renders title and content', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('你好，我叫小明。')).toBeDefined();
  });

  it('toggles pinyin visibility', () => {
    render(<ReadingView reading={reading} />);
    fireEvent.click(screen.getByText('Show Pinyin'));
    expect(screen.getByText('Nǐ hǎo, wǒ jiào Xiǎo Míng.')).toBeDefined();
  });

  it('renders comprehension questions with selectable options', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('他叫什么？')).toBeDefined();
    const option = screen.getAllByText('小明')[0];
    fireEvent.click(option);
    // After clicking, the option should be visually selected (button gets selected class)
    expect(option.className).toContain('border-[var(--color-vermilion)]');
  });

  it('shows score after submitting answers', () => {
    render(<ReadingView reading={reading} />);
    // Select correct answers
    fireEvent.click(screen.getAllByText('小明')[0]);
    fireEvent.click(screen.getAllByText('你好')[0]);
    fireEvent.click(screen.getByText('Submit Answers'));
    expect(screen.getByText('2 / 2')).toBeDefined();
  });

  it('highlights correct and incorrect answers after submit', () => {
    render(<ReadingView reading={reading} />);
    // Select wrong answer for first question
    fireEvent.click(screen.getByText('小红'));
    // Select correct answer for second
    fireEvent.click(screen.getAllByText('你好')[0]);
    fireEvent.click(screen.getByText('Submit Answers'));
    expect(screen.getByText('1 / 2')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/components/ReadingView.test.jsx`
Expected: FAIL — current ReadingView renders questions as static divs without click handlers or submit button.

- [ ] **Step 3: Implement interactive comprehension in ReadingView**

Replace `client/src/components/ReadingView.jsx`:

```jsx
import { useState } from 'react';
import AudioButton from './AudioButton';
import PinyinToggle from './PinyinToggle';

export default function ReadingView({ reading }) {
  const [showPinyin, setShowPinyin] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function handleSelect(questionIndex, option) {
    if (submitted) return;
    setAnswers((current) => ({ ...current, [questionIndex]: option }));
  }

  const score = submitted
    ? reading.questions.filter((q, i) => answers[i] === q.correct).length
    : null;

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{reading.title}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Read naturally first, then reveal pinyin if needed.</p>
        </div>
        <div className="flex items-center gap-3">
          <AudioButton text={reading.content} />
          <PinyinToggle show={showPinyin} onToggle={() => setShowPinyin((current) => !current)} />
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-2xl leading-relaxed">{reading.content}</p>
        {showPinyin ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{reading.pinyin_text}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold">Comprehension</h2>
        <div className="space-y-4">
          {reading.questions.map((question, qIndex) => (
            <div key={`${reading.id}-${qIndex}`} className="rounded-xl bg-[var(--color-bg)] p-4">
              <p className="mb-3 font-medium">{question.question}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {question.options.map((option) => {
                  let style = 'border border-[var(--color-border)] bg-[var(--color-surface)]';
                  if (submitted && option === question.correct) {
                    style = 'border-emerald-500 bg-emerald-50 text-emerald-900';
                  } else if (submitted && answers[qIndex] === option && option !== question.correct) {
                    style = 'border-red-500 bg-red-50 text-red-900';
                  } else if (answers[qIndex] === option) {
                    style = 'border-[var(--color-vermilion)] bg-[var(--color-bg)]';
                  }
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelect(qIndex, option)}
                      disabled={submitted}
                      className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${style}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!submitted && reading.questions.length > 0 && (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={Object.keys(answers).length < reading.questions.length}
            className="mt-4 rounded-lg bg-[var(--color-gold)] px-6 py-2 font-medium text-white disabled:opacity-50"
          >
            Submit Answers
          </button>
        )}

        {score !== null && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center">
            <p className="text-2xl font-bold">{score} / {reading.questions.length}</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {score === reading.questions.length ? 'Perfect!' : 'Review the highlighted answers above.'}
            </p>
          </div>
        )}
      </section>
    </article>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/components/ReadingView.test.jsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ReadingView.jsx client/src/components/ReadingView.test.jsx
git commit -m "feat: interactive reading comprehension with answer selection and scoring"
```

---

### Task 3: Flashcard Card Modes

**Files:**
- Modify: `client/src/components/FlashCard.jsx`
- Modify: `client/src/components/FlashCard.test.jsx`
- Modify: `client/src/pages/Flashcards.jsx`
- Modify: `client/src/pages/Flashcards.test.jsx`

**Interfaces:**
- Consumes: `card` prop (unchanged), new `mode` prop: `'recognition'` | `'recall'` | `'listening'`
- Produces: FlashCard renders different front/back content per mode; Flashcards page shows mode selector

- [ ] **Step 1: Write the failing tests for FlashCard modes**

Replace `client/src/components/FlashCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlashCard from './FlashCard';

const card = {
  id: 1,
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning_en: 'hello',
  hsk_level: 1,
};

describe('FlashCard', () => {
  it('shows hanzi on front in recognition mode (default)', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    expect(screen.getByText('你好')).toBeDefined();
  });

  it('reveals pinyin and meaning on click in recognition mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('shows meaning on front in recall mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="recall" />);
    expect(screen.getByText('hello')).toBeDefined();
    // hanzi should NOT be visible before reveal
    expect(screen.queryByText('你好')).toBeNull();
  });

  it('reveals hanzi and pinyin on click in recall mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="recall" />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
  });

  it('hides all text on front in listening mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="listening" />);
    expect(screen.queryByText('你好')).toBeNull();
    expect(screen.queryByText('hello')).toBeNull();
    expect(screen.getByText('🔊')).toBeDefined();
  });

  it('reveals hanzi, pinyin, and meaning on click in listening mode', () => {
    render(<FlashCard card={card} onRate={vi.fn()} mode="listening" />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('nǐ hǎo')).toBeDefined();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('shows rating buttons after reveal', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('Show Answer'));
    expect(screen.getByText('Again')).toBeDefined();
    expect(screen.getByText('Hard')).toBeDefined();
    expect(screen.getByText('Good')).toBeDefined();
    expect(screen.getByText('Easy')).toBeDefined();
  });

  it('calls onRate with quality value', () => {
    const onRate = vi.fn();
    render(<FlashCard card={card} onRate={onRate} />);
    fireEvent.click(screen.getByText('Show Answer'));
    fireEvent.click(screen.getByText('Good'));
    expect(onRate).toHaveBeenCalledWith(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/components/FlashCard.test.jsx`
Expected: recall and listening mode tests FAIL.

- [ ] **Step 3: Implement FlashCard modes**

Replace `client/src/components/FlashCard.jsx`:

```jsx
import { useState } from 'react';
import AudioButton from './AudioButton';

const RATINGS = [
  { label: 'Again', value: 0, color: 'bg-red-500' },
  { label: 'Hard', value: 3, color: 'bg-amber-500' },
  { label: 'Good', value: 4, color: 'bg-emerald-500' },
  { label: 'Easy', value: 5, color: 'bg-blue-500' },
];

export default function FlashCard({ card, onRate, mode = 'recognition' }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
          HSK {card.hsk_level}
        </span>
        {mode !== 'listening' && <AudioButton text={card.hanzi} />}
      </div>

      <div className="min-h-[180px] text-center">
        <CardFront card={card} mode={mode} revealed={revealed} />

        {revealed && <CardBack card={card} mode={mode} />}

        {!revealed && (
          <p className="text-sm text-[var(--color-text-muted)]">
            {mode === 'recall' && 'Think of the characters and pronunciation.'}
            {mode === 'listening' && 'Listen and identify the word.'}
            {mode === 'recognition' && 'Think of the pronunciation and meaning before revealing.'}
          </p>
        )}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-6 w-full rounded-xl bg-[var(--color-vermilion)] px-4 py-3 font-semibold text-white"
        >
          Show Answer
        </button>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {RATINGS.map((rating) => (
            <button
              key={rating.label}
              type="button"
              onClick={() => {
                onRate(rating.value);
                setRevealed(false);
              }}
              className={`${rating.color} rounded-xl px-4 py-3 font-semibold text-white`}
            >
              {rating.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardFront({ card, mode, revealed }) {
  if (revealed) return null;

  switch (mode) {
    case 'recall':
      return <p className="mb-3 text-3xl font-bold">{card.meaning_en}</p>;
    case 'listening':
      return (
        <div className="mb-3">
          <AudioButton text={card.hanzi} className="text-5xl" />
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Tap to play audio</p>
        </div>
      );
    default:
      return <p className="mb-3 text-5xl font-bold tracking-wide">{card.hanzi}</p>;
  }
}

function CardBack({ card, mode }) {
  switch (mode) {
    case 'recall':
      return (
        <div className="space-y-3">
          <p className="text-5xl font-bold tracking-wide">{card.hanzi}</p>
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
        </div>
      );
    case 'listening':
      return (
        <div className="space-y-3">
          <p className="text-5xl font-bold tracking-wide">{card.hanzi}</p>
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
          <p className="text-lg">{card.meaning_en}</p>
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <p className="text-xl text-[var(--color-text-muted)]">{card.pinyin}</p>
          <p className="text-lg">{card.meaning_en}</p>
        </div>
      );
  }
}
```

- [ ] **Step 4: Update Flashcards page with mode selector**

In `client/src/pages/Flashcards.jsx`, add a `mode` state and pass it to `FlashCard`. Add the following import-level constant and state variable. The full replacement for `client/src/pages/Flashcards.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import FlashCard from '../components/FlashCard';
import { api } from '../services/api';

const MODES = [
  { value: 'recognition', label: 'Recognition', desc: 'Hanzi → Meaning' },
  { value: 'recall', label: 'Recall', desc: 'Meaning → Hanzi' },
  { value: 'listening', label: 'Listening', desc: 'Audio → All' },
];

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [mode, setMode] = useState('recognition');
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());

  useEffect(() => {
    loadCards();
  }, []);

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

  async function handleRate(quality) {
    const card = cards[currentIndex];
    if (!card) return;

    const timeMs = Date.now() - cardStartedAt.current;

    try {
      const result = await api.reviewCard(card.id, quality, timeMs);
      setMessage(`Next review: ${result.next_review}`);
      setReviewed((count) => count + 1);

      if (currentIndex + 1 >= cards.length) {
        setSessionDone(true);
        await api.logTime(Date.now() - sessionStartedAt.current);
      } else {
        setCurrentIndex((index) => index + 1);
        cardStartedAt.current = Date.now();
      }
    } catch (error) {
      console.error('Failed to review card:', error);
    }
  }

  const currentCard = cards[currentIndex];

  if (sessionDone) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold">Session Complete!</h1>
        <p className="text-[var(--color-text-muted)]">You reviewed {reviewed} cards.</p>
        <button
          type="button"
          onClick={() => { setMessage(''); loadCards(); }}
          className="rounded-lg bg-[var(--color-vermilion)] px-4 py-2 font-medium text-white"
        >
          Review again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flashcards Session</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Review due cards with SM-2 spaced repetition.</p>
        </div>
        <div className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold">
          {Math.min(currentIndex + 1, Math.max(cards.length, 1))}/{Math.max(cards.length, 1)}
        </div>
      </div>

      {/* Mode selector */}
      <div className="mb-4 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              mode === m.value
                ? 'bg-[var(--color-vermilion)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? <p>Loading flashcards...</p> : null}
      {message ? <p className="mb-4 text-sm text-[var(--color-text-muted)]">{message}</p> : null}

      {currentCard ? (
        <FlashCard card={currentCard} onRate={handleRate} mode={mode} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-text-muted)]">
          No flashcards due right now.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update Flashcards page test**

Replace `client/src/pages/Flashcards.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Flashcards from './Flashcards';

vi.mock('../services/api', () => ({
  api: {
    getDueCards: vi.fn().mockResolvedValue({
      cards: [
        { id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1 },
      ],
      total: 1,
    }),
    reviewCard: vi.fn().mockResolvedValue({ next_review: '2026-07-29' }),
    logTime: vi.fn().mockResolvedValue({}),
  },
}));

describe('Flashcards page', () => {
  it('renders due cards and mode selector', async () => {
    render(<Flashcards />);
    await waitFor(() => {
      expect(screen.getByText('你')).toBeDefined();
    });
    expect(screen.getByText('Recognition')).toBeDefined();
    expect(screen.getByText('Recall')).toBeDefined();
    expect(screen.getByText('Listening')).toBeDefined();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run client/src/components/FlashCard.test.jsx client/src/pages/Flashcards.test.jsx`
Expected: All tests PASS (8 FlashCard + 1 Flashcards page).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/FlashCard.jsx client/src/components/FlashCard.test.jsx client/src/pages/Flashcards.jsx client/src/pages/Flashcards.test.jsx
git commit -m "feat: flashcard card modes — recognition, recall, and listening"
```

---

### Task 4: Fallback Exercise Pool Seeding

**Files:**
- Create: `server/db/seeds/exercises-pool.json`
- Modify: `server/db/seed.js`
- Modify: `server/db/seed.test.js`

**Interfaces:**
- Consumes: `seedDatabase(db)` from existing seed module
- Produces: ~10 pre-generated exercises per type per level (5 types × 3 levels = 150 exercises) so the app works without an AI API key

- [ ] **Step 1: Write the failing test**

Add to `server/db/seed.test.js`, inside the existing `describe('Database seeding', ...)` block:

```javascript
  it('seeds fallback exercise pool', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM exercises').get();
    expect(count.c).toBeGreaterThanOrEqual(30); // at least 2 per type per level
  });

  it('seeds exercises for all five types', () => {
    db = createTestDb();
    seedDatabase(db);
    const types = db.prepare('SELECT DISTINCT type FROM exercises ORDER BY type').all().map(r => r.type);
    expect(types).toContain('fill_blank');
    expect(types).toContain('multiple_choice');
    expect(types).toContain('reorder');
    expect(types).toContain('dictation');
    expect(types).toContain('matching');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/db/seed.test.js`
Expected: FAIL — no exercises seeded currently.

- [ ] **Step 3: Create the exercise pool seed file**

Create `server/db/seeds/exercises-pool.json`:

```json
[
  {
    "type": "fill_blank", "hsk_level": 1,
    "prompt": {"type":"fill_blank","sentence":"我___喝茶。","options":["喜欢","已经","可能","虽然"],"correct":"喜欢","explanation":"喜欢 (xǐhuān) means 'to like'."},
    "answer": "喜欢"
  },
  {
    "type": "fill_blank", "hsk_level": 1,
    "prompt": {"type":"fill_blank","sentence":"她是我的___。","options":["朋友","学校","中国","时候"],"correct":"朋友","explanation":"朋友 (péngyou) means 'friend'."},
    "answer": "朋友"
  },
  {
    "type": "fill_blank", "hsk_level": 2,
    "prompt": {"type":"fill_blank","sentence":"___下雨了，我们不去了。","options":["因为","所以","但是","如果"],"correct":"因为","explanation":"因为 (yīnwèi) means 'because'."},
    "answer": "因为"
  },
  {
    "type": "fill_blank", "hsk_level": 2,
    "prompt": {"type":"fill_blank","sentence":"他___到了北京。","options":["已经","可能","虽然","因为"],"correct":"已经","explanation":"已经 (yǐjīng) means 'already'."},
    "answer": "已经"
  },
  {
    "type": "fill_blank", "hsk_level": 3,
    "prompt": {"type":"fill_blank","sentence":"___天气不好，我们还是去了。","options":["尽管","所以","因为","而且"],"correct":"尽管","explanation":"尽管 (jǐnguǎn) means 'despite'."},
    "answer": "尽管"
  },
  {
    "type": "fill_blank", "hsk_level": 3,
    "prompt": {"type":"fill_blank","sentence":"他的成绩___好的。","options":["比较","已经","终于","而且"],"correct":"比较","explanation":"比较 (bǐjiào) means 'relatively'."},
    "answer": "比较"
  },
  {
    "type": "multiple_choice", "hsk_level": 1,
    "prompt": {"type":"multiple_choice","question":"What does 学生 mean?","options":["teacher","student","doctor","friend"],"correct":"student"},
    "answer": "student"
  },
  {
    "type": "multiple_choice", "hsk_level": 1,
    "prompt": {"type":"multiple_choice","question":"What does 吃 mean?","options":["to drink","to eat","to see","to go"],"correct":"to eat"},
    "answer": "to eat"
  },
  {
    "type": "multiple_choice", "hsk_level": 2,
    "prompt": {"type":"multiple_choice","question":"What does 准备 mean?","options":["to prepare","to forget","to believe","to explain"],"correct":"to prepare"},
    "answer": "to prepare"
  },
  {
    "type": "multiple_choice", "hsk_level": 2,
    "prompt": {"type":"multiple_choice","question":"What does 应该 mean?","options":["already","should","maybe","because"],"correct":"should"},
    "answer": "should"
  },
  {
    "type": "multiple_choice", "hsk_level": 3,
    "prompt": {"type":"multiple_choice","question":"What does 终于 mean?","options":["suddenly","finally","almost","perhaps"],"correct":"finally"},
    "answer": "finally"
  },
  {
    "type": "multiple_choice", "hsk_level": 3,
    "prompt": {"type":"multiple_choice","question":"What does 根据 mean?","options":["according to","regardless","despite","moreover"],"correct":"according to"},
    "answer": "according to"
  },
  {
    "type": "reorder", "hsk_level": 1,
    "prompt": {"type":"reorder","words":["喝","我","茶","喜欢"],"correct_order":["我","喜欢","喝","茶"],"translation":"I like to drink tea."},
    "answer": "我喜欢喝茶"
  },
  {
    "type": "reorder", "hsk_level": 1,
    "prompt": {"type":"reorder","words":["去","他","学校"],"correct_order":["他","去","学校"],"translation":"He goes to school."},
    "answer": "他去学校"
  },
  {
    "type": "reorder", "hsk_level": 2,
    "prompt": {"type":"reorder","words":["很","今天","好","天气"],"correct_order":["今天","天气","很","好"],"translation":"The weather is very good today."},
    "answer": "今天天气很好"
  },
  {
    "type": "reorder", "hsk_level": 2,
    "prompt": {"type":"reorder","words":["买","她","了","书","一本"],"correct_order":["她","买","了","一本","书"],"translation":"She bought a book."},
    "answer": "她买了一本书"
  },
  {
    "type": "reorder", "hsk_level": 3,
    "prompt": {"type":"reorder","words":["把","请","关上","门"],"correct_order":["请","把","门","关上"],"translation":"Please close the door."},
    "answer": "请把门关上"
  },
  {
    "type": "reorder", "hsk_level": 3,
    "prompt": {"type":"reorder","words":["做完","他","作业","把","了"],"correct_order":["他","把","作业","做完","了"],"translation":"He finished his homework."},
    "answer": "他把作业做完了"
  },
  {
    "type": "dictation", "hsk_level": 1,
    "prompt": {"type":"dictation","audio_text":"你好","pinyin":"nǐ hǎo","accept_pinyin":true},
    "answer": "你好"
  },
  {
    "type": "dictation", "hsk_level": 1,
    "prompt": {"type":"dictation","audio_text":"谢谢","pinyin":"xiè xie","accept_pinyin":true},
    "answer": "谢谢"
  },
  {
    "type": "dictation", "hsk_level": 2,
    "prompt": {"type":"dictation","audio_text":"今天天气很好","pinyin":"jīntiān tiānqì hěn hǎo","accept_pinyin":true},
    "answer": "今天天气很好"
  },
  {
    "type": "dictation", "hsk_level": 2,
    "prompt": {"type":"dictation","audio_text":"我想去中国","pinyin":"wǒ xiǎng qù zhōngguó","accept_pinyin":true},
    "answer": "我想去中国"
  },
  {
    "type": "dictation", "hsk_level": 3,
    "prompt": {"type":"dictation","audio_text":"请把门关上","pinyin":"qǐng bǎ mén guān shàng","accept_pinyin":true},
    "answer": "请把门关上"
  },
  {
    "type": "dictation", "hsk_level": 3,
    "prompt": {"type":"dictation","audio_text":"他终于到了","pinyin":"tā zhōngyú dào le","accept_pinyin":true},
    "answer": "他终于到了"
  },
  {
    "type": "matching", "hsk_level": 1,
    "prompt": {"type":"matching","pairs":[{"left":"学生","right":"student"},{"left":"老师","right":"teacher"},{"left":"朋友","right":"friend"},{"left":"医生","right":"doctor"}]},
    "answer": "matched"
  },
  {
    "type": "matching", "hsk_level": 1,
    "prompt": {"type":"matching","pairs":[{"left":"大","right":"big"},{"left":"小","right":"small"},{"left":"好","right":"good"},{"left":"多","right":"many"}]},
    "answer": "matched"
  },
  {
    "type": "matching", "hsk_level": 2,
    "prompt": {"type":"matching","pairs":[{"left":"因为","right":"because"},{"left":"所以","right":"therefore"},{"left":"但是","right":"but"},{"left":"如果","right":"if"}]},
    "answer": "matched"
  },
  {
    "type": "matching", "hsk_level": 2,
    "prompt": {"type":"matching","pairs":[{"left":"已经","right":"already"},{"left":"可能","right":"maybe"},{"left":"应该","right":"should"},{"left":"准备","right":"to prepare"}]},
    "answer": "matched"
  },
  {
    "type": "matching", "hsk_level": 3,
    "prompt": {"type":"matching","pairs":[{"left":"关系","right":"relationship"},{"left":"终于","right":"finally"},{"left":"根据","right":"according to"},{"left":"甚至","right":"even"}]},
    "answer": "matched"
  },
  {
    "type": "matching", "hsk_level": 3,
    "prompt": {"type":"matching","pairs":[{"left":"无论","right":"regardless"},{"left":"尽管","right":"despite"},{"left":"不过","right":"however"},{"left":"而且","right":"moreover"}]},
    "answer": "matched"
  }
]
```

- [ ] **Step 4: Update seed.js to seed exercises**

In `server/db/seed.js`, add exercise seeding at the end of the `seedDatabase` function, after the grammar seeding block:

```javascript
  // Seed fallback exercise pool
  const insertExercise = db.prepare(`
    INSERT OR IGNORE INTO exercises (type, hsk_level, prompt, answer, source_model)
    VALUES (@type, @hsk_level, @prompt, @answer, 'seed')
  `);

  const exercisesPath = join(seedDir, 'exercises-pool.json');
  const exercises = JSON.parse(readFileSync(exercisesPath, 'utf-8'));
  const insertExerciseMany = db.transaction((items) => {
    for (const ex of items) {
      insertExercise.run({
        type: ex.type,
        hsk_level: ex.hsk_level,
        prompt: JSON.stringify(ex.prompt),
        answer: ex.answer,
      });
    }
  });
  insertExerciseMany(exercises);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/db/seed.test.js`
Expected: All 8 tests PASS (6 existing + 2 new).

- [ ] **Step 6: Re-seed the database**

Run: `npm run migrate && npm run seed`
Expected: "Migrations complete." then "Seeding complete." with no errors.

- [ ] **Step 7: Commit**

```bash
git add server/db/seeds/exercises-pool.json server/db/seed.js server/db/seed.test.js
git commit -m "feat: seed fallback exercise pool — 30 pre-generated exercises across all types and levels"
```

---

### Task 5: Dashboard Stats Enrichment

**Files:**
- Modify: `server/routes/stats.js`
- Modify: `server/routes/stats.test.js`
- Modify: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `user_stats`, `exercises`, `review_log`, `srs_cards` tables
- Produces: `GET /api/stats/dashboard` now returns additional fields: `learning_curve` (array of `{ date, mastered }`), `exercise_stats` (`{ by_type, accuracy }`), `reading_stats` (`{ total, avg_score }`), `time` (`{ today_ms, week_ms, all_time_ms }`)

- [ ] **Step 1: Write the failing backend tests**

Add to `server/routes/stats.test.js`, inside the existing `describe('Stats API', ...)` block:

```javascript
  it('GET /api/stats/dashboard includes learning curve', async () => {
    const res = await req(app, 'GET', '/api/stats/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('learning_curve');
    expect(res.body.learning_curve).toBeInstanceOf(Array);
  });

  it('GET /api/stats/dashboard includes exercise stats', async () => {
    const res = await req(app, 'GET', '/api/stats/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('exercise_stats');
    expect(res.body.exercise_stats).toHaveProperty('by_type');
  });

  it('GET /api/stats/dashboard includes time periods', async () => {
    const res = await req(app, 'GET', '/api/stats/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('time');
    expect(res.body.time).toHaveProperty('today_ms');
    expect(res.body.time).toHaveProperty('week_ms');
    expect(res.body.time).toHaveProperty('all_time_ms');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/stats.test.js`
Expected: 3 new tests FAIL — dashboard response lacks `learning_curve`, `exercise_stats`, `time`.

- [ ] **Step 3: Enrich the dashboard endpoint**

In `server/routes/stats.js`, inside the `router.get('/dashboard', ...)` handler, add the following queries before the `res.json(...)` call, and include the new fields in the response:

Replace the entire `router.get('/dashboard', ...)` handler:

```javascript
  router.get('/dashboard', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const dueCards = db
      .prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?')
      .get(today).c;
    const byStatus = db
      .prepare('SELECT status, COUNT(*) as count FROM srs_cards WHERE user_id = 1 GROUP BY status')
      .all();
    const todayStats =
      db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(today) ||
      {
        cards_reviewed: 0,
        cards_new: 0,
        exercises_done: 0,
        readings_done: 0,
        time_spent_ms: 0,
        streak_days: 0,
      };

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const heatmap = db
      .prepare(`
        SELECT date, cards_reviewed + exercises_done + readings_done as activity
        FROM user_stats
        WHERE user_id = 1 AND date >= ?
        ORDER BY date
      `)
      .all(since.toISOString().split('T')[0]);

    // Learning curve: cumulative mastered cards over time
    const learningCurve = db
      .prepare(`
        SELECT rl.reviewed_at as date,
          (SELECT COUNT(*) FROM srs_cards WHERE user_id = 1 AND status = 'mastered' AND last_review <= rl.reviewed_at) as mastered
        FROM review_log rl
        JOIN srs_cards sc ON rl.card_id = sc.id
        WHERE sc.user_id = 1
        GROUP BY substr(rl.reviewed_at, 1, 10)
        ORDER BY date
      `)
      .all()
      .map((row) => ({ date: row.date.slice(0, 10), mastered: row.mastered }));

    // Exercise stats: count by type
    const exerciseByType = db
      .prepare('SELECT type, COUNT(*) as count FROM exercises GROUP BY type')
      .all();

    // Time periods
    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const weekMs = db
      .prepare('SELECT COALESCE(SUM(time_spent_ms), 0) as total FROM user_stats WHERE user_id = 1 AND date >= ?')
      .get(weekAgo.toISOString().split('T')[0]).total;
    const allTimeMs = db
      .prepare('SELECT COALESCE(SUM(time_spent_ms), 0) as total FROM user_stats WHERE user_id = 1')
      .get().total;

    // Reading stats
    const readingTotal = db.prepare('SELECT COUNT(*) as c FROM readings').get().c;

    res.json({
      cards: {
        total: totalCards,
        due: dueCards,
        by_status: Object.fromEntries(byStatus.map((row) => [row.status, row.count])),
      },
      today: todayStats,
      heatmap,
      streak: calculateStreak(db),
      learning_curve: learningCurve,
      exercise_stats: {
        by_type: Object.fromEntries(exerciseByType.map((row) => [row.type, row.count])),
      },
      reading_stats: {
        total: readingTotal,
      },
      time: {
        today_ms: todayStats.time_spent_ms || 0,
        week_ms: weekMs,
        all_time_ms: allTimeMs,
      },
    });
  });
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `npx vitest run server/routes/stats.test.js`
Expected: All 6 tests PASS (3 existing + 3 new).

- [ ] **Step 5: Update Dashboard test mock**

Replace `client/src/pages/Dashboard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({
  api: {
    getDashboard: vi.fn().mockResolvedValue({
      streak: { current: 5, longest: 12 },
      cards: { total: 100, due: 15, by_status: { new: 20, learning: 30, review: 40, mastered: 10 } },
      today: { cards_reviewed: 10, cards_new: 3, exercises_done: 2, readings_done: 1, time_spent_ms: 1800000 },
      heatmap: [{ date: '2026-07-28', activity: 3 }],
      learning_curve: [{ date: '2026-07-25', mastered: 5 }],
      exercise_stats: { by_type: { fill_blank: 10, multiple_choice: 8 } },
      reading_stats: { total: 4 },
      time: { today_ms: 1800000, week_ms: 7200000, all_time_ms: 36000000 },
    }),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}));

describe('Dashboard', () => {
  it('renders streak info', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/5 day streak/)).toBeDefined();
    });
  });

  it('renders cards overview', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined(); // due cards
    });
  });

  it('renders time studied section', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/120 min/)).toBeDefined(); // week total: 7200000ms = 120min
    });
  });
});
```

- [ ] **Step 6: Update Dashboard component with new stats sections**

Replace `client/src/pages/Dashboard.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../services/api';

const STATUS_COLORS = {
  new: '#E23D28',
  learning: '#D4A017',
  review: '#2563eb',
  mastered: '#16a34a',
};

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await api.getDashboard();
        setData(response);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      }
    }

    loadDashboard();
  }, []);

  if (!data) {
    return <p>Loading dashboard...</p>;
  }

  const chartData = Object.entries(data.cards.by_status || {}).map(([name, value]) => ({ name, value }));
  const weekMin = Math.round((data.time?.week_ms || 0) / 60000);
  const allTimeMin = Math.round((data.time?.all_time_ms || 0) / 60000);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,_rgba(226,61,40,0.96),_rgba(212,160,23,0.84))] p-8 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-white/75">Today</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold">{data.streak.current} day streak</h1>
            <p className="mt-2 max-w-2xl text-white/85">Keep the chain alive with a short flashcard review, an exercise set, or one graded reading.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Cards due" value={data.cards.due} />
            <MiniStat label="Reviewed today" value={data.today.cards_reviewed || 0} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Deck size" value={data.cards.total} subtitle="Tracked flashcards" />
        <StatCard label="Exercises" value={data.today.exercises_done || 0} subtitle="Completed today" />
        <StatCard label="Readings" value={data.reading_stats?.total || 0} subtitle={`${data.today.readings_done || 0} today`} />
        <StatCard label="Study time" value={`${Math.round((data.time?.today_ms || 0) / 60000)} min`} subtitle={`${weekMin} min this week · ${allTimeMin} min total`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">SRS distribution</h2>
            <span className="text-sm text-[var(--color-text-muted)]">Current queue</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Quick actions</h2>
          <div className="space-y-3">
            <QuickLink to="/flashcards" title="Review flashcards" description="Start the due deck" />
            <QuickLink to="/exercises" title="Practice exercises" description="Generate a new drill" />
            <QuickLink to="/readings" title="Open readings" description="Browse graded passages" />
          </div>
        </div>
      </section>

      {/* Learning curve */}
      {data.learning_curve && data.learning_curve.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Learning curve</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.learning_curve}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="mastered" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Exercise stats */}
      {data.exercise_stats && Object.keys(data.exercise_stats.by_type || {}).length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold">Exercise breakdown</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data.exercise_stats.by_type).map(([type, count]) => (
              <div key={type} className="rounded-xl bg-[var(--color-bg)] p-4 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{type.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <span className="text-sm text-[var(--color-text-muted)]">Last 90 days</span>
        </div>
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-9 lg:grid-cols-12">
          {(data.heatmap || []).map((day) => (
            <div key={day.date} className="rounded-lg bg-[var(--color-bg)] p-2 text-center">
              <div className="text-xs text-[var(--color-text-muted)]">{day.date.slice(5)}</div>
              <div className="mt-2 rounded-md bg-[var(--color-vermilion)]/15 py-2 text-sm font-semibold text-[var(--color-vermilion)]">
                {day.activity}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.12em] text-white/70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function QuickLink({ to, title, description }) {
  return (
    <Link to={to} className="block rounded-xl bg-[var(--color-bg)] p-4 transition-transform hover:-translate-y-0.5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
    </Link>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/routes/stats.test.js client/src/pages/Dashboard.test.jsx`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/stats.js server/routes/stats.test.js client/src/pages/Dashboard.jsx client/src/pages/Dashboard.test.jsx
git commit -m "feat: dashboard stats enrichment — learning curve, exercise breakdown, time periods"
```

---

### Task 6: Speech-to-Text Support

**Files:**
- Modify: `client/src/hooks/useSpeech.js`

**Interfaces:**
- Consumes: Web Speech API `SpeechRecognition`
- Produces: `useSpeech()` now returns `{ speak, stop, supported, listen, listening, transcript, sttSupported }` — `listen()` starts recognition, `transcript` holds the result

- [ ] **Step 1: Implement STT in useSpeech**

Replace `client/src/hooks/useSpeech.js`:

```javascript
import { useCallback, useRef, useState } from 'react';

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  const ttsSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const sttSupported = Boolean(SpeechRecognition);

  const speak = useCallback(
    (text, rate = 0.8) => {
      if (!ttsSupported || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    },
    [ttsSupported]
  );

  const stop = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
  }, [ttsSupported]);

  const listen = useCallback(() => {
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript || '';
      setTranscript(result);
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setTranscript('');
    setListening(true);
    recognition.start();
  }, [SpeechRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  return {
    speak,
    stop,
    supported: ttsSupported,
    listen,
    stopListening,
    listening,
    transcript,
    sttSupported,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useSpeech.js
git commit -m "feat: add speech-to-text support to useSpeech hook"
```

---

### Task 7: Reading Word Popup

**Files:**
- Create: `client/src/components/WordPopup.jsx`
- Modify: `client/src/components/ReadingView.jsx`
- Modify: `client/src/components/ReadingView.test.jsx`

**Interfaces:**
- Consumes: `api.getWords({ search })` to look up character meaning, `api.addCard(wordId)` to add to SRS
- Produces: `WordPopup` component shown on character tap; `ReadingView` renders content as clickable characters

- [ ] **Step 1: Create WordPopup component**

Create `client/src/components/WordPopup.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function WordPopup({ character, position, onClose }) {
  const [word, setWord] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!character) return;
    api.getWords({ search: character, limit: 1 })
      .then((data) => {
        if (data.words.length > 0) setWord(data.words[0]);
      })
      .catch(() => {});
  }, [character]);

  if (!character) return null;

  async function handleAdd() {
    if (!word) return;
    setAdding(true);
    try {
      await api.addCard(word.id);
      setAdded(true);
    } catch {
      // 409 = already added, treat as success
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="absolute z-50 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
      style={{ top: position.y + 30, left: position.x }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-1 text-sm text-[var(--color-text-muted)]"
      >
        ✕
      </button>
      <p className="text-3xl font-bold">{character}</p>
      {word ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-[var(--color-text-muted)]">{word.pinyin}</p>
          <p className="text-sm">{word.meaning_en}</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || added}
            className="mt-2 rounded-lg bg-[var(--color-gold)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {added ? 'Added ✓' : '+ Add to SRS'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Not found in dictionary.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update ReadingView to render clickable characters**

In `client/src/components/ReadingView.jsx`, add the character tap functionality. Replace the content `<section>` (the one that renders `reading.content`) with an interactive version.

Add at the top of `ReadingView.jsx`, alongside existing imports:

```jsx
import WordPopup from './WordPopup';
```

Add state inside the `ReadingView` function, after existing state:

```javascript
  const [popup, setPopup] = useState(null);
```

Replace the content section (the `<section>` containing `reading.content`) with:

```jsx
      <section className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-2xl leading-relaxed">
          {[...reading.content].map((char, i) => {
            if (/\s|[，。！？、；：""''（）\u3000]/.test(char)) {
              return <span key={i}>{char}</span>;
            }
            return (
              <span
                key={i}
                role="button"
                tabIndex={0}
                onClick={(e) => setPopup({ char, x: e.clientX, y: e.clientY })}
                onKeyDown={(e) => { if (e.key === 'Enter') setPopup({ char, x: 0, y: 0 }); }}
                className="cursor-pointer hover:bg-[var(--color-gold)]/20 hover:rounded"
              >
                {char}
              </span>
            );
          })}
        </p>
        {showPinyin ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{reading.pinyin_text}</p>
        ) : null}
        {popup && (
          <WordPopup
            character={popup.char}
            position={{ x: popup.x, y: popup.y }}
            onClose={() => setPopup(null)}
          />
        )}
      </section>
```

- [ ] **Step 3: Add test for character tap**

Add to `client/src/components/ReadingView.test.jsx`, inside the existing `describe` block:

```jsx
  it('shows word popup on character click', async () => {
    const { default: apiMod } = await import('../services/api');
    vi.spyOn(apiMod.api, 'getWords').mockResolvedValue({
      words: [{ id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1 }],
    });

    render(<ReadingView reading={reading} />);
    // Click the first Chinese character in content
    const chars = screen.getAllByRole('button');
    fireEvent.click(chars[0]);
    // Popup should appear
    await waitFor(() => {
      expect(screen.getByText('nǐ')).toBeDefined();
    });
  });
```

Add `waitFor` to the imports at the top:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/components/ReadingView.test.jsx`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/WordPopup.jsx client/src/components/ReadingView.jsx client/src/components/ReadingView.test.jsx
git commit -m "feat: reading word popup — tap any character to see pinyin, meaning, and add to SRS"
```

---

### Task 8: Extended Flashcard Settings

**Files:**
- Modify: `server/routes/flashcards.js`
- Modify: `server/routes/flashcards.test.js`
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: user settings JSON (new fields: `max_reviews_per_session`, `card_order`)
- Produces: `GET /api/flashcards/due` respects `max_reviews_per_session` from settings and `card_order` (`frequency` or `hsk_order`); Settings page shows the new fields

- [ ] **Step 1: Write the failing test for flashcards/due respecting settings**

Add to `server/routes/flashcards.test.js`, inside the existing `describe` block:

```javascript
  it('GET /api/flashcards/due respects max_reviews_per_session from settings', async () => {
    // Set max to 1
    const settings = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get().settings);
    settings.max_reviews_per_session = 1;
    db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(settings));

    // Add 3 due cards
    const words = db.prepare('SELECT id FROM words LIMIT 3').all();
    const today = new Date().toISOString().split('T')[0];
    for (const w of words) {
      db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')").run(w.id, today);
    }

    const res = await req(app, 'GET', '/api/flashcards/due');
    expect(res.status).toBe(200);
    expect(res.body.cards.length).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/flashcards.test.js`
Expected: New test FAIL — current implementation uses hardcoded limit.

- [ ] **Step 3: Update flashcards/due to read settings**

In `server/routes/flashcards.js`, update the `router.get('/due', ...)` handler to read settings:

```javascript
  router.get('/due', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const settings = JSON.parse(
      db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}'
    );
    const maxFromSettings = settings.max_reviews_per_session || 100;
    const limit = Math.min(maxFromSettings, parseInt(req.query.limit, 10) || maxFromSettings);
    const orderClause = settings.card_order === 'frequency'
      ? 'ORDER BY w.frequency ASC, sc.next_review ASC'
      : "ORDER BY sc.next_review ASC, sc.status = 'new' DESC";

    const cards = db
      .prepare(`
        SELECT sc.*, w.hanzi, w.pinyin, w.meaning_en, w.meaning_es, w.hsk_level, w.pos, w.frequency
        FROM srs_cards sc
        JOIN words w ON sc.word_id = w.id
        WHERE sc.user_id = 1 AND sc.next_review <= ?
        ${orderClause}
        LIMIT ?
      `)
      .all(today, limit);

    res.json({ cards, total: cards.length });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/flashcards.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 5: Update Settings page with new fields**

In `client/src/pages/Settings.jsx`, add `max_reviews_per_session` and `card_order` fields. Add these two `<Field>` blocks inside the first `<section>` (the left column), after the "Cards per day" field:

```jsx
          <Field label="Max reviews per session">
            <input
              aria-label="Max reviews per session"
              type="number"
              min="10"
              max="500"
              value={settings.max_reviews_per_session || 100}
              onChange={(event) => setSettings((current) => ({ ...current, max_reviews_per_session: Number(event.target.value) }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            />
          </Field>

          <Field label="Card order">
            <select
              aria-label="Card order"
              value={settings.card_order || 'hsk_order'}
              onChange={(event) => setSettings((current) => ({ ...current, card_order: event.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              <option value="hsk_order">HSK order (default)</option>
              <option value="frequency">Frequency order</option>
            </select>
          </Field>
```

- [ ] **Step 6: Update Settings test**

In `client/src/pages/Settings.test.jsx`, update the mock to include new fields and add a check:

Replace the mock's `getSettings` return value:

```javascript
    getSettings: vi.fn().mockResolvedValue({
      theme: 'light', current_level: 1, cards_per_day: 20,
      max_reviews_per_session: 100, card_order: 'hsk_order',
      ai_provider: 'none', api_key: '',
    }),
```

Add a new test:

```javascript
  it('renders extended flashcard settings', async () => {
    render(<BrowserRouter><Settings /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByLabelText('Max reviews per session')).toBeDefined();
      expect(screen.getByLabelText('Card order')).toBeDefined();
    });
  });
```

Add `waitFor` to the imports if not already present.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/routes/flashcards.test.js client/src/pages/Settings.test.jsx`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/flashcards.js server/routes/flashcards.test.js client/src/pages/Settings.jsx client/src/pages/Settings.test.jsx
git commit -m "feat: extended flashcard settings — max reviews per session and card order"
```

---

### Task 9: Settings Save Feedback and Conditional API Key

**Files:**
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: `api.updateSettings()`
- Produces: success/error toast after save; API key field shown only when `ai_provider !== 'none'`

- [ ] **Step 1: Write the failing test**

Add to `client/src/pages/Settings.test.jsx`:

```jsx
  it('shows success message after save', async () => {
    render(<BrowserRouter><Settings /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Save settings')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Save settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved!')).toBeDefined();
    });
  });

  it('hides API key when provider is none', async () => {
    render(<BrowserRouter><Settings /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.queryByLabelText('API key')).toBeNull();
    });
  });
```

Add `fireEvent` to the imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/pages/Settings.test.jsx`
Expected: Both new tests FAIL — no success message exists, API key is always visible.

- [ ] **Step 3: Add feedback message and conditional API key**

In `client/src/pages/Settings.jsx`, add a `message` state variable:

```javascript
  const [message, setMessage] = useState('');
```

In the `handleSubmit` function, after `setSettings(updated)` add:

```javascript
      setMessage('Settings saved!');
      setTimeout(() => setMessage(''), 3000);
```

In the catch block add:

```javascript
      setMessage('Error: Failed to save settings.');
```

After the save button, add the message display:

```jsx
          {message && (
            <p className={`text-center text-sm ${message.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
              {message}
            </p>
          )}
```

For the API key field, wrap it in a conditional:

```jsx
          {settings.ai_provider !== 'none' && (
            <Field label="API key">
              <input
                aria-label="API key"
                type="password"
                value={settings.api_key}
                onChange={(event) => setSettings((current) => ({ ...current, api_key: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              />
            </Field>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/pages/Settings.test.jsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Settings.jsx client/src/pages/Settings.test.jsx
git commit -m "feat: settings save feedback message and conditional API key visibility"
```

---

### Task 10: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All test files pass. No regressions.

- [ ] **Step 2: Re-seed the database with new exercise pool**

Run: `npm run migrate && npm run seed`
Expected: Completes without errors. Exercise pool is populated.

- [ ] **Step 3: Verify the fixes work end-to-end**

Run: `npm run dev`

Verify:
- Exercises page works for all 5 types without an AI key (uses seeded pool)
- Readings show interactive comprehension with answer selection and scoring
- Flashcards page shows mode selector (Recognition/Recall/Listening)
- Dashboard shows learning curve, exercise breakdown, and time periods
- Settings shows success message on save, hides API key when provider is "none"
- Settings shows max reviews and card order fields

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: spec coverage gaps — all systems verified"
```
