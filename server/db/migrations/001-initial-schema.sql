CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_words_unique_entry
ON words(hanzi, pinyin, meaning_en, hsk_level);

CREATE TABLE IF NOT EXISTS grammar_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hsk_level INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 6),
  title TEXT NOT NULL,
  pattern TEXT,
  explanation TEXT NOT NULL,
  examples TEXT NOT NULL DEFAULT '[]',
  order_idx INTEGER
);

CREATE INDEX IF NOT EXISTS idx_grammar_hsk_level ON grammar_points(hsk_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grammar_unique_entry
ON grammar_points(hsk_level, title);

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
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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

INSERT OR IGNORE INTO users (id, username, created_at, settings)
VALUES (
  1,
  'default',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  json('{"theme":"light","current_level":1,"cards_per_day":20,"ai_provider":"none","api_key":""}')
);