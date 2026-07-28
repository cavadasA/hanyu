# Hanyu Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive Mandarin Chinese learning platform with SRS flashcards, AI-generated exercises, graded readings, grammar reference, and progress tracking.

**Architecture:** Full-stack web app with a React 18 + Vite frontend and Node.js + Express backend, using SQLite for persistence. AI exercise generation via configurable providers (DeepSeek / Gemini) with a strategy pattern. SRS uses the SM-2 algorithm. Audio via Web Speech API.

**Tech Stack:** React 18, Vite, React Router v6, Zustand, Tailwind CSS, Recharts, Node.js, Express, SQLite (better-sqlite3), Vitest

## Global Constraints

- Node.js >= 18
- Single-user mode (user id=1, no auth in V1)
- HSK levels 1-3 only
- All dates stored as ISO 8601 strings in SQLite
- API key stored in plaintext in SQLite V1 (encrypted in V2)
- Chinese fonts: system fallback stack `'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
- Accent colors: vermilion red `#E23D28`, gold `#D4A017`
- Test runner: Vitest for all tests (unit, integration, component)
- ESM modules throughout (`"type": "module"` in package.json)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `client/index.html`
- Create: `client/vite.config.js`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/tailwind.config.js`
- Create: `client/postcss.config.js`
- Create: `client/src/styles/theme.css`
- Create: `server/app.js`
- Create: `vitest.config.js`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: runnable dev environment (`npm run dev` starts both client and server), Vite dev server on port 5173, Express on port 3001

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "hanyu",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:client": "cd client && npx vite",
    "dev:server": "cd server && node --watch app.js",
    "build": "cd client && npx vite build",
    "migrate": "node server/db/migrate.js",
    "seed": "node server/db/seed.js",
    "import-hsk": "node scripts/import-hsk-data.js",
    "start": "node server/app.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.12",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.28.0",
    "recharts": "^2.13.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "zustand": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
*.db
.env
```

- [ ] **Step 3: Create client/vite.config.js**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Create client/postcss.config.js**

```javascript
export default {
  plugins: {},
};
```

- [ ] **Step 5: Create client/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vermilion: '#E23D28',
        gold: '#D4A017',
      },
      fontFamily: {
        chinese: ["'PingFang SC'", "'Microsoft YaHei'", "'Noto Sans SC'", 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create client/src/styles/theme.css**

```css
@import "tailwindcss";

:root {
  --color-bg: #ffffff;
  --color-surface: #f9fafb;
  --color-text: #111827;
  --color-text-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-vermilion: #E23D28;
  --color-gold: #D4A017;
}

.dark {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-border: #334155;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif;
}
```

- [ ] **Step 7: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hanyu — Chinese Learning</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create client/src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create client/src/App.jsx**

```jsx
export default function App() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <h1 className="text-3xl font-bold text-center py-8">汉语 Hanyu</h1>
      <p className="text-center text-[var(--color-text-muted)]">Platform loading...</p>
    </div>
  );
}
```

- [ ] **Step 10: Create server/app.js**

```javascript
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Hanyu server running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 11: Create vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['**/*.test.{js,jsx}'],
  },
});
```

- [ ] **Step 12: Install dependencies and verify**

Run: `npm install`
Expected: Clean install with no errors.

Run: `node server/app.js &` then `curl http://localhost:3001/api/health`
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Vite + Express + Tailwind"
```

---

### Task 2: Database Schema and Migrations

**Files:**
- Create: `server/db/index.js`
- Create: `server/db/migrations/001-initial-schema.sql`
- Create: `server/db/migrate.js`
- Test: `server/db/index.test.js`

**Interfaces:**
- Consumes: `better-sqlite3` package
- Produces: `getDb()` function returning a configured SQLite instance; tables: `users`, `words`, `grammar_points`, `srs_cards`, `review_log`, `exercises`, `readings`, `user_stats`

- [ ] **Step 1: Write the test for database connection**

Create `server/db/index.test.js`:

```javascript
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'migrations', '001-initial-schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

describe('Database schema', () => {
  let db;

  afterEach(() => {
    if (db) db.close();
  });

  it('creates all tables', () => {
    db = createTestDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('users');
    expect(tables).toContain('words');
    expect(tables).toContain('grammar_points');
    expect(tables).toContain('srs_cards');
    expect(tables).toContain('review_log');
    expect(tables).toContain('exercises');
    expect(tables).toContain('readings');
    expect(tables).toContain('user_stats');
  });

  it('enforces unique user_stats per user per date', () => {
    db = createTestDb();
    db.prepare("INSERT INTO users (username, created_at, settings) VALUES ('test', '2026-01-01', '{}')").run();
    db.prepare("INSERT INTO user_stats (user_id, date, cards_reviewed) VALUES (1, '2026-01-01', 5)").run();
    expect(() => {
      db.prepare("INSERT INTO user_stats (user_id, date, cards_reviewed) VALUES (1, '2026-01-01', 10)").run();
    }).toThrow();
  });

  it('enforces foreign key on srs_cards.word_id', () => {
    db = createTestDb();
    db.prepare("INSERT INTO users (username, created_at, settings) VALUES ('test', '2026-01-01', '{}')").run();
    expect(() => {
      db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review) VALUES (1, 9999, '2026-01-01')").run();
    }).toThrow();
  });

  it('seeds default user on migration', () => {
    db = createTestDb();
    const user = db.prepare("SELECT * FROM users WHERE id = 1").get();
    expect(user).toBeDefined();
    expect(user.username).toBe('default');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/db/index.test.js`
Expected: FAIL — migration file not found.

- [ ] **Step 3: Create the migration SQL**

Create `server/db/migrations/001-initial-schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  meaning_en TEXT NOT NULL,
  meaning_es TEXT,
  hsk_level INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 6),
  pos TEXT,
  frequency INTEGER
);

CREATE INDEX IF NOT EXISTS idx_words_hsk_level ON words(hsk_level);
CREATE INDEX IF NOT EXISTS idx_words_hanzi ON words(hanzi);

CREATE TABLE IF NOT EXISTS grammar_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hsk_level INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 6),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  examples TEXT NOT NULL DEFAULT '[]',
  order_idx INTEGER
);

CREATE INDEX IF NOT EXISTS idx_grammar_hsk_level ON grammar_points(hsk_level);

CREATE TABLE IF NOT EXISTS srs_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  word_id INTEGER NOT NULL,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review TEXT NOT NULL,
  last_review TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (word_id) REFERENCES words(id)
);

CREATE INDEX IF NOT EXISTS idx_srs_cards_next_review ON srs_cards(next_review);
CREATE INDEX IF NOT EXISTS idx_srs_cards_user_id ON srs_cards(user_id);

CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  time_ms INTEGER,
  FOREIGN KEY (card_id) REFERENCES srs_cards(id)
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching')),
  hsk_level INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 6),
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_exercises_type_level ON exercises(type, hsk_level);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hsk_level INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 6),
  format TEXT NOT NULL CHECK (format IN ('short_text', 'story', 'dialogue')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinyin_text TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_readings_level ON readings(hsk_level);

CREATE TABLE IF NOT EXISTS user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  cards_new INTEGER NOT NULL DEFAULT 0,
  exercises_done INTEGER NOT NULL DEFAULT 0,
  readings_done INTEGER NOT NULL DEFAULT 0,
  time_spent_ms INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Seed default user for V1
INSERT OR IGNORE INTO users (id, username, created_at, settings)
VALUES (1, 'default', datetime('now'), json('{"theme":"light","current_level":1,"cards_per_day":20,"ai_provider":"none","api_key":""}'));
```

- [ ] **Step 4: Create server/db/index.js**

```javascript
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (!db) {
    db = new Database(join(__dirname, '..', '..', 'hanyu.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  const schema = readFileSync(
    join(__dirname, 'migrations', '001-initial-schema.sql'),
    'utf-8'
  );
  testDb.exec(schema);
  return testDb;
}
```

- [ ] **Step 5: Create server/db/migrate.js**

```javascript
import { getDb } from './index.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

const db = getDb();

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  console.log(`Running migration: ${file}`);
  const sql = readFileSync(join(migrationsDir, file), 'utf-8');
  db.exec(sql);
}

console.log('Migrations complete.');
process.exit(0);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/db/index.test.js`
Expected: 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: database schema with migrations and test coverage"
```

---

### Task 3: HSK Data Import and Seeding

**Files:**
- Create: `scripts/import-hsk-data.js`
- Create: `server/db/seeds/hsk1-words.json`
- Create: `server/db/seeds/hsk2-words.json`
- Create: `server/db/seeds/hsk3-words.json`
- Create: `server/db/seeds/grammar-points.json`
- Create: `server/db/seed.js`
- Test: `server/db/seed.test.js`

**Interfaces:**
- Consumes: `createTestDb()` from Task 2; TSV files from krmanik/HSK-3.0 repo
- Produces: `seedDatabase(db)` function that populates `words` and `grammar_points` tables from JSON seed files

- [ ] **Step 1: Write the seed test**

Create `server/db/seed.test.js`:

```javascript
import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb } from './index.js';
import { seedDatabase } from './seed.js';

describe('Database seeding', () => {
  let db;

  afterEach(() => {
    if (db) db.close();
  });

  it('seeds HSK 1 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare("SELECT COUNT(*) as c FROM words WHERE hsk_level = 1").get();
    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds HSK 2 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare("SELECT COUNT(*) as c FROM words WHERE hsk_level = 2").get();
    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds HSK 3 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare("SELECT COUNT(*) as c FROM words WHERE hsk_level = 3").get();
    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds grammar points', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare("SELECT COUNT(*) as c FROM grammar_points").get();
    expect(count.c).toBeGreaterThan(0);
  });

  it('words have required fields', () => {
    db = createTestDb();
    seedDatabase(db);
    const word = db.prepare("SELECT * FROM words LIMIT 1").get();
    expect(word.hanzi).toBeTruthy();
    expect(word.pinyin).toBeTruthy();
    expect(word.meaning_en).toBeTruthy();
    expect(word.hsk_level).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent (running twice does not duplicate)', () => {
    db = createTestDb();
    seedDatabase(db);
    const count1 = db.prepare("SELECT COUNT(*) as c FROM words").get().c;
    seedDatabase(db);
    const count2 = db.prepare("SELECT COUNT(*) as c FROM words").get().c;
    expect(count2).toBe(count1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/db/seed.test.js`
Expected: FAIL — `seedDatabase` not found.

- [ ] **Step 3: Create minimal HSK seed data files**

Create `server/db/seeds/hsk1-words.json` (sample — the import script generates the full file):

```json
[
  {"hanzi": "你", "pinyin": "nǐ", "meaning_en": "you", "pos": "pronoun", "frequency": 1},
  {"hanzi": "好", "pinyin": "hǎo", "meaning_en": "good; well", "pos": "adjective", "frequency": 2},
  {"hanzi": "我", "pinyin": "wǒ", "meaning_en": "I; me", "pos": "pronoun", "frequency": 3},
  {"hanzi": "是", "pinyin": "shì", "meaning_en": "to be; is; am; are", "pos": "verb", "frequency": 4},
  {"hanzi": "的", "pinyin": "de", "meaning_en": "(possessive particle)", "pos": "particle", "frequency": 5},
  {"hanzi": "不", "pinyin": "bù", "meaning_en": "not; no", "pos": "adverb", "frequency": 6},
  {"hanzi": "了", "pinyin": "le", "meaning_en": "(completed action marker)", "pos": "particle", "frequency": 7},
  {"hanzi": "在", "pinyin": "zài", "meaning_en": "at; in; on", "pos": "preposition", "frequency": 8},
  {"hanzi": "人", "pinyin": "rén", "meaning_en": "person; people", "pos": "noun", "frequency": 9},
  {"hanzi": "有", "pinyin": "yǒu", "meaning_en": "to have; there is", "pos": "verb", "frequency": 10},
  {"hanzi": "这", "pinyin": "zhè", "meaning_en": "this", "pos": "pronoun", "frequency": 11},
  {"hanzi": "中", "pinyin": "zhōng", "meaning_en": "middle; center; China", "pos": "noun", "frequency": 12},
  {"hanzi": "大", "pinyin": "dà", "meaning_en": "big; large", "pos": "adjective", "frequency": 13},
  {"hanzi": "来", "pinyin": "lái", "meaning_en": "to come", "pos": "verb", "frequency": 14},
  {"hanzi": "上", "pinyin": "shàng", "meaning_en": "up; above; on", "pos": "noun", "frequency": 15},
  {"hanzi": "国", "pinyin": "guó", "meaning_en": "country; nation", "pos": "noun", "frequency": 16},
  {"hanzi": "个", "pinyin": "gè", "meaning_en": "(general measure word)", "pos": "measure word", "frequency": 17},
  {"hanzi": "到", "pinyin": "dào", "meaning_en": "to arrive; to go to", "pos": "verb", "frequency": 18},
  {"hanzi": "说", "pinyin": "shuō", "meaning_en": "to say; to speak", "pos": "verb", "frequency": 19},
  {"hanzi": "们", "pinyin": "men", "meaning_en": "(plural marker for pronouns)", "pos": "suffix", "frequency": 20}
]
```

Create `server/db/seeds/hsk2-words.json`:

```json
[
  {"hanzi": "但是", "pinyin": "dànshì", "meaning_en": "but; however", "pos": "conjunction", "frequency": 1},
  {"hanzi": "已经", "pinyin": "yǐjīng", "meaning_en": "already", "pos": "adverb", "frequency": 2},
  {"hanzi": "因为", "pinyin": "yīnwèi", "meaning_en": "because", "pos": "conjunction", "frequency": 3},
  {"hanzi": "所以", "pinyin": "suǒyǐ", "meaning_en": "so; therefore", "pos": "conjunction", "frequency": 4},
  {"hanzi": "如果", "pinyin": "rúguǒ", "meaning_en": "if", "pos": "conjunction", "frequency": 5},
  {"hanzi": "虽然", "pinyin": "suīrán", "meaning_en": "although", "pos": "conjunction", "frequency": 6},
  {"hanzi": "可能", "pinyin": "kěnéng", "meaning_en": "maybe; possible", "pos": "adjective", "frequency": 7},
  {"hanzi": "应该", "pinyin": "yīnggāi", "meaning_en": "should; ought to", "pos": "auxiliary verb", "frequency": 8},
  {"hanzi": "准备", "pinyin": "zhǔnbèi", "meaning_en": "to prepare", "pos": "verb", "frequency": 9},
  {"hanzi": "其实", "pinyin": "qíshí", "meaning_en": "actually; in fact", "pos": "adverb", "frequency": 10}
]
```

Create `server/db/seeds/hsk3-words.json`:

```json
[
  {"hanzi": "关系", "pinyin": "guānxi", "meaning_en": "relationship; connection", "pos": "noun", "frequency": 1},
  {"hanzi": "终于", "pinyin": "zhōngyú", "meaning_en": "finally; at last", "pos": "adverb", "frequency": 2},
  {"hanzi": "根据", "pinyin": "gēnjù", "meaning_en": "according to; based on", "pos": "preposition", "frequency": 3},
  {"hanzi": "无论", "pinyin": "wúlùn", "meaning_en": "regardless; no matter", "pos": "conjunction", "frequency": 4},
  {"hanzi": "尽管", "pinyin": "jǐnguǎn", "meaning_en": "despite; even though", "pos": "conjunction", "frequency": 5},
  {"hanzi": "不过", "pinyin": "búguò", "meaning_en": "but; however; only", "pos": "conjunction", "frequency": 6},
  {"hanzi": "甚至", "pinyin": "shènzhì", "meaning_en": "even (to the point of)", "pos": "adverb", "frequency": 7},
  {"hanzi": "只要", "pinyin": "zhǐyào", "meaning_en": "as long as", "pos": "conjunction", "frequency": 8},
  {"hanzi": "比较", "pinyin": "bǐjiào", "meaning_en": "to compare; relatively", "pos": "adverb", "frequency": 9},
  {"hanzi": "而且", "pinyin": "érqiě", "meaning_en": "moreover; and also", "pos": "conjunction", "frequency": 10}
]
```

Create `server/db/seeds/grammar-points.json`:

```json
[
  {
    "hsk_level": 1,
    "title": "Basic word order (SVO)",
    "explanation": "Chinese follows a Subject-Verb-Object word order, similar to English. The subject comes first, followed by the verb, and then the object.",
    "examples": [
      {"zh": "我喝茶。", "pinyin": "Wǒ hē chá.", "en": "I drink tea."},
      {"zh": "她看书。", "pinyin": "Tā kàn shū.", "en": "She reads books."},
      {"zh": "他吃饭。", "pinyin": "Tā chī fàn.", "en": "He eats food."}
    ],
    "order_idx": 1
  },
  {
    "hsk_level": 1,
    "title": "Questions with 吗 (ma)",
    "explanation": "To turn a statement into a yes/no question, add 吗 (ma) at the end. The word order stays the same.",
    "examples": [
      {"zh": "你好吗？", "pinyin": "Nǐ hǎo ma?", "en": "How are you?"},
      {"zh": "你是学生吗？", "pinyin": "Nǐ shì xuéshēng ma?", "en": "Are you a student?"},
      {"zh": "他喜欢中国吗？", "pinyin": "Tā xǐhuān Zhōngguó ma?", "en": "Does he like China?"}
    ],
    "order_idx": 2
  },
  {
    "hsk_level": 1,
    "title": "Negation with 不 (bù)",
    "explanation": "Place 不 (bù) before a verb or adjective to negate it. Note: 有 (yǒu) uses 没 (méi) for negation instead.",
    "examples": [
      {"zh": "我不喝咖啡。", "pinyin": "Wǒ bù hē kāfēi.", "en": "I don't drink coffee."},
      {"zh": "她不是老师。", "pinyin": "Tā bú shì lǎoshī.", "en": "She is not a teacher."},
      {"zh": "我没有钱。", "pinyin": "Wǒ méiyǒu qián.", "en": "I don't have money."}
    ],
    "order_idx": 3
  },
  {
    "hsk_level": 2,
    "title": "了 (le) for completed actions",
    "explanation": "Place 了 (le) after a verb to indicate a completed action. It does not directly translate to past tense — it marks completion.",
    "examples": [
      {"zh": "我吃了午饭。", "pinyin": "Wǒ chī le wǔfàn.", "en": "I ate lunch."},
      {"zh": "她买了一本书。", "pinyin": "Tā mǎi le yì běn shū.", "en": "She bought a book."},
      {"zh": "我们看了电影。", "pinyin": "Wǒmen kàn le diànyǐng.", "en": "We watched a movie."}
    ],
    "order_idx": 1
  },
  {
    "hsk_level": 2,
    "title": "因为...所以... (because...therefore...)",
    "explanation": "Use 因为 (yīnwèi) to state the cause and 所以 (suǒyǐ) to state the result. You can use both together or just one.",
    "examples": [
      {"zh": "因为下雨，所以我没去。", "pinyin": "Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.", "en": "Because it rained, I didn't go."},
      {"zh": "因为他生病了，所以没来上课。", "pinyin": "Yīnwèi tā shēngbìng le, suǒyǐ méi lái shàngkè.", "en": "Because he was sick, he didn't come to class."}
    ],
    "order_idx": 2
  },
  {
    "hsk_level": 3,
    "title": "把 (bǎ) construction",
    "explanation": "The 把 (bǎ) structure is used to emphasize the result or effect of an action on a specific object. Pattern: Subject + 把 + Object + Verb + Complement.",
    "examples": [
      {"zh": "请把门关上。", "pinyin": "Qǐng bǎ mén guān shàng.", "en": "Please close the door."},
      {"zh": "他把作业做完了。", "pinyin": "Tā bǎ zuòyè zuò wán le.", "en": "He finished his homework."},
      {"zh": "我把书放在桌子上了。", "pinyin": "Wǒ bǎ shū fàng zài zhuōzi shàng le.", "en": "I put the book on the table."}
    ],
    "order_idx": 1
  }
]
```

- [ ] **Step 4: Create server/db/seed.js**

```javascript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function seedDatabase(db) {
  const seedDir = join(__dirname, 'seeds');

  // Seed words
  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (hanzi, pinyin, meaning_en, pos, frequency, hsk_level)
    VALUES (@hanzi, @pinyin, @meaning_en, @pos, @frequency, @hsk_level)
  `);

  for (const level of [1, 2, 3]) {
    const filePath = join(seedDir, `hsk${level}-words.json`);
    const words = JSON.parse(readFileSync(filePath, 'utf-8'));
    const insertMany = db.transaction((items) => {
      for (const word of items) {
        insertWord.run({ ...word, hsk_level: level });
      }
    });
    insertMany(words);
  }

  // Seed grammar points
  const insertGrammar = db.prepare(`
    INSERT OR IGNORE INTO grammar_points (hsk_level, title, explanation, examples, order_idx)
    VALUES (@hsk_level, @title, @explanation, @examples, @order_idx)
  `);

  const grammarPath = join(seedDir, 'grammar-points.json');
  const grammarPoints = JSON.parse(readFileSync(grammarPath, 'utf-8'));
  const insertGrammarMany = db.transaction((items) => {
    for (const point of items) {
      insertGrammar.run({
        ...point,
        examples: JSON.stringify(point.examples),
      });
    }
  });
  insertGrammarMany(grammarPoints);
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const { getDb } = await import('./index.js');
  const db = getDb();
  seedDatabase(db);
  console.log('Seeding complete.');
  process.exit(0);
}
```

- [ ] **Step 5: Create scripts/import-hsk-data.js**

```javascript
/**
 * Import script for HSK data from krmanik/HSK-3.0 TSV files.
 *
 * Usage:
 *   1. Clone https://github.com/krmanik/HSK-3.0 into data/ directory
 *   2. Run: node scripts/import-hsk-data.js
 *
 * Reads TSV files from data/HSK-3.0/New HSK (2021)/HSK List/
 * Writes JSON seed files to server/db/seeds/
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(rootDir, 'data', 'HSK-3.0', 'New HSK (2021)', 'HSK List');
const seedDir = join(rootDir, 'server', 'db', 'seeds');

function parseTsv(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split('\t');
    const entry = {};
    headers.forEach((h, i) => {
      entry[h] = values[i]?.trim() || '';
    });
    return entry;
  });
}

function mapToWord(entry, index) {
  return {
    hanzi: entry.hanzi || entry.word || entry['汉字'] || '',
    pinyin: entry.pinyin || entry['拼音'] || '',
    meaning_en: entry.meaning || entry.english || entry.translation || entry['英文'] || '',
    pos: entry.pos || entry['词性'] || '',
    frequency: index + 1,
  };
}

for (const level of [1, 2, 3]) {
  const possiblePaths = [
    join(dataDir, `HSK ${level}.tsv`),
    join(dataDir, `HSK${level}.tsv`),
    join(dataDir, `Level ${level}.tsv`),
  ];

  const filePath = possiblePaths.find(p => existsSync(p));
  if (!filePath) {
    console.warn(`Warning: No TSV file found for HSK level ${level}. Skipping.`);
    console.warn(`  Looked in: ${possiblePaths.join(', ')}`);
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries = parseTsv(content);
  const words = entries.map(mapToWord).filter(w => w.hanzi);

  const outPath = join(seedDir, `hsk${level}-words.json`);
  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);
}

console.log('Import complete. Run "npm run seed" to populate the database.');
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/db/seed.test.js`
Expected: 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: HSK data import script and database seeding"
```

---

### Task 4: Words API

**Files:**
- Create: `server/routes/words.js`
- Modify: `server/app.js` — mount words router
- Test: `server/routes/words.test.js`

**Interfaces:**
- Consumes: `createTestDb()` from Task 2, `seedDatabase(db)` from Task 3
- Produces: `GET /api/words?level=&search=&page=&limit=`, `GET /api/words/:id`

- [ ] **Step 1: Write the failing tests**

Create `server/routes/words.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createWordsRouter } from './words.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/words', createWordsRouter(db));
  return app;
}

async function request(app, path) {
  const { default: supertest } = await import('supertest');
  // We don't have supertest yet, use native fetch with a test server
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      fetch(`http://localhost:${port}${path}`)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Words API', () => {
  let db, app;

  beforeAll(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterAll(() => db.close());

  it('GET /api/words returns paginated words', async () => {
    const res = await request(app, '/api/words');
    expect(res.status).toBe(200);
    expect(res.body.words).toBeInstanceOf(Array);
    expect(res.body.words.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('GET /api/words?level=1 filters by HSK level', async () => {
    const res = await request(app, '/api/words?level=1');
    expect(res.status).toBe(200);
    expect(res.body.words.every(w => w.hsk_level === 1)).toBe(true);
  });

  it('GET /api/words?search=好 searches by hanzi', async () => {
    const res = await request(app, '/api/words?search=好');
    expect(res.status).toBe(200);
    expect(res.body.words.some(w => w.hanzi.includes('好'))).toBe(true);
  });

  it('GET /api/words/:id returns a single word', async () => {
    const res = await request(app, '/api/words/1');
    expect(res.status).toBe(200);
    expect(res.body.hanzi).toBeTruthy();
    expect(res.body.pinyin).toBeTruthy();
  });

  it('GET /api/words/99999 returns 404', async () => {
    const res = await request(app, '/api/words/99999');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/words.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the words router**

Create `server/routes/words.js`:

```javascript
import { Router } from 'express';

export function createWordsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { level, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    let params = {};

    if (level) {
      where.push('hsk_level = @level');
      params.level = parseInt(level, 10);
    }

    if (search) {
      where.push('(hanzi LIKE @search OR pinyin LIKE @search OR meaning_en LIKE @search)');
      params.search = `%${search}%`;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as c FROM words ${whereClause}`).get(params).c;

    const words = db.prepare(
      `SELECT * FROM words ${whereClause} ORDER BY hsk_level, frequency LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit: limitNum, offset });

    res.json({ words, total, page: pageNum, limit: limitNum });
  });

  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const word = db.prepare('SELECT * FROM words WHERE id = ?').get(id);
    if (!word) return res.status(404).json({ error: 'Word not found' });

    res.json(word);
  });

  return router;
}
```

- [ ] **Step 4: Mount the router in app.js**

Update `server/app.js` — add after `app.use(express.json())`:

```javascript
import express from 'express';
import cors from 'cors';
import { getDb } from './db/index.js';
import { createWordsRouter } from './routes/words.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = getDb();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/words', createWordsRouter(db));

app.listen(PORT, () => {
  console.log(`Hanyu server running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/words.test.js`
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: words API with search, filtering, and pagination"
```

---

### Task 5: Grammar API

**Files:**
- Create: `server/routes/grammar.js`
- Modify: `server/app.js` — mount grammar router
- Test: `server/routes/grammar.test.js`

**Interfaces:**
- Consumes: `createTestDb()`, `seedDatabase(db)`
- Produces: `GET /api/grammar/:level`, `GET /api/grammar/:level/:id`

- [ ] **Step 1: Write the failing tests**

Create `server/routes/grammar.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createGrammarRouter } from './grammar.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/grammar', createGrammarRouter(db));
  return app;
}

async function request(app, path) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      fetch(`http://localhost:${port}${path}`)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Grammar API', () => {
  let db, app;

  beforeAll(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterAll(() => db.close());

  it('GET /api/grammar/1 returns level 1 grammar points', async () => {
    const res = await request(app, '/api/grammar/1');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(g => g.hsk_level === 1)).toBe(true);
  });

  it('grammar points have parsed examples', async () => {
    const res = await request(app, '/api/grammar/1');
    const point = res.body[0];
    expect(point.title).toBeTruthy();
    expect(point.explanation).toBeTruthy();
    expect(point.examples).toBeInstanceOf(Array);
    expect(point.examples[0]).toHaveProperty('zh');
    expect(point.examples[0]).toHaveProperty('en');
  });

  it('GET /api/grammar/1/:id returns a specific grammar point', async () => {
    const list = await request(app, '/api/grammar/1');
    const id = list.body[0].id;
    const res = await request(app, `/api/grammar/1/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('GET /api/grammar/9 returns empty array for non-existent level', async () => {
    const res = await request(app, '/api/grammar/9');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/grammar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the grammar router**

Create `server/routes/grammar.js`:

```javascript
import { Router } from 'express';

export function createGrammarRouter(db) {
  const router = Router();

  router.get('/:level', (req, res) => {
    const level = parseInt(req.params.level, 10);
    if (isNaN(level)) return res.status(400).json({ error: 'Invalid level' });

    const points = db.prepare(
      'SELECT * FROM grammar_points WHERE hsk_level = ? ORDER BY order_idx'
    ).all(level);

    const parsed = points.map(p => ({
      ...p,
      examples: JSON.parse(p.examples),
    }));

    res.json(parsed);
  });

  router.get('/:level/:id', (req, res) => {
    const level = parseInt(req.params.level, 10);
    const id = parseInt(req.params.id, 10);
    if (isNaN(level) || isNaN(id)) return res.status(400).json({ error: 'Invalid parameters' });

    const point = db.prepare(
      'SELECT * FROM grammar_points WHERE id = ? AND hsk_level = ?'
    ).get(id, level);

    if (!point) return res.status(404).json({ error: 'Grammar point not found' });

    res.json({ ...point, examples: JSON.parse(point.examples) });
  });

  return router;
}
```

- [ ] **Step 4: Mount in app.js**

Add to `server/app.js` imports and routing:

```javascript
import { createGrammarRouter } from './routes/grammar.js';
// ... after existing routes
app.use('/api/grammar', createGrammarRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/grammar.test.js`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: grammar API with level-based listing and detail view"
```

---

### Task 6: SRS Engine (SM-2 Algorithm)

**Files:**
- Create: `server/services/srs-engine.js`
- Test: `server/services/srs-engine.test.js`

**Interfaces:**
- Consumes: nothing (pure function)
- Produces: `calculateSrs({ quality, repetitions, easeFactor, interval })` → `{ repetitions, easeFactor, interval, nextReview, status }`

- [ ] **Step 1: Write the failing tests**

Create `server/services/srs-engine.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { calculateSrs } from './srs-engine.js';

describe('SM-2 SRS Engine', () => {
  const today = '2026-07-28';

  it('resets on quality < 3 (failed review)', () => {
    const result = calculateSrs({
      quality: 2,
      repetitions: 5,
      easeFactor: 2.5,
      interval: 30,
      today,
    });
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('learning');
  });

  it('first correct review sets interval to 1', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      today,
    });
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
    expect(result.status).toBe('learning');
  });

  it('second correct review sets interval to 6', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 1,
      easeFactor: 2.5,
      interval: 1,
      today,
    });
    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(6);
    expect(result.status).toBe('review');
  });

  it('subsequent reviews multiply interval by ease factor', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 2,
      easeFactor: 2.5,
      interval: 6,
      today,
    });
    expect(result.repetitions).toBe(3);
    expect(result.interval).toBe(15); // round(6 * 2.5) = 15
    expect(result.status).toBe('review');
  });

  it('calculates correct next review date', () => {
    const result = calculateSrs({
      quality: 4,
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      today: '2026-07-28',
    });
    expect(result.nextReview).toBe('2026-07-29');
  });

  it('adjusts ease factor based on quality', () => {
    // quality 5 (easy) should increase ease factor
    const easy = calculateSrs({
      quality: 5, repetitions: 2, easeFactor: 2.5, interval: 6, today,
    });
    expect(easy.easeFactor).toBeGreaterThan(2.5);

    // quality 3 (hard) should decrease ease factor
    const hard = calculateSrs({
      quality: 3, repetitions: 2, easeFactor: 2.5, interval: 6, today,
    });
    expect(hard.easeFactor).toBeLessThan(2.5);
  });

  it('ease factor never drops below 1.3', () => {
    const result = calculateSrs({
      quality: 3,
      repetitions: 2,
      easeFactor: 1.3,
      interval: 6,
      today,
    });
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('marks as mastered after many successful reviews', () => {
    const result = calculateSrs({
      quality: 5,
      repetitions: 10,
      easeFactor: 2.5,
      interval: 60,
      today,
    });
    expect(result.status).toBe('mastered');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/srs-engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the SRS engine**

Create `server/services/srs-engine.js`:

```javascript
/**
 * SM-2 Spaced Repetition Algorithm
 *
 * @param {Object} params
 * @param {number} params.quality - User rating 0-5
 * @param {number} params.repetitions - Consecutive correct reviews
 * @param {number} params.easeFactor - Current ease factor (default 2.5)
 * @param {number} params.interval - Current interval in days
 * @param {string} params.today - ISO date string (YYYY-MM-DD)
 * @returns {{ repetitions, easeFactor, interval, nextReview, status }}
 */
export function calculateSrs({ quality, repetitions, easeFactor, interval, today }) {
  let newRepetitions = repetitions;
  let newInterval = interval;
  let newEaseFactor = easeFactor;

  if (quality < 3) {
    // Failed: reset
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Passed
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(newInterval * newEaseFactor);
    }
    newRepetitions += 1;
  }

  // Update ease factor
  newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEaseFactor = Math.max(1.3, newEaseFactor);

  // Calculate next review date
  const date = new Date(today);
  date.setDate(date.getDate() + newInterval);
  const nextReview = date.toISOString().split('T')[0];

  // Determine status
  let status;
  if (quality < 3) {
    status = 'learning';
  } else if (newRepetitions <= 2) {
    status = 'learning';
  } else if (newInterval >= 21 && newRepetitions >= 5) {
    status = 'mastered';
  } else {
    status = 'review';
  }

  return {
    repetitions: newRepetitions,
    easeFactor: Math.round(newEaseFactor * 100) / 100,
    interval: newInterval,
    nextReview,
    status,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/services/srs-engine.test.js`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SM-2 spaced repetition engine with full test coverage"
```

---

### Task 7: Flashcards API

**Files:**
- Create: `server/routes/flashcards.js`
- Modify: `server/app.js` — mount flashcards router
- Test: `server/routes/flashcards.test.js`

**Interfaces:**
- Consumes: `calculateSrs()` from Task 6, `createTestDb()`, `seedDatabase()`
- Produces: `GET /api/flashcards/due`, `POST /api/flashcards/:id/review`, `GET /api/flashcards/stats`, `POST /api/flashcards/add`

- [ ] **Step 1: Write the failing tests**

Create `server/routes/flashcards.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createFlashcardsRouter } from './flashcards.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/flashcards', createFlashcardsRouter(db));
  return app;
}

async function req(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      fetch(`http://localhost:${port}${path}`, opts)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Flashcards API', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterEach(() => db.close());

  it('POST /api/flashcards/add creates a new SRS card', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const res = await req(app, 'POST', '/api/flashcards/add', { word_id: word.id });
    expect(res.status).toBe(201);
    expect(res.body.card_id).toBeDefined();
  });

  it('POST /api/flashcards/add rejects duplicate word', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    await req(app, 'POST', '/api/flashcards/add', { word_id: word.id });
    const res = await req(app, 'POST', '/api/flashcards/add', { word_id: word.id });
    expect(res.status).toBe(409);
  });

  it('GET /api/flashcards/due returns due cards', async () => {
    // Add a card due today
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word.id, today);

    const res = await req(app, 'GET', '/api/flashcards/due');
    expect(res.status).toBe(200);
    expect(res.body.cards).toBeInstanceOf(Array);
    expect(res.body.cards.length).toBeGreaterThan(0);
    expect(res.body.cards[0].hanzi).toBeTruthy();
  });

  it('POST /api/flashcards/:id/review updates SRS data', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word.id, today);

    const res = await req(app, 'POST', `/api/flashcards/${lastInsertRowid}/review`, { quality: 4 });
    expect(res.status).toBe(200);
    expect(res.body.interval).toBeGreaterThan(0);
    expect(res.body.next_review).toBeTruthy();
  });

  it('GET /api/flashcards/stats returns statistics', async () => {
    const res = await req(app, 'GET', '/api/flashcards/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('due');
    expect(res.body).toHaveProperty('by_status');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/flashcards.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the flashcards router**

Create `server/routes/flashcards.js`:

```javascript
import { Router } from 'express';
import { calculateSrs } from '../services/srs-engine.js';

export function createFlashcardsRouter(db) {
  const router = Router();

  // Get cards due for review today
  router.get('/due', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

    const cards = db.prepare(`
      SELECT sc.*, w.hanzi, w.pinyin, w.meaning_en, w.meaning_es, w.hsk_level, w.pos
      FROM srs_cards sc
      JOIN words w ON sc.word_id = w.id
      WHERE sc.user_id = 1 AND sc.next_review <= ?
      ORDER BY sc.next_review ASC, sc.status = 'new' DESC
      LIMIT ?
    `).all(today, limit);

    res.json({ cards, total: cards.length });
  });

  // Submit a review
  router.post('/:id/review', (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    const { quality, time_ms } = req.body;

    if (isNaN(cardId)) return res.status(400).json({ error: 'Invalid card ID' });
    if (quality === undefined || quality < 0 || quality > 5) {
      return res.status(400).json({ error: 'Quality must be 0-5' });
    }

    const card = db.prepare('SELECT * FROM srs_cards WHERE id = ?').get(cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const today = new Date().toISOString().split('T')[0];
    const result = calculateSrs({
      quality,
      repetitions: card.repetitions,
      easeFactor: card.ease_factor,
      interval: card.interval,
      today,
    });

    db.prepare(`
      UPDATE srs_cards
      SET ease_factor = ?, interval = ?, repetitions = ?,
          next_review = ?, last_review = ?, status = ?
      WHERE id = ?
    `).run(
      result.easeFactor, result.interval, result.repetitions,
      result.nextReview, today, result.status, cardId
    );

    // Log the review
    db.prepare(`
      INSERT INTO review_log (card_id, reviewed_at, quality, time_ms)
      VALUES (?, ?, ?, ?)
    `).run(cardId, new Date().toISOString(), quality, time_ms || null);

    res.json({
      card_id: cardId,
      interval: result.interval,
      next_review: result.nextReview,
      ease_factor: result.easeFactor,
      status: result.status,
    });
  });

  // Get SRS stats
  router.get('/stats', (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const today = new Date().toISOString().split('T')[0];
    const due = db.prepare(
      'SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?'
    ).get(today).c;

    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM srs_cards WHERE user_id = 1
      GROUP BY status
    `).all();

    const byLevel = db.prepare(`
      SELECT w.hsk_level, COUNT(*) as count
      FROM srs_cards sc JOIN words w ON sc.word_id = w.id
      WHERE sc.user_id = 1
      GROUP BY w.hsk_level
    `).all();

    res.json({
      total,
      due,
      by_status: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      by_level: Object.fromEntries(byLevel.map(r => [r.hsk_level, r.count])),
    });
  });

  // Add a word to the SRS deck
  router.post('/add', (req, res) => {
    const { word_id } = req.body;
    if (!word_id) return res.status(400).json({ error: 'word_id is required' });

    const word = db.prepare('SELECT id FROM words WHERE id = ?').get(word_id);
    if (!word) return res.status(404).json({ error: 'Word not found' });

    const existing = db.prepare(
      'SELECT id FROM srs_cards WHERE user_id = 1 AND word_id = ?'
    ).get(word_id);
    if (existing) return res.status(409).json({ error: 'Word already in deck' });

    const today = new Date().toISOString().split('T')[0];
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO srs_cards (user_id, word_id, next_review, status)
      VALUES (1, ?, ?, 'new')
    `).run(word_id, today);

    res.status(201).json({ card_id: Number(lastInsertRowid) });
  });

  return router;
}
```

- [ ] **Step 4: Mount in app.js**

Add to `server/app.js`:

```javascript
import { createFlashcardsRouter } from './routes/flashcards.js';
// ... after existing routes
app.use('/api/flashcards', createFlashcardsRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/flashcards.test.js`
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: flashcards API with SRS review, due cards, and stats"
```

---

### Task 8: Settings and Stats API

**Files:**
- Create: `server/routes/settings.js`
- Create: `server/routes/stats.js`
- Modify: `server/app.js` — mount both routers
- Test: `server/routes/settings.test.js`
- Test: `server/routes/stats.test.js`

**Interfaces:**
- Consumes: `createTestDb()`, `seedDatabase()`
- Produces: `GET /api/settings`, `PUT /api/settings`, `GET /api/stats/dashboard`, `GET /api/stats/streak`, `POST /api/stats/log-time`

- [ ] **Step 1: Write settings tests**

Create `server/routes/settings.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createSettingsRouter } from './settings.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', createSettingsRouter(db));
  return app;
}

async function req(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      fetch(`http://localhost:${port}${path}`, opts)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Settings API', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterEach(() => db.close());

  it('GET /api/settings returns user settings', async () => {
    const res = await req(app, 'GET', '/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('theme');
    expect(res.body).toHaveProperty('current_level');
    expect(res.body).toHaveProperty('cards_per_day');
  });

  it('PUT /api/settings updates settings', async () => {
    const res = await req(app, 'PUT', '/api/settings', { theme: 'dark', cards_per_day: 30 });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe('dark');
    expect(res.body.cards_per_day).toBe(30);

    // Verify persistence
    const get = await req(app, 'GET', '/api/settings');
    expect(get.body.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Write stats tests**

Create `server/routes/stats.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createStatsRouter } from './stats.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', createStatsRouter(db));
  return app;
}

async function req(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      fetch(`http://localhost:${port}${path}`, opts)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Stats API', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterEach(() => db.close());

  it('GET /api/stats/dashboard returns dashboard data', async () => {
    const res = await req(app, 'GET', '/api/stats/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('cards');
    expect(res.body).toHaveProperty('heatmap');
  });

  it('GET /api/stats/streak returns streak info', async () => {
    const res = await req(app, 'GET', '/api/stats/streak');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('longest');
  });

  it('POST /api/stats/log-time logs study time', async () => {
    const res = await req(app, 'POST', '/api/stats/log-time', { ms: 60000 });
    expect(res.status).toBe(200);
    expect(res.body.time_spent_ms).toBeGreaterThanOrEqual(60000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/routes/settings.test.js server/routes/stats.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement settings router**

Create `server/routes/settings.js`:

```javascript
import { Router } from 'express';

export function createSettingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = db.prepare('SELECT settings FROM users WHERE id = 1').get();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(JSON.parse(user.settings));
  });

  router.put('/', (req, res) => {
    const user = db.prepare('SELECT settings FROM users WHERE id = 1').get();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const current = JSON.parse(user.settings);
    const updated = { ...current, ...req.body };

    // Validate known fields
    if (updated.cards_per_day !== undefined) {
      updated.cards_per_day = Math.max(1, Math.min(200, parseInt(updated.cards_per_day, 10) || 20));
    }
    if (updated.current_level !== undefined) {
      updated.current_level = Math.max(1, Math.min(6, parseInt(updated.current_level, 10) || 1));
    }
    if (updated.theme && !['light', 'dark'].includes(updated.theme)) {
      updated.theme = 'light';
    }

    db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(updated));
    res.json(updated);
  });

  return router;
}
```

- [ ] **Step 5: Implement stats router**

Create `server/routes/stats.js`:

```javascript
import { Router } from 'express';

export function createStatsRouter(db) {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    // Cards overview
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const dueCards = db.prepare(
      'SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?'
    ).get(today).c;

    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM srs_cards WHERE user_id = 1 GROUP BY status
    `).all();

    // Today's stats
    const todayStats = db.prepare(
      'SELECT * FROM user_stats WHERE user_id = 1 AND date = ?'
    ).get(today) || { cards_reviewed: 0, cards_new: 0, exercises_done: 0, readings_done: 0, time_spent_ms: 0, streak_days: 0 };

    // Heatmap (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const heatmap = db.prepare(`
      SELECT date, cards_reviewed + exercises_done + readings_done as activity
      FROM user_stats WHERE user_id = 1 AND date >= ?
      ORDER BY date
    `).all(ninetyDaysAgo.toISOString().split('T')[0]);

    // Streak
    const streak = calculateStreak(db);

    res.json({
      cards: {
        total: totalCards,
        due: dueCards,
        by_status: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      },
      today: todayStats,
      heatmap,
      streak,
    });
  });

  router.get('/streak', (req, res) => {
    const streak = calculateStreak(db);
    res.json(streak);
  });

  router.post('/log-time', (req, res) => {
    const { ms } = req.body;
    if (!ms || ms < 0) return res.status(400).json({ error: 'ms is required and must be positive' });

    const today = new Date().toISOString().split('T')[0];

    const existing = db.prepare(
      'SELECT * FROM user_stats WHERE user_id = 1 AND date = ?'
    ).get(today);

    if (existing) {
      db.prepare(
        'UPDATE user_stats SET time_spent_ms = time_spent_ms + ? WHERE id = ?'
      ).run(ms, existing.id);
      res.json({ time_spent_ms: existing.time_spent_ms + ms });
    } else {
      db.prepare(`
        INSERT INTO user_stats (user_id, date, time_spent_ms)
        VALUES (1, ?, ?)
      `).run(today, ms);
      res.json({ time_spent_ms: ms });
    }
  });

  return router;
}

function calculateStreak(db) {
  const days = db.prepare(`
    SELECT date FROM user_stats
    WHERE user_id = 1 AND (cards_reviewed > 0 OR exercises_done > 0)
    ORDER BY date DESC
    LIMIT 365
  `).all().map(r => r.date);

  if (days.length === 0) return { current: 0, longest: 0 };

  let current = 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Current streak: count consecutive days ending today or yesterday
  if (days[0] === today || days[0] === yesterdayStr) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      const diffDays = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  // Longest streak
  let longest = days.length > 0 ? 1 : 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diffDays = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
      longest = Math.max(longest, streak);
    } else {
      streak = 1;
    }
  }

  return { current, longest };
}
```

- [ ] **Step 6: Mount both routers in app.js**

Add to `server/app.js`:

```javascript
import { createSettingsRouter } from './routes/settings.js';
import { createStatsRouter } from './routes/stats.js';
// ... after existing routes
app.use('/api/settings', createSettingsRouter(db));
app.use('/api/stats', createStatsRouter(db));
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/routes/settings.test.js server/routes/stats.test.js`
Expected: 5 tests PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: settings and stats API with streak tracking"
```

---

### Task 9: AI Connector Service

**Files:**
- Create: `server/services/ai-connector.js`
- Create: `server/services/deepseek-provider.js`
- Create: `server/services/gemini-provider.js`
- Test: `server/services/ai-connector.test.js`

**Interfaces:**
- Consumes: API keys from user settings
- Produces: `getAiProvider(settings)` → `AIProvider` instance with `generateExercise(type, level, context)` and `generateReading(level, format)`

- [ ] **Step 1: Write the failing tests**

Create `server/services/ai-connector.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { getAiProvider } from './ai-connector.js';
import { DeepSeekProvider } from './deepseek-provider.js';
import { GeminiProvider } from './gemini-provider.js';

describe('AI Connector', () => {
  it('returns DeepSeekProvider when ai_provider is deepseek', () => {
    const provider = getAiProvider({ ai_provider: 'deepseek', api_key: 'test-key' });
    expect(provider).toBeInstanceOf(DeepSeekProvider);
  });

  it('returns GeminiProvider when ai_provider is gemini', () => {
    const provider = getAiProvider({ ai_provider: 'gemini', api_key: 'test-key' });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('returns null when ai_provider is none', () => {
    const provider = getAiProvider({ ai_provider: 'none', api_key: '' });
    expect(provider).toBeNull();
  });

  it('returns null when no api_key', () => {
    const provider = getAiProvider({ ai_provider: 'deepseek', api_key: '' });
    expect(provider).toBeNull();
  });
});

describe('DeepSeekProvider', () => {
  it('builds exercise prompt with correct structure', () => {
    const provider = new DeepSeekProvider('test-key');
    const prompt = provider.buildExercisePrompt('fill_blank', 1, { words: ['你', '好'] });
    expect(prompt).toContain('fill_blank');
    expect(prompt).toContain('HSK 1');
    expect(prompt).toContain('JSON');
  });

  it('builds reading prompt with correct structure', () => {
    const provider = new DeepSeekProvider('test-key');
    const prompt = provider.buildReadingPrompt(1, 'dialogue');
    expect(prompt).toContain('dialogue');
    expect(prompt).toContain('HSK 1');
  });
});

describe('GeminiProvider', () => {
  it('builds exercise prompt with correct structure', () => {
    const provider = new GeminiProvider('test-key');
    const prompt = provider.buildExercisePrompt('multiple_choice', 2, { words: ['已经'] });
    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('HSK 2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/ai-connector.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement DeepSeek provider**

Create `server/services/deepseek-provider.js`:

```javascript
export class DeepSeekProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.model = 'deepseek-chat';
  }

  buildExercisePrompt(type, level, context) {
    const wordList = context.words ? context.words.join(', ') : '';
    return `You are a Mandarin Chinese language teacher. Generate a single ${type} exercise for HSK ${level} students.

Use ONLY vocabulary appropriate for HSK level ${level} or below.
${wordList ? `Focus on these words: ${wordList}` : ''}

Return ONLY a valid JSON object with this exact structure for type "${type}":
${this.getExerciseSchema(type)}

Do not include any text outside the JSON object.`;
  }

  buildReadingPrompt(level, format) {
    const lengths = { short_text: '100-200', story: '300-500', dialogue: '150-300' };
    return `You are a Mandarin Chinese language teacher. Generate a ${format} reading passage for HSK ${level} students.

Requirements:
- Use ONLY vocabulary appropriate for HSK level ${level} or below
- Length: ${lengths[format] || '100-200'} Chinese characters
- Include 3-5 comprehension questions

Return ONLY a valid JSON object:
{
  "title": "Title in Chinese",
  "content": "Full text in Chinese characters",
  "pinyin_text": "Full text with pinyin",
  "questions": [
    {
      "question": "Question in Chinese",
      "options": ["A", "B", "C", "D"],
      "correct": "A"
    }
  ]
}

Do not include any text outside the JSON object.`;
  }

  getExerciseSchema(type) {
    const schemas = {
      fill_blank: '{"type":"fill_blank","sentence":"Sentence with ___ blank","options":["option1","option2","option3","option4"],"correct":"correct_option","explanation":"Brief explanation"}',
      multiple_choice: '{"type":"multiple_choice","question":"What does X mean?","options":["a","b","c","d"],"correct":"correct_answer"}',
      reorder: '{"type":"reorder","words":["shuffled","word","list"],"correct_order":["correct","word","order"],"translation":"English translation"}',
      dictation: '{"type":"dictation","audio_text":"Chinese text to read aloud","pinyin":"pinyin of the text","accept_pinyin":true}',
      matching: '{"type":"matching","pairs":[{"left":"Chinese","right":"English"},{"left":"Chinese2","right":"English2"}]}',
    };
    return schemas[type] || schemas.fill_blank;
  }

  async generateExercise(type, level, context) {
    const prompt = this.buildExercisePrompt(type, level, context);
    return this.callApi(prompt);
  }

  async generateReading(level, format) {
    const prompt = this.buildReadingPrompt(level, format);
    return this.callApi(prompt);
  }

  async callApi(prompt) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from DeepSeek');

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1].trim());
  }
}
```

- [ ] **Step 4: Implement Gemini provider**

Create `server/services/gemini-provider.js`:

```javascript
export class GeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  buildExercisePrompt(type, level, context) {
    const wordList = context.words ? context.words.join(', ') : '';
    return `You are a Mandarin Chinese language teacher. Generate a single ${type} exercise for HSK ${level} students.

Use ONLY vocabulary appropriate for HSK level ${level} or below.
${wordList ? `Focus on these words: ${wordList}` : ''}

Return ONLY a valid JSON object matching the type "${type}". No extra text.
For fill_blank: {"type":"fill_blank","sentence":"...___...","options":["a","b","c","d"],"correct":"answer","explanation":"..."}
For multiple_choice: {"type":"multiple_choice","question":"...","options":["a","b","c","d"],"correct":"answer"}
For reorder: {"type":"reorder","words":["shuffled"],"correct_order":["ordered"],"translation":"English"}
For dictation: {"type":"dictation","audio_text":"Chinese","pinyin":"pinyin","accept_pinyin":true}
For matching: {"type":"matching","pairs":[{"left":"Chinese","right":"English"}]}`;
  }

  buildReadingPrompt(level, format) {
    const lengths = { short_text: '100-200', story: '300-500', dialogue: '150-300' };
    return `Generate a ${format} reading in Mandarin Chinese for HSK ${level} students.
Length: ${lengths[format] || '100-200'} characters. Use only HSK ${level} or below vocabulary.
Return ONLY JSON: {"title":"Chinese title","content":"Chinese text","pinyin_text":"text with pinyin","questions":[{"question":"Q","options":["A","B","C","D"],"correct":"A"}]}`;
  }

  async generateExercise(type, level, context) {
    const prompt = this.buildExercisePrompt(type, level, context);
    return this.callApi(prompt);
  }

  async generateReading(level, format) {
    const prompt = this.buildReadingPrompt(level, format);
    return this.callApi(prompt);
  }

  async callApi(prompt) {
    const url = `${this.baseUrl}?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1].trim());
  }
}
```

- [ ] **Step 5: Implement AI connector factory**

Create `server/services/ai-connector.js`:

```javascript
import { DeepSeekProvider } from './deepseek-provider.js';
import { GeminiProvider } from './gemini-provider.js';

export function getAiProvider(settings) {
  const { ai_provider, api_key } = settings;

  if (!api_key || ai_provider === 'none') return null;

  switch (ai_provider) {
    case 'deepseek':
      return new DeepSeekProvider(api_key);
    case 'gemini':
      return new GeminiProvider(api_key);
    default:
      return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/services/ai-connector.test.js`
Expected: 7 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: AI connector with DeepSeek and Gemini providers"
```

---

### Task 10: Exercises API

**Files:**
- Create: `server/routes/exercises.js`
- Modify: `server/app.js` — mount exercises router
- Test: `server/routes/exercises.test.js`

**Interfaces:**
- Consumes: `getAiProvider()` from Task 9, `createTestDb()`, `seedDatabase()`
- Produces: `POST /api/exercises/generate`, `POST /api/exercises/:id/check`, `GET /api/exercises/history`

- [ ] **Step 1: Write the failing tests**

Create `server/routes/exercises.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createExercisesRouter } from './exercises.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/exercises', createExercisesRouter(db));
  return app;
}

async function req(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      fetch(`http://localhost:${port}${path}`, opts)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Exercises API', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterEach(() => db.close());

  it('POST /api/exercises/generate returns cached exercise when no AI', async () => {
    // Pre-seed a cached exercise
    db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at, source_model)
      VALUES ('fill_blank', 1, ?, '每天', datetime('now'), 'seed')
    `).run(JSON.stringify({
      type: 'fill_blank',
      sentence: '我___去学校。',
      options: ['每天', '昨天', '已经', '可能'],
      correct: '每天',
      explanation: '每天 means every day.'
    }));

    const res = await req(app, 'POST', '/api/exercises/generate', { type: 'fill_blank', level: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('type', 'fill_blank');
    expect(res.body).toHaveProperty('sentence');
  });

  it('POST /api/exercises/:id/check validates correct answer', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const res = await req(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, { answer: '每天' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('POST /api/exercises/:id/check detects wrong answer', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const res = await req(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, { answer: '昨天' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.correct_answer).toBe('每天');
  });

  it('GET /api/exercises/history returns past exercises', async () => {
    db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const res = await req(app, 'GET', '/api/exercises/history');
    expect(res.status).toBe(200);
    expect(res.body.exercises).toBeInstanceOf(Array);
    expect(res.body.exercises.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/exercises.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement exercises router**

Create `server/routes/exercises.js`:

```javascript
import { Router } from 'express';
import { getAiProvider } from '../services/ai-connector.js';

const VALID_TYPES = ['fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching'];

export function createExercisesRouter(db) {
  const router = Router();

  router.post('/generate', async (req, res) => {
    const { type, level } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const hskLevel = parseInt(level, 10) || 1;

    // Try cached first
    const cached = db.prepare(`
      SELECT * FROM exercises
      WHERE type = ? AND hsk_level = ?
      ORDER BY RANDOM() LIMIT 1
    `).get(type, hskLevel);

    // Try AI generation
    const settings = JSON.parse(
      db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}'
    );
    const provider = getAiProvider(settings);

    if (provider) {
      try {
        // Get context words for personalization
        const words = db.prepare(
          'SELECT hanzi FROM words WHERE hsk_level <= ? ORDER BY RANDOM() LIMIT 10'
        ).all(hskLevel).map(w => w.hanzi);

        const exercise = await provider.generateExercise(type, hskLevel, { words });

        // Cache the result
        const { lastInsertRowid } = db.prepare(`
          INSERT INTO exercises (type, hsk_level, prompt, answer, source_model)
          VALUES (?, ?, ?, ?, ?)
        `).run(type, hskLevel, JSON.stringify(exercise), exercise.correct || '', settings.ai_provider);

        return res.json({ id: Number(lastInsertRowid), ...exercise });
      } catch (err) {
        console.error('AI generation failed:', err.message);
        // Fall through to cached
      }
    }

    // Fallback to cached
    if (cached) {
      const prompt = JSON.parse(cached.prompt);
      return res.json({ id: cached.id, ...prompt });
    }

    res.status(503).json({
      error: 'No AI provider configured and no cached exercises available. Add an API key in Settings.',
    });
  });

  router.post('/:id/check', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { answer } = req.body;

    if (isNaN(id)) return res.status(400).json({ error: 'Invalid exercise ID' });
    if (answer === undefined) return res.status(400).json({ error: 'answer is required' });

    const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const isCorrect = exercise.answer === answer;

    // Update today's stats
    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT id FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    if (existing) {
      db.prepare('UPDATE user_stats SET exercises_done = exercises_done + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO user_stats (user_id, date, exercises_done) VALUES (1, ?, 1)').run(today);
    }

    res.json({
      correct: isCorrect,
      correct_answer: exercise.answer,
    });
  });

  router.get('/history', (req, res) => {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const exercises = db.prepare(`
      SELECT id, type, hsk_level, prompt, generated_at, source_model
      FROM exercises ORDER BY generated_at DESC LIMIT ?
    `).all(limit);

    const parsed = exercises.map(e => ({
      ...e,
      prompt: JSON.parse(e.prompt),
    }));

    res.json({ exercises: parsed });
  });

  return router;
}
```

- [ ] **Step 4: Mount in app.js**

Add to `server/app.js`:

```javascript
import { createExercisesRouter } from './routes/exercises.js';
// ... after existing routes
app.use('/api/exercises', createExercisesRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/exercises.test.js`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: exercises API with AI generation and cached fallback"
```

---

### Task 11: Readings API

**Files:**
- Create: `server/routes/readings.js`
- Modify: `server/app.js` — mount readings router
- Test: `server/routes/readings.test.js`

**Interfaces:**
- Consumes: `getAiProvider()` from Task 9, `createTestDb()`, `seedDatabase()`
- Produces: `POST /api/readings/generate`, `GET /api/readings`, `GET /api/readings/:id`

- [ ] **Step 1: Write the failing tests**

Create `server/routes/readings.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createReadingsRouter } from './readings.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/readings', createReadingsRouter(db));
  return app;
}

async function req(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      fetch(`http://localhost:${port}${path}`, opts)
        .then(r => r.json().then(data => ({ status: r.status, body: data })))
        .then(result => { server.close(); resolve(result); })
        .catch(err => { server.close(); resolve({ status: 500, body: { error: err.message } }); });
    });
  });
}

describe('Readings API', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);

    // Pre-seed a reading
    db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'dialogue', '你好', '你好，我叫小明。', 'Nǐ hǎo, wǒ jiào Xiǎo Míng.', ?, 'seed')
    `).run(JSON.stringify([
      { question: '小明说了什么？', options: ['你好', '再见', '谢谢', '对不起'], correct: '你好' }
    ]));
  });

  afterEach(() => db.close());

  it('GET /api/readings returns cached readings', async () => {
    const res = await req(app, 'GET', '/api/readings');
    expect(res.status).toBe(200);
    expect(res.body.readings).toBeInstanceOf(Array);
    expect(res.body.readings.length).toBe(1);
  });

  it('GET /api/readings/:id returns a specific reading', async () => {
    const res = await req(app, 'GET', '/api/readings/1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('你好');
    expect(res.body.content).toBeTruthy();
    expect(res.body.questions).toBeInstanceOf(Array);
  });

  it('GET /api/readings/99999 returns 404', async () => {
    const res = await req(app, 'GET', '/api/readings/99999');
    expect(res.status).toBe(404);
  });

  it('GET /api/readings?level=1 filters by level', async () => {
    const res = await req(app, 'GET', '/api/readings?level=1');
    expect(res.body.readings.every(r => r.hsk_level === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/readings.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement readings router**

Create `server/routes/readings.js`:

```javascript
import { Router } from 'express';
import { getAiProvider } from '../services/ai-connector.js';

const VALID_FORMATS = ['short_text', 'story', 'dialogue'];

export function createReadingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { level, format, limit = 20 } = req.query;
    const limitNum = Math.min(50, parseInt(limit, 10) || 20);

    let where = [];
    let params = {};

    if (level) {
      where.push('hsk_level = @level');
      params.level = parseInt(level, 10);
    }
    if (format && VALID_FORMATS.includes(format)) {
      where.push('format = @format');
      params.format = format;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const readings = db.prepare(`
      SELECT id, hsk_level, format, title, generated_at, source_model
      FROM readings ${whereClause}
      ORDER BY generated_at DESC LIMIT @limit
    `).all({ ...params, limit: limitNum });

    res.json({ readings });
  });

  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(id);
    if (!reading) return res.status(404).json({ error: 'Reading not found' });

    res.json({
      ...reading,
      questions: JSON.parse(reading.questions),
    });
  });

  router.post('/generate', async (req, res) => {
    const { level, format } = req.body;

    if (!format || !VALID_FORMATS.includes(format)) {
      return res.status(400).json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` });
    }
    const hskLevel = parseInt(level, 10) || 1;

    const settings = JSON.parse(
      db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}'
    );
    const provider = getAiProvider(settings);

    if (!provider) {
      // Fallback to cached
      const cached = db.prepare(`
        SELECT * FROM readings WHERE hsk_level = ? AND format = ?
        ORDER BY RANDOM() LIMIT 1
      `).get(hskLevel, format);

      if (cached) {
        return res.json({ ...cached, questions: JSON.parse(cached.questions) });
      }
      return res.status(503).json({
        error: 'No AI provider configured and no cached readings available.',
      });
    }

    try {
      const reading = await provider.generateReading(hskLevel, format);

      const { lastInsertRowid } = db.prepare(`
        INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        hskLevel, format,
        reading.title, reading.content,
        reading.pinyin_text || '',
        JSON.stringify(reading.questions),
        settings.ai_provider
      );

      // Update today's stats
      const today = new Date().toISOString().split('T')[0];
      const existing = db.prepare('SELECT id FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
      if (existing) {
        db.prepare('UPDATE user_stats SET readings_done = readings_done + 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare('INSERT INTO user_stats (user_id, date, readings_done) VALUES (1, ?, 1)').run(today);
      }

      res.json({ id: Number(lastInsertRowid), ...reading });
    } catch (err) {
      console.error('Reading generation failed:', err.message);
      res.status(500).json({ error: 'Failed to generate reading. Try again.' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount in app.js**

Add to `server/app.js`:

```javascript
import { createReadingsRouter } from './routes/readings.js';
// ... after existing routes
app.use('/api/readings', createReadingsRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/routes/readings.test.js`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: readings API with AI generation and cached fallback"
```

---

### Task 12: Complete Server App Assembly

**Files:**
- Modify: `server/app.js` — final version with all routers mounted

**Interfaces:**
- Consumes: all routers from Tasks 4-11
- Produces: complete Express server with all API endpoints

- [ ] **Step 1: Write the final server/app.js**

Replace `server/app.js` with:

```javascript
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db/index.js';
import { createWordsRouter } from './routes/words.js';
import { createGrammarRouter } from './routes/grammar.js';
import { createFlashcardsRouter } from './routes/flashcards.js';
import { createExercisesRouter } from './routes/exercises.js';
import { createReadingsRouter } from './routes/readings.js';
import { createSettingsRouter } from './routes/settings.js';
import { createStatsRouter } from './routes/stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = getDb();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/words', createWordsRouter(db));
app.use('/api/grammar', createGrammarRouter(db));
app.use('/api/flashcards', createFlashcardsRouter(db));
app.use('/api/exercises', createExercisesRouter(db));
app.use('/api/readings', createReadingsRouter(db));
app.use('/api/settings', createSettingsRouter(db));
app.use('/api/stats', createStatsRouter(db));

// Serve static files in production
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(clientDist, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Hanyu server running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 2: Run all backend tests**

Run: `npx vitest run server/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: assemble complete server with all API routes"
```

---

### Task 13: Frontend Shell — Routing, Navigation, Theme

**Files:**
- Modify: `client/src/App.jsx` — add routing + layout
- Create: `client/src/components/Layout.jsx`
- Create: `client/src/components/Navbar.jsx`
- Create: `client/src/components/ThemeToggle.jsx`
- Create: `client/src/stores/appStore.js`
- Create: `client/src/services/api.js`
- Create: `client/src/pages/Dashboard.jsx` (placeholder)
- Create: `client/src/pages/Flashcards.jsx` (placeholder)
- Create: `client/src/pages/Exercises.jsx` (placeholder)
- Create: `client/src/pages/Readings.jsx` (placeholder)
- Create: `client/src/pages/Grammar.jsx` (placeholder)
- Create: `client/src/pages/Words.jsx` (placeholder)
- Create: `client/src/pages/Settings.jsx` (placeholder)
- Test: `client/src/App.test.jsx`

**Interfaces:**
- Consumes: React Router, Zustand, Tailwind
- Produces: navigable shell with all routes, theme toggle, global state store, API service

- [ ] **Step 1: Write the shell test**

Create `client/src/App.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the navigation', () => {
    render(<App />);
    expect(screen.getByText('汉语')).toBeDefined();
  });

  it('renders the dashboard by default', () => {
    render(<App />);
    expect(screen.getByText(/Dashboard|仪表盘/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Create the API service**

Create `client/src/services/api.js`:

```javascript
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Words
  getWords: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/words?${qs}`);
  },
  getWord: (id) => request(`/words/${id}`),

  // Grammar
  getGrammar: (level) => request(`/grammar/${level}`),
  getGrammarPoint: (level, id) => request(`/grammar/${level}/${id}`),

  // Flashcards
  getDueCards: (limit) => request(`/flashcards/due?limit=${limit || 50}`),
  reviewCard: (id, quality, timeMs) =>
    request(`/flashcards/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ quality, time_ms: timeMs }),
    }),
  addCard: (wordId) =>
    request('/flashcards/add', {
      method: 'POST',
      body: JSON.stringify({ word_id: wordId }),
    }),
  getFlashcardStats: () => request('/flashcards/stats'),

  // Exercises
  generateExercise: (type, level) =>
    request('/exercises/generate', {
      method: 'POST',
      body: JSON.stringify({ type, level }),
    }),
  checkExercise: (id, answer) =>
    request(`/exercises/${id}/check`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  getExerciseHistory: () => request('/exercises/history'),

  // Readings
  getReadings: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/readings?${qs}`);
  },
  getReading: (id) => request(`/readings/${id}`),
  generateReading: (level, format) =>
    request('/readings/generate', {
      method: 'POST',
      body: JSON.stringify({ level, format }),
    }),

  // Stats
  getDashboard: () => request('/stats/dashboard'),
  getStreak: () => request('/stats/streak'),
  logTime: (ms) =>
    request('/stats/log-time', {
      method: 'POST',
      body: JSON.stringify({ ms }),
    }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
```

- [ ] **Step 3: Create the Zustand store**

Create `client/src/stores/appStore.js`:

```javascript
import { create } from 'zustand';

export const useAppStore = create((set) => ({
  theme: localStorage.getItem('hanyu-theme') || 'light',
  currentLevel: 1,
  showPinyin: true,
  loading: false,
  error: null,

  setTheme: (theme) => {
    localStorage.setItem('hanyu-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },

  setCurrentLevel: (level) => set({ currentLevel: level }),
  togglePinyin: () => set((s) => ({ showPinyin: !s.showPinyin })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
```

- [ ] **Step 4: Create ThemeToggle component**

Create `client/src/components/ThemeToggle.jsx`:

```jsx
import { useAppStore } from '../stores/appStore';

export default function ThemeToggle() {
  const { theme, setTheme } = useAppStore();

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="p-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

- [ ] **Step 5: Create Navbar component**

Create `client/src/components/Navbar.jsx`:

```jsx
import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const links = [
  { to: '/', label: '仪表盘', desc: 'Dashboard' },
  { to: '/flashcards', label: '卡片', desc: 'Flashcards' },
  { to: '/exercises', label: '练习', desc: 'Exercises' },
  { to: '/readings', label: '阅读', desc: 'Readings' },
  { to: '/grammar', label: '语法', desc: 'Grammar' },
  { to: '/words', label: '词汇', desc: 'Words' },
  { to: '/settings', label: '设置', desc: 'Settings' },
];

export default function Navbar() {
  const linkClass = ({ isActive }) =>
    `flex flex-col items-center px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-[var(--color-vermilion)] text-white'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]'
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-56 min-h-screen border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl font-bold text-[var(--color-vermilion)]">汉语</span>
          <span className="text-sm text-[var(--color-text-muted)]">Hanyu</span>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className="flex flex-col gap-1">
          {links.map(({ to, label, desc }) => (
            <NavLink key={to} to={to} className={linkClass} end={to === '/'}>
              <span className="font-chinese text-lg">{label}</span>
              <span className="text-xs">{desc}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex justify-around py-2 z-50">
        {links.slice(0, 5).map(({ to, label }) => (
          <NavLink key={to} to={to} className={linkClass} end={to === '/'}>
            <span className="font-chinese text-sm">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 6: Create Layout component**

Create `client/src/components/Layout.jsx`:

```jsx
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Navbar />
      <main className="flex-1 p-6 pb-20 md:pb-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Create placeholder pages**

Create `client/src/pages/Dashboard.jsx`:

```jsx
export default function Dashboard() {
  return <div><h1 className="text-2xl font-bold">Dashboard 仪表盘</h1></div>;
}
```

Create `client/src/pages/Flashcards.jsx`:

```jsx
export default function Flashcards() {
  return <div><h1 className="text-2xl font-bold">Flashcards 卡片</h1></div>;
}
```

Create `client/src/pages/Exercises.jsx`:

```jsx
export default function Exercises() {
  return <div><h1 className="text-2xl font-bold">Exercises 练习</h1></div>;
}
```

Create `client/src/pages/Readings.jsx`:

```jsx
export default function Readings() {
  return <div><h1 className="text-2xl font-bold">Readings 阅读</h1></div>;
}
```

Create `client/src/pages/Grammar.jsx`:

```jsx
export default function Grammar() {
  return <div><h1 className="text-2xl font-bold">Grammar 语法</h1></div>;
}
```

Create `client/src/pages/Words.jsx`:

```jsx
export default function Words() {
  return <div><h1 className="text-2xl font-bold">Word Explorer 词汇</h1></div>;
}
```

Create `client/src/pages/Settings.jsx`:

```jsx
export default function Settings() {
  return <div><h1 className="text-2xl font-bold">Settings 设置</h1></div>;
}
```

- [ ] **Step 8: Update App.jsx with routing**

Replace `client/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from './stores/appStore';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Flashcards from './pages/Flashcards';
import Exercises from './pages/Exercises';
import Readings from './pages/Readings';
import Grammar from './pages/Grammar';
import Words from './pages/Words';
import Settings from './pages/Settings';

export default function App() {
  const { theme } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/readings" element={<Readings />} />
          <Route path="/readings/:id" element={<Readings />} />
          <Route path="/grammar" element={<Grammar />} />
          <Route path="/words" element={<Words />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run client/src/App.test.jsx`
Expected: 2 tests PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: frontend shell with routing, navigation, theme toggle, and Zustand store"
```

---

### Task 14: Words Page

**Files:**
- Modify: `client/src/pages/Words.jsx` — full implementation
- Test: `client/src/pages/Words.test.jsx`

**Interfaces:**
- Consumes: `api.getWords()` from Task 13
- Produces: searchable, filterable vocabulary table with HSK level filter and pagination

- [ ] **Step 1: Write the test**

Create `client/src/pages/Words.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Words from './Words';

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    getWords: vi.fn().mockResolvedValue({
      words: [
        { id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1, pos: 'pronoun' },
        { id: 2, hanzi: '好', pinyin: 'hǎo', meaning_en: 'good', hsk_level: 1, pos: 'adjective' },
      ],
      total: 2, page: 1, limit: 50,
    }),
    addCard: vi.fn().mockResolvedValue({ card_id: 1 }),
  },
}));

function renderWords() {
  return render(<BrowserRouter><Words /></BrowserRouter>);
}

describe('Words page', () => {
  it('renders word list', async () => {
    renderWords();
    await waitFor(() => {
      expect(screen.getByText('你')).toBeDefined();
      expect(screen.getByText('好')).toBeDefined();
    });
  });

  it('shows pinyin and meaning', async () => {
    renderWords();
    await waitFor(() => {
      expect(screen.getByText('nǐ')).toBeDefined();
      expect(screen.getByText('you')).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/pages/Words.test.jsx`
Expected: FAIL — placeholder doesn't render words.

- [ ] **Step 3: Implement Words page**

Replace `client/src/pages/Words.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Words() {
  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    loadWords();
  }, [search, level, page]);

  async function loadWords() {
    setLoading(true);
    try {
      const params = { page };
      if (search) params.search = search;
      if (level) params.level = level;
      const data = await api.getWords(params);
      setWords(data.words);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load words:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToSrs(wordId) {
    setAddingId(wordId);
    try {
      await api.addCard(wordId);
    } catch (err) {
      // Ignore 409 (already added)
    } finally {
      setAddingId(null);
    }
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Word Explorer 词汇</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search hanzi, pinyin, or English..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        />
        <select
          value={level}
          onChange={(e) => { setLevel(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        >
          <option value="">All levels</option>
          <option value="1">HSK 1</option>
          <option value="2">HSK 2</option>
          <option value="3">HSK 3</option>
        </select>
      </div>

      <p className="text-sm text-[var(--color-text-muted)] mb-2">{total} words found</p>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="py-2 px-3">Hanzi</th>
              <th className="py-2 px-3">Pinyin</th>
              <th className="py-2 px-3">Meaning</th>
              <th className="py-2 px-3">Level</th>
              <th className="py-2 px-3">POS</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                <td className="py-2 px-3 font-chinese text-xl">{word.hanzi}</td>
                <td className="py-2 px-3 text-[var(--color-text-muted)]">{word.pinyin}</td>
                <td className="py-2 px-3">{word.meaning_en}</td>
                <td className="py-2 px-3">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-vermilion)] text-white">
                    HSK {word.hsk_level}
                  </span>
                </td>
                <td className="py-2 px-3 text-sm text-[var(--color-text-muted)]">{word.pos}</td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleAddToSrs(word.id)}
                    disabled={addingId === word.id}
                    className="text-sm px-2 py-1 rounded bg-[var(--color-gold)] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    + SRS
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="px-3 py-1">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/pages/Words.test.jsx`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: word explorer page with search, filter, and SRS add"
```

---

### Task 15: Grammar Page

**Files:**
- Modify: `client/src/pages/Grammar.jsx` — full implementation
- Test: `client/src/pages/Grammar.test.jsx`

**Interfaces:**
- Consumes: `api.getGrammar(level)` from Task 13
- Produces: grammar reference page with level selector, point list, and detail view with examples

- [ ] **Step 1: Write the test**

Create `client/src/pages/Grammar.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Grammar from './Grammar';

vi.mock('../services/api', () => ({
  api: {
    getGrammar: vi.fn().mockResolvedValue([
      {
        id: 1, hsk_level: 1, title: 'Basic SVO',
        explanation: 'Subject-Verb-Object order.',
        examples: [
          { zh: '我喝茶。', pinyin: 'Wǒ hē chá.', en: 'I drink tea.' }
        ],
        order_idx: 1,
      },
    ]),
  },
}));

describe('Grammar page', () => {
  it('renders grammar points', async () => {
    render(<BrowserRouter><Grammar /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Basic SVO')).toBeDefined();
    });
  });

  it('shows example sentences', async () => {
    render(<BrowserRouter><Grammar /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('我喝茶。')).toBeDefined();
      expect(screen.getByText('I drink tea.')).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/pages/Grammar.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement Grammar page**

Replace `client/src/pages/Grammar.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function Grammar() {
  const [level, setLevel] = useState(1);
  const [points, setPoints] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const { showPinyin, togglePinyin } = useAppStore();

  useEffect(() => {
    loadGrammar();
  }, [level]);

  async function loadGrammar() {
    setLoading(true);
    try {
      const data = await api.getGrammar(level);
      setPoints(data);
      setSelected(data[0] || null);
    } catch (err) {
      console.error('Failed to load grammar:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Grammar 语法</h1>
        <div className="flex gap-1">
          {[1, 2, 3].map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1 rounded-lg text-sm ${
                level === l
                  ? 'bg-[var(--color-vermilion)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
              }`}
            >
              HSK {l}
            </button>
          ))}
        </div>
        <button
          onClick={togglePinyin}
          className="ml-auto text-sm px-3 py-1 rounded-lg border border-[var(--color-border)]"
        >
          {showPinyin ? 'Hide Pinyin' : 'Show Pinyin'}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar: point list */}
        <div className="md:w-64 flex-shrink-0">
          <ul className="space-y-1">
            {points.map(point => (
              <li key={point.id}>
                <button
                  onClick={() => setSelected(point)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    selected?.id === point.id
                      ? 'bg-[var(--color-vermilion)] text-white'
                      : 'hover:bg-[var(--color-surface)]'
                  }`}
                >
                  {point.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Main: selected grammar point */}
        <div className="flex-1">
          {selected ? (
            <div>
              <h2 className="text-xl font-bold mb-2">{selected.title}</h2>
              <p className="mb-4 text-[var(--color-text-muted)]">{selected.explanation}</p>

              <h3 className="font-semibold mb-2">Examples</h3>
              <div className="space-y-3">
                {selected.examples.map((ex, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <p className="font-chinese text-lg">{ex.zh}</p>
                    {showPinyin && (
                      <p className="text-sm text-[var(--color-text-muted)]">{ex.pinyin}</p>
                    )}
                    <p className="text-sm mt-1">{ex.en}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[var(--color-text-muted)]">Select a grammar point.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/pages/Grammar.test.jsx`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: grammar reference page with level selector and example display"
```

---

### Task 16: Flashcards Page and FlashCard Component

**Files:**
- Create: `client/src/components/FlashCard.jsx`
- Create: `client/src/components/AudioButton.jsx`
- Create: `client/src/hooks/useSpeech.js`
- Modify: `client/src/pages/Flashcards.jsx` — full implementation
- Test: `client/src/pages/Flashcards.test.jsx`
- Test: `client/src/components/FlashCard.test.jsx`

**Interfaces:**
- Consumes: `api.getDueCards()`, `api.reviewCard()` from Task 13
- Produces: interactive flashcard review session with card flip, quality rating, TTS audio

- [ ] **Step 1: Write the FlashCard component test**

Create `client/src/components/FlashCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlashCard from './FlashCard';

describe('FlashCard', () => {
  const card = {
    id: 1, hanzi: '你好', pinyin: 'nǐ hǎo',
    meaning_en: 'hello', hsk_level: 1,
  };

  it('shows hanzi on front', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    expect(screen.getByText('你好')).toBeDefined();
  });

  it('reveals answer on click', () => {
    render(<FlashCard card={card} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText('Show Answer'));
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

- [ ] **Step 2: Implement useSpeech hook**

Create `client/src/hooks/useSpeech.js`:

```javascript
import { useCallback } from 'react';

export function useSpeech() {
  const speak = useCallback((text, rate = 0.8) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return { speak, stop, supported };
}
```

- [ ] **Step 3: Implement AudioButton component**

Create `client/src/components/AudioButton.jsx`:

```jsx
import { useSpeech } from '../hooks/useSpeech';

export default function AudioButton({ text, rate = 0.8, className = '' }) {
  const { speak, supported } = useSpeech();

  if (!supported) return null;

  return (
    <button
      onClick={() => speak(text, rate)}
      className={`p-1 rounded hover:bg-[var(--color-surface)] transition-colors ${className}`}
      aria-label={`Play pronunciation: ${text}`}
    >
      🔊
    </button>
  );
}
```

- [ ] **Step 4: Implement FlashCard component**

Create `client/src/components/FlashCard.jsx`:

```jsx
import { useState } from 'react';
import AudioButton from './AudioButton';

const RATINGS = [
  { label: 'Again', value: 0, color: 'bg-red-500' },
  { label: 'Hard', value: 3, color: 'bg-orange-500' },
  { label: 'Good', value: 4, color: 'bg-green-500' },
  { label: 'Easy', value: 5, color: 'bg-blue-500' },
];

export default function FlashCard({ card, onRate }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center min-h-[300px] flex flex-col justify-center">
        {/* Front: hanzi */}
        <p className="font-chinese text-5xl md:text-6xl mb-4">{card.hanzi}</p>
        <AudioButton text={card.hanzi} className="mx-auto mb-4" />

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="mt-4 px-6 py-2 rounded-lg bg-[var(--color-vermilion)] text-white text-lg hover:opacity-90"
          >
            Show Answer
          </button>
        ) : (
          <>
            {/* Back: pinyin + meaning */}
            <p className="text-xl text-[var(--color-text-muted)] mb-2">{card.pinyin}</p>
            <p className="text-lg mb-6">{card.meaning_en}</p>

            {/* Rating buttons */}
            <div className="flex justify-center gap-3">
              {RATINGS.map(({ label, value, color }) => (
                <button
                  key={value}
                  onClick={() => {
                    setRevealed(false);
                    onRate(value);
                  }}
                  className={`px-4 py-2 rounded-lg text-white ${color} hover:opacity-90`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
        HSK {card.hsk_level} • {card.status || 'new'}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement Flashcards page**

Replace `client/src/pages/Flashcards.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import FlashCard from '../components/FlashCard';

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    loadDueCards();
  }, []);

  async function loadDueCards() {
    setLoading(true);
    try {
      const data = await api.getDueCards();
      setCards(data.cards);
      if (data.cards.length === 0) setSessionDone(true);
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRate(quality) {
    const card = cards[currentIndex];
    const timeMs = Date.now() - startTime.current;

    try {
      await api.reviewCard(card.id, quality, timeMs);
      setReviewed(r => r + 1);
    } catch (err) {
      console.error('Review failed:', err);
    }

    startTime.current = Date.now();

    if (currentIndex + 1 >= cards.length) {
      setSessionDone(true);
      // Log study time
      const totalMs = Date.now() - startTime.current;
      api.logTime(totalMs).catch(() => {});
    } else {
      setCurrentIndex(i => i + 1);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-[var(--color-text-muted)]">Loading cards...</div>;
  }

  if (sessionDone) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold mb-4">🎉 Session Complete!</h1>
        <p className="text-lg text-[var(--color-text-muted)] mb-4">
          You reviewed {reviewed} cards.
        </p>
        <button
          onClick={() => { setSessionDone(false); setCurrentIndex(0); setReviewed(0); loadDueCards(); }}
          className="px-6 py-2 rounded-lg bg-[var(--color-vermilion)] text-white hover:opacity-90"
        >
          Review Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flashcards 卡片</h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[var(--color-border)] rounded-full h-2 mb-6">
        <div
          className="bg-[var(--color-vermilion)] h-2 rounded-full transition-all"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      <FlashCard card={cards[currentIndex]} onRate={handleRate} />
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run client/src/components/FlashCard.test.jsx client/src/pages/Flashcards.test.jsx`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: flashcards page with SRS review flow, card flip, and audio"
```

---

### Task 17: Exercises Page and ExerciseRenderer

**Files:**
- Create: `client/src/components/ExerciseRenderer.jsx`
- Create: `client/src/hooks/useExercise.js`
- Modify: `client/src/pages/Exercises.jsx` — full implementation
- Test: `client/src/components/ExerciseRenderer.test.jsx`

**Interfaces:**
- Consumes: `api.generateExercise()`, `api.checkExercise()` from Task 13
- Produces: exercise type selector, dynamic exercise rendering for all 5 types, answer checking with feedback

- [ ] **Step 1: Write ExerciseRenderer test**

Create `client/src/components/ExerciseRenderer.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExerciseRenderer from './ExerciseRenderer';

describe('ExerciseRenderer', () => {
  it('renders fill_blank exercise', () => {
    const exercise = {
      id: 1, type: 'fill_blank',
      sentence: '我___去学校。',
      options: ['每天', '昨天', '已经', '可能'],
      correct: '每天',
    };
    render(<ExerciseRenderer exercise={exercise} onAnswer={vi.fn()} />);
    expect(screen.getByText(/我.*去学校/)).toBeDefined();
    expect(screen.getByText('每天')).toBeDefined();
  });

  it('renders multiple_choice exercise', () => {
    const exercise = {
      id: 1, type: 'multiple_choice',
      question: 'What does 高兴 mean?',
      options: ['sad', 'happy', 'angry', 'tired'],
      correct: 'happy',
    };
    render(<ExerciseRenderer exercise={exercise} onAnswer={vi.fn()} />);
    expect(screen.getByText('What does 高兴 mean?')).toBeDefined();
    expect(screen.getByText('happy')).toBeDefined();
  });

  it('renders matching exercise', () => {
    const exercise = {
      id: 1, type: 'matching',
      pairs: [
        { left: '学生', right: 'student' },
        { left: '老师', right: 'teacher' },
      ],
    };
    render(<ExerciseRenderer exercise={exercise} onAnswer={vi.fn()} />);
    expect(screen.getByText('学生')).toBeDefined();
    expect(screen.getByText('student')).toBeDefined();
  });

  it('calls onAnswer when option selected in multiple_choice', () => {
    const onAnswer = vi.fn();
    const exercise = {
      id: 1, type: 'multiple_choice',
      question: 'What does 高兴 mean?',
      options: ['sad', 'happy', 'angry', 'tired'],
      correct: 'happy',
    };
    render(<ExerciseRenderer exercise={exercise} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText('happy'));
    expect(onAnswer).toHaveBeenCalledWith('happy');
  });
});
```

- [ ] **Step 2: Implement useExercise hook**

Create `client/src/hooks/useExercise.js`:

```javascript
import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useExercise() {
  const [exercise, setExercise] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (type, level) => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await api.generateExercise(type, level);
      setExercise(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const check = useCallback(async (answer) => {
    if (!exercise?.id) return;
    try {
      const data = await api.checkExercise(exercise.id, answer);
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }, [exercise]);

  return { exercise, result, loading, error, generate, check };
}
```

- [ ] **Step 3: Implement ExerciseRenderer component**

Create `client/src/components/ExerciseRenderer.jsx`:

```jsx
import { useState } from 'react';
import AudioButton from './AudioButton';

export default function ExerciseRenderer({ exercise, onAnswer, result }) {
  switch (exercise.type) {
    case 'fill_blank':
      return <FillBlank exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'multiple_choice':
      return <MultipleChoice exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'reorder':
      return <Reorder exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'dictation':
      return <Dictation exercise={exercise} onAnswer={onAnswer} result={result} />;
    case 'matching':
      return <Matching exercise={exercise} onAnswer={onAnswer} result={result} />;
    default:
      return <p>Unknown exercise type: {exercise.type}</p>;
  }
}

function FillBlank({ exercise, onAnswer, result }) {
  const parts = exercise.sentence.split('___');
  return (
    <div>
      <p className="text-xl font-chinese mb-4">
        {parts[0]}<span className="border-b-2 border-[var(--color-vermilion)] px-2">___</span>{parts[1]}
      </p>
      <OptionButtons options={exercise.options} onAnswer={onAnswer} result={result} correct={exercise.correct} />
      {result && exercise.explanation && (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{exercise.explanation}</p>
      )}
    </div>
  );
}

function MultipleChoice({ exercise, onAnswer, result }) {
  return (
    <div>
      <p className="text-xl mb-4">{exercise.question}</p>
      <OptionButtons options={exercise.options} onAnswer={onAnswer} result={result} correct={exercise.correct} />
    </div>
  );
}

function Reorder({ exercise, onAnswer, result }) {
  const [selected, setSelected] = useState([]);
  const [remaining, setRemaining] = useState([...exercise.words]);

  function handleSelect(word, idx) {
    setSelected(s => [...s, word]);
    setRemaining(r => r.filter((_, i) => i !== idx));
  }

  function handleRemove(idx) {
    const word = selected[idx];
    setSelected(s => s.filter((_, i) => i !== idx));
    setRemaining(r => [...r, word]);
  }

  function handleSubmit() {
    onAnswer(selected.join(''));
  }

  return (
    <div>
      <p className="text-sm text-[var(--color-text-muted)] mb-2">{exercise.translation}</p>

      {/* Selected words */}
      <div className="flex flex-wrap gap-2 min-h-[48px] p-3 mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {selected.map((word, i) => (
          <button key={i} onClick={() => handleRemove(i)}
            className="px-3 py-1 rounded bg-[var(--color-vermilion)] text-white font-chinese">
            {word}
          </button>
        ))}
      </div>

      {/* Remaining words */}
      <div className="flex flex-wrap gap-2 mb-4">
        {remaining.map((word, i) => (
          <button key={i} onClick={() => handleSelect(word, i)}
            className="px-3 py-1 rounded border border-[var(--color-border)] font-chinese hover:bg-[var(--color-surface)]">
            {word}
          </button>
        ))}
      </div>

      <button onClick={handleSubmit} disabled={remaining.length > 0}
        className="px-4 py-2 rounded-lg bg-[var(--color-gold)] text-white disabled:opacity-50">
        Check
      </button>
    </div>
  );
}

function Dictation({ exercise, onAnswer, result }) {
  const [input, setInput] = useState('');

  return (
    <div>
      <p className="text-sm text-[var(--color-text-muted)] mb-2">Listen and type what you hear:</p>
      <AudioButton text={exercise.audio_text} rate={0.7} className="text-2xl mb-4" />

      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={exercise.accept_pinyin ? 'Type in characters or pinyin...' : 'Type in characters...'}
        className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-chinese text-lg mb-4"
      />

      <button onClick={() => onAnswer(input)}
        className="px-4 py-2 rounded-lg bg-[var(--color-gold)] text-white">
        Check
      </button>

      {result && (
        <div className="mt-3">
          <p className="font-chinese text-lg">{exercise.audio_text}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{exercise.pinyin}</p>
        </div>
      )}
    </div>
  );
}

function Matching({ exercise, onAnswer, result }) {
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [matched, setMatched] = useState([]);

  function handleLeftClick(left) {
    setSelectedLeft(left);
  }

  function handleRightClick(right) {
    if (selectedLeft === null) return;
    const pair = exercise.pairs.find(p => p.left === selectedLeft && p.right === right);
    if (pair) {
      setMatched(m => [...m, pair]);
    }
    setSelectedLeft(null);
    if (matched.length + 1 === exercise.pairs.length) {
      onAnswer('matched');
    }
  }

  const unmatchedLeft = exercise.pairs.filter(p => !matched.find(m => m.left === p.left));
  const unmatchedRight = exercise.pairs.filter(p => !matched.find(m => m.right === p.right));

  return (
    <div>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">Match the Chinese with the English:</p>
      <div className="flex gap-8">
        <div className="space-y-2">
          {unmatchedLeft.map(p => (
            <button key={p.left} onClick={() => handleLeftClick(p.left)}
              className={`block w-full px-4 py-2 rounded-lg border font-chinese text-lg ${
                selectedLeft === p.left ? 'border-[var(--color-vermilion)] bg-red-50' : 'border-[var(--color-border)]'
              }`}>
              {p.left}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {unmatchedRight.map(p => (
            <button key={p.right} onClick={() => handleRightClick(p.right)}
              className="block w-full px-4 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">
              {p.right}
            </button>
          ))}
        </div>
      </div>
      {matched.length > 0 && (
        <div className="mt-4 text-sm text-green-600">
          Matched: {matched.length} / {exercise.pairs.length}
        </div>
      )}
    </div>
  );
}

function OptionButtons({ options, onAnswer, result, correct }) {
  const [selected, setSelected] = useState(null);

  function handleClick(opt) {
    if (result) return;
    setSelected(opt);
    onAnswer(opt);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(opt => {
        let style = 'border border-[var(--color-border)] hover:bg-[var(--color-surface)]';
        if (result && opt === correct) style = 'bg-green-500 text-white';
        else if (result && opt === selected && opt !== correct) style = 'bg-red-500 text-white';
        return (
          <button key={opt} onClick={() => handleClick(opt)}
            className={`px-4 py-3 rounded-lg font-chinese text-lg ${style}`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement Exercises page**

Replace `client/src/pages/Exercises.jsx`:

```jsx
import { useState } from 'react';
import { useExercise } from '../hooks/useExercise';
import ExerciseRenderer from '../components/ExerciseRenderer';

const TYPES = [
  { value: 'fill_blank', label: 'Fill in the Blank', emoji: '✏️' },
  { value: 'multiple_choice', label: 'Multiple Choice', emoji: '🔤' },
  { value: 'reorder', label: 'Sentence Reorder', emoji: '🔀' },
  { value: 'dictation', label: 'Dictation', emoji: '🎧' },
  { value: 'matching', label: 'Matching', emoji: '🔗' },
];

export default function Exercises() {
  const [level, setLevel] = useState(1);
  const { exercise, result, loading, error, generate, check } = useExercise();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Exercises 练习</h1>

      {/* Level selector */}
      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map(l => (
          <button key={l} onClick={() => setLevel(l)}
            className={`px-3 py-1 rounded-lg text-sm ${
              level === l
                ? 'bg-[var(--color-vermilion)] text-white'
                : 'bg-[var(--color-surface)] border border-[var(--color-border)]'
            }`}>
            HSK {l}
          </button>
        ))}
      </div>

      {/* Type selector */}
      {!exercise && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TYPES.map(({ value, label, emoji }) => (
            <button key={value} onClick={() => generate(value, level)}
              disabled={loading}
              className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-vermilion)] transition-colors text-left">
              <span className="text-2xl">{emoji}</span>
              <p className="font-semibold mt-2">{label}</p>
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-center py-8 text-[var(--color-text-muted)]">Generating exercise...</p>}
      {error && <p className="text-center py-4 text-red-500">{error}</p>}

      {/* Exercise */}
      {exercise && !loading && (
        <div className="max-w-xl mx-auto">
          <ExerciseRenderer exercise={exercise} onAnswer={check} result={result} />

          {result && (
            <div className={`mt-4 p-3 rounded-lg ${result.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.correct ? '✅ Correct!' : `❌ Incorrect. The answer is: ${result.correct_answer}`}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => generate(exercise.type, level)}
              className="px-4 py-2 rounded-lg bg-[var(--color-vermilion)] text-white hover:opacity-90">
              Next Exercise
            </button>
            <button onClick={() => { /* reset */ window.location.reload(); }}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">
              Change Type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/components/ExerciseRenderer.test.jsx`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: exercises page with all 5 exercise types and answer checking"
```

---

### Task 18: Readings Page and ReadingView

**Files:**
- Create: `client/src/components/ReadingView.jsx`
- Create: `client/src/components/PinyinToggle.jsx`
- Modify: `client/src/pages/Readings.jsx` — full implementation
- Test: `client/src/components/ReadingView.test.jsx`

**Interfaces:**
- Consumes: `api.getReadings()`, `api.getReading(id)`, `api.generateReading()` from Task 13
- Produces: reading list, reading detail view with pinyin toggle, comprehension questions, word tap-to-add

- [ ] **Step 1: Write ReadingView test**

Create `client/src/components/ReadingView.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadingView from './ReadingView';

describe('ReadingView', () => {
  const reading = {
    id: 1, title: '你好', content: '你好，我叫小明。',
    pinyin_text: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.',
    questions: [
      { question: '他叫什么？', options: ['小明', '小红', '小李', '小王'], correct: '小明' },
    ],
  };

  it('renders title and content', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('你好')).toBeDefined();
    expect(screen.getByText('你好，我叫小明。')).toBeDefined();
  });

  it('toggles pinyin visibility', () => {
    render(<ReadingView reading={reading} />);
    fireEvent.click(screen.getByText('Show Pinyin'));
    expect(screen.getByText('Nǐ hǎo, wǒ jiào Xiǎo Míng.')).toBeDefined();
  });

  it('renders comprehension questions', () => {
    render(<ReadingView reading={reading} />);
    expect(screen.getByText('他叫什么？')).toBeDefined();
    expect(screen.getByText('小明')).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement PinyinToggle component**

Create `client/src/components/PinyinToggle.jsx`:

```jsx
export default function PinyinToggle({ show, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="text-sm px-3 py-1 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]"
    >
      {show ? 'Hide Pinyin' : 'Show Pinyin'}
    </button>
  );
}
```

- [ ] **Step 3: Implement ReadingView component**

Create `client/src/components/ReadingView.jsx`:

```jsx
import { useState } from 'react';
import AudioButton from './AudioButton';
import PinyinToggle from './PinyinToggle';

export default function ReadingView({ reading }) {
  const [showPinyin, setShowPinyin] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function handleAnswer(qIndex, answer) {
    if (submitted) return;
    setAnswers(a => ({ ...a, [qIndex]: answer }));
  }

  function handleSubmit() {
    setSubmitted(true);
  }

  const score = submitted
    ? reading.questions.filter((q, i) => answers[i] === q.correct).length
    : null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-2xl font-bold font-chinese">{reading.title}</h2>
        <AudioButton text={reading.content} />
        <PinyinToggle show={showPinyin} onToggle={() => setShowPinyin(s => !s)} />
      </div>

      {/* Content */}
      <div className="p-6 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] mb-6">
        <p className="font-chinese text-xl leading-relaxed">{reading.content}</p>
        {showPinyin && reading.pinyin_text && (
          <p className="mt-2 text-[var(--color-text-muted)] text-sm">{reading.pinyin_text}</p>
        )}
      </div>

      {/* Questions */}
      <h3 className="font-semibold mb-3">Comprehension Questions</h3>
      <div className="space-y-4">
        {reading.questions.map((q, qi) => (
          <div key={qi} className="p-4 rounded-lg border border-[var(--color-border)]">
            <p className="font-chinese mb-2">{q.question}</p>
            <div className="grid grid-cols-2 gap-2">
              {q.options.map(opt => {
                let style = 'border border-[var(--color-border)]';
                if (submitted && opt === q.correct) style = 'bg-green-500 text-white';
                else if (submitted && answers[qi] === opt && opt !== q.correct) style = 'bg-red-500 text-white';
                else if (answers[qi] === opt) style = 'border-[var(--color-vermilion)] bg-red-50';
                return (
                  <button key={opt} onClick={() => handleAnswer(qi, opt)}
                    className={`px-3 py-2 rounded-lg font-chinese ${style}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!submitted && reading.questions.length > 0 && (
        <button onClick={handleSubmit}
          disabled={Object.keys(answers).length < reading.questions.length}
          className="mt-4 px-6 py-2 rounded-lg bg-[var(--color-gold)] text-white disabled:opacity-50">
          Submit Answers
        </button>
      )}

      {score !== null && (
        <div className="mt-4 p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-center">
          <p className="text-xl font-bold">Score: {score} / {reading.questions.length}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement Readings page**

Replace `client/src/pages/Readings.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ReadingView from '../components/ReadingView';

const FORMATS = [
  { value: 'short_text', label: 'Short Text', emoji: '📝' },
  { value: 'story', label: 'Story', emoji: '📖' },
  { value: 'dialogue', label: 'Dialogue', emoji: '💬' },
];

export default function Readings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [reading, setReading] = useState(null);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (id) {
      loadReading(id);
    } else {
      loadReadings();
    }
  }, [id, level]);

  async function loadReadings() {
    setLoading(true);
    try {
      const data = await api.getReadings({ level });
      setReadings(data.readings);
    } catch (err) {
      console.error('Failed to load readings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadReading(readingId) {
    setLoading(true);
    try {
      const data = await api.getReading(readingId);
      setReading(data);
    } catch (err) {
      console.error('Failed to load reading:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(format) {
    setGenerating(true);
    try {
      const data = await api.generateReading(level, format);
      setReading(data);
    } catch (err) {
      console.error('Failed to generate reading:', err);
    } finally {
      setGenerating(false);
    }
  }

  // Detail view
  if (reading) {
    return (
      <div>
        <button onClick={() => { setReading(null); navigate('/readings'); }}
          className="mb-4 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          ← Back to readings
        </button>
        <ReadingView reading={reading} />
      </div>
    );
  }

  // List view
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Readings 阅读</h1>

      {/* Level selector */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map(l => (
          <button key={l} onClick={() => setLevel(l)}
            className={`px-3 py-1 rounded-lg text-sm ${
              level === l ? 'bg-[var(--color-vermilion)] text-white' : 'bg-[var(--color-surface)] border border-[var(--color-border)]'
            }`}>
            HSK {l}
          </button>
        ))}
      </div>

      {/* Generate new */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Generate New Reading</h2>
        <div className="flex gap-3">
          {FORMATS.map(({ value, label, emoji }) => (
            <button key={value} onClick={() => handleGenerate(value)} disabled={generating}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-vermilion)] disabled:opacity-50">
              {emoji} {label}
            </button>
          ))}
        </div>
        {generating && <p className="mt-2 text-sm text-[var(--color-text-muted)]">Generating...</p>}
      </div>

      {/* Reading list */}
      <h2 className="font-semibold mb-2">Saved Readings</h2>
      {loading ? (
        <p className="text-[var(--color-text-muted)]">Loading...</p>
      ) : readings.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No readings yet. Generate one above!</p>
      ) : (
        <div className="space-y-2">
          {readings.map(r => (
            <button key={r.id} onClick={() => navigate(`/readings/${r.id}`)}
              className="w-full text-left p-4 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">
              <div className="flex items-center justify-between">
                <span className="font-chinese text-lg">{r.title}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  HSK {r.hsk_level} • {r.format}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/components/ReadingView.test.jsx`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: readings page with generation, list, and interactive reading view"
```

---

### Task 19: Dashboard Page

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` — full implementation
- Test: `client/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `api.getDashboard()` from Task 13
- Produces: dashboard with streak display, SRS distribution chart, heatmap, daily stats, quick actions

- [ ] **Step 1: Write the test**

Create `client/src/pages/Dashboard.test.jsx`:

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
      heatmap: [
        { date: '2026-07-27', activity: 5 },
        { date: '2026-07-28', activity: 3 },
      ],
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
}));

describe('Dashboard', () => {
  it('renders streak info', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('5')).toBeDefined();
    });
  });

  it('renders cards overview', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/15/)).toBeDefined(); // due cards
    });
  });
});
```

- [ ] **Step 2: Implement Dashboard page**

Replace `client/src/pages/Dashboard.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { api } from '../services/api';

const STATUS_COLORS = {
  new: '#6366f1',
  learning: '#f59e0b',
  review: '#3b82f6',
  mastered: '#22c55e',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(err => console.error('Dashboard load failed:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-center py-8 text-[var(--color-text-muted)]">Loading dashboard...</p>;
  if (!data) return <p className="text-center py-8 text-red-500">Failed to load dashboard.</p>;

  const pieData = Object.entries(data.cards.by_status || {}).map(([name, value]) => ({ name, value }));
  const minutes = Math.round((data.today.time_spent_ms || 0) / 60000);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard 仪表盘</h1>

      {/* Streak + Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="🔥 Streak" value={data.streak.current} subtitle={`Best: ${data.streak.longest}`} />
        <StatCard label="📚 Due Today" value={data.cards.due} subtitle={`of ${data.cards.total} total`} />
        <StatCard label="✅ Reviewed" value={data.today.cards_reviewed} subtitle={`${data.today.cards_new} new`} />
        <StatCard label="⏱️ Time" value={`${minutes}m`} subtitle="today" />
      </div>

      {/* SRS Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <h2 className="font-semibold mb-4">SRS Distribution</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                  dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#999'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--color-text-muted)] text-center py-8">No cards yet. Add words from the Word Explorer!</p>
          )}
        </div>

        {/* Activity Heatmap (simplified) */}
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <h2 className="font-semibold mb-4">Activity (Last 90 Days)</h2>
          <div className="flex flex-wrap gap-1">
            {data.heatmap.map((day) => (
              <div key={day.date} title={`${day.date}: ${day.activity} activities`}
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: day.activity === 0 ? 'var(--color-border)'
                    : day.activity <= 2 ? '#bbf7d0'
                    : day.activity <= 5 ? '#4ade80'
                    : '#16a34a',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] mb-6">
        <h2 className="font-semibold mb-3">Today's Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat label="Cards Reviewed" value={data.today.cards_reviewed} />
          <MiniStat label="New Cards" value={data.today.cards_new} />
          <MiniStat label="Exercises" value={data.today.exercises_done} />
          <MiniStat label="Readings" value={data.today.readings_done} />
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="font-semibold mb-3">Quick Actions</h2>
      <div className="flex flex-wrap gap-3">
        <Link to="/flashcards"
          className="px-4 py-2 rounded-lg bg-[var(--color-vermilion)] text-white hover:opacity-90">
          Start Review ({data.cards.due} due)
        </Link>
        <Link to="/exercises"
          className="px-4 py-2 rounded-lg bg-[var(--color-gold)] text-white hover:opacity-90">
          Practice Exercises
        </Link>
        <Link to="/readings"
          className="px-4 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]">
          Read Something
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run client/src/pages/Dashboard.test.jsx`
Expected: 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: dashboard with streak, SRS chart, heatmap, and quick actions"
```

---

### Task 20: Settings Page

**Files:**
- Modify: `client/src/pages/Settings.jsx` — full implementation
- Test: `client/src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: `api.getSettings()`, `api.updateSettings()` from Task 13
- Produces: settings form with theme, HSK level, cards per day, AI provider, and API key

- [ ] **Step 1: Write the test**

Create `client/src/pages/Settings.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Settings from './Settings';

vi.mock('../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({
      theme: 'light', current_level: 1, cards_per_day: 20,
      ai_provider: 'none', api_key: '',
    }),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

describe('Settings page', () => {
  it('renders settings form', async () => {
    render(<BrowserRouter><Settings /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Theme/i)).toBeDefined();
      expect(screen.getByText(/HSK Level/i)).toBeDefined();
      expect(screen.getByText(/Cards Per Day/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Implement Settings page**

Replace `client/src/pages/Settings.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { setTheme } = useAppStore();

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setTheme(updated.theme);
      setMessage('Settings saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setSettings(s => ({ ...s, [field]: value }));
  }

  if (loading) return <p className="text-center py-8 text-[var(--color-text-muted)]">Loading settings...</p>;
  if (!settings) return <p className="text-center py-8 text-red-500">Failed to load settings.</p>;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings 设置</h1>

      <div className="space-y-6">
        {/* Theme */}
        <div>
          <label className="block text-sm font-semibold mb-1">Theme</label>
          <select value={settings.theme} onChange={e => updateField('theme', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        {/* HSK Level */}
        <div>
          <label className="block text-sm font-semibold mb-1">HSK Level</label>
          <select value={settings.current_level} onChange={e => updateField('current_level', parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <option value={1}>HSK 1</option>
            <option value={2}>HSK 2</option>
            <option value={3}>HSK 3</option>
          </select>
        </div>

        {/* Cards per day */}
        <div>
          <label className="block text-sm font-semibold mb-1">Cards Per Day</label>
          <input type="number" min={1} max={200} value={settings.cards_per_day}
            onChange={e => updateField('cards_per_day', parseInt(e.target.value, 10) || 20)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" />
        </div>

        {/* AI Provider */}
        <div>
          <label className="block text-sm font-semibold mb-1">AI Provider</label>
          <select value={settings.ai_provider} onChange={e => updateField('ai_provider', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <option value="none">None (use cached exercises only)</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        {/* API Key */}
        {settings.ai_provider !== 'none' && (
          <div>
            <label className="block text-sm font-semibold mb-1">API Key</label>
            <input type="password" value={settings.api_key || ''}
              onChange={e => updateField('api_key', e.target.value)}
              placeholder="Enter your API key..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {settings.ai_provider === 'deepseek'
                ? 'Get your key at platform.deepseek.com'
                : 'Get your key at aistudio.google.com'}
            </p>
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full px-4 py-2 rounded-lg bg-[var(--color-vermilion)] text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {message && (
          <p className={`text-sm text-center ${message.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run client/src/pages/Settings.test.jsx`
Expected: 1 test PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: settings page with theme, level, AI provider configuration"
```

---

### Task 21: Final Integration and Smoke Test

**Files:**
- No new files
- Review and verify all existing files

**Interfaces:**
- Consumes: all tasks
- Produces: fully working application

- [ ] **Step 1: Run full migration and seed**

Run: `npm run migrate && npm run seed`
Expected: "Migrations complete." and "Seeding complete."

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS (backend + frontend)

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`
Expected: Both Vite (port 5173) and Express (port 3001) start successfully.

- [ ] **Step 4: Smoke test API endpoints**

Run the following and verify 200 responses:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/words?level=1
curl http://localhost:3001/api/grammar/1
curl http://localhost:3001/api/flashcards/stats
curl http://localhost:3001/api/stats/dashboard
curl http://localhost:3001/api/settings
```

- [ ] **Step 5: Verify frontend loads**

Open `http://localhost:5173` in a browser. Verify:
- Navigation renders (sidebar on desktop, bottom bar on mobile)
- Dashboard loads with stats (zeros for fresh database)
- Word Explorer shows HSK words from seed data
- Grammar page shows grammar points
- Theme toggle switches between light and dark
- Settings page renders the form

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: integration verification — all systems working"
```

---

## Appendix: Complete server/app.js Reference

The final `server/app.js` (Task 12) is the source of truth for all route mounting. Verify all routes are mounted:

```
GET  /api/health
GET  /api/words
GET  /api/words/:id
GET  /api/grammar/:level
GET  /api/grammar/:level/:id
GET  /api/flashcards/due
POST /api/flashcards/:id/review
GET  /api/flashcards/stats
POST /api/flashcards/add
POST /api/exercises/generate
POST /api/exercises/:id/check
GET  /api/exercises/history
GET  /api/readings
GET  /api/readings/:id
POST /api/readings/generate
GET  /api/stats/dashboard
GET  /api/stats/streak
POST /api/stats/log-time
GET  /api/settings
PUT  /api/settings
```
