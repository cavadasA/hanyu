import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function seedDatabase(db) {
  const seedDir = join(__dirname, 'seeds');

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

  const grammarPath = join(seedDir, 'grammar-points.json');
  const grammarPoints = JSON.parse(readFileSync(grammarPath, 'utf-8'));
  const insertGrammar = db.prepare(`
    INSERT OR IGNORE INTO grammar_points (hsk_level, title, pattern, explanation, examples, order_idx)
    VALUES (@hsk_level, @title, @pattern, @explanation, @examples, @order_idx)
  `);
  const insertGrammarMany = db.transaction((items) => {
    for (const point of items) {
      insertGrammar.run({
        ...point,
        pattern: point.pattern ?? null,
        examples: JSON.stringify(point.examples),
      });
    }
  });

  insertGrammarMany(grammarPoints);

  const exercisesPath = join(seedDir, 'exercises-pool.json');
  const exercises = JSON.parse(readFileSync(exercisesPath, 'utf-8'));
  const insertExercise = db.prepare(`
    INSERT INTO exercises (type, hsk_level, prompt, answer, source_model)
    SELECT @type, @hsk_level, @prompt, @answer, 'seed'
    WHERE NOT EXISTS (
      SELECT 1
      FROM exercises
      WHERE type = @type
        AND hsk_level = @hsk_level
        AND prompt = @prompt
        AND answer = @answer
        AND COALESCE(source_model, '') = 'seed'
    )
  `);
  const insertExerciseMany = db.transaction((items) => {
    for (const exercise of items) {
      insertExercise.run({
        type: exercise.type,
        hsk_level: exercise.hsk_level,
        prompt: JSON.stringify(exercise.prompt),
        answer: exercise.answer,
      });
    }
  });

  insertExerciseMany(exercises);
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const { getDb } = await import('./index.js');
  const db = getDb();
  seedDatabase(db);
  console.log('Seeding complete.');
}