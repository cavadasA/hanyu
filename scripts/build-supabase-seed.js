import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadExercises } from './build-exercises.js';
import { loadReadings } from './build-readings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const sqliteSeedDir = join(rootDir, 'server', 'db', 'seeds');
const supabaseDir = join(rootDir, 'supabase');
const outputPath = join(supabaseDir, 'seed.sql');

function readJson(fileName) {
  return JSON.parse(readFileSync(join(sqliteSeedDir, fileName), 'utf8'));
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInteger(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'null';
  }

  return String(Math.trunc(numeric));
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? null))}::jsonb`;
}

function sqlTextArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return 'null';
  }

  return `array[${value.map(sqlString).join(', ')}]::text[]`;
}

function buildInsert(tableName, columns, rows, onConflict = '') {
  if (!rows.length) {
    return `-- ${tableName}: no rows\n`;
  }

  const header = `insert into public.${tableName} (${columns.join(', ')})\nvalues\n`;
  const values = rows
    .map((row) => `  (${row.join(', ')})`)
    .join(',\n');
  const suffix = `${onConflict ? `\n${onConflict}` : ''};\n`;
  return `${header}${values}${suffix}`;
}

function buildWordsRows() {
  const rows = [];

  for (const level of [1, 2, 3]) {
    const words = readJson(`hsk${level}-words.json`);

    for (const word of words) {
      rows.push([
        sqlString(word.hanzi),
        sqlString(word.traditional ?? null),
        sqlString(word.pinyin),
        sqlString(word.meaning_en),
        sqlString(word.meaning_es ?? null),
        sqlString(word.classifier ?? null),
        sqlInteger(level),
        sqlString(word.pos ?? null),
        sqlInteger(word.frequency),
        sqlInteger(word.sense_index),
        sqlTextArray(word.variants),
      ]);
    }
  }

  return rows;
}

function buildGrammarRows() {
  const points = readJson('grammar-points.json');

  return points.map((point) => [
    sqlInteger(point.hsk_level),
    sqlString(point.code),
    sqlString(point.group),
    sqlString(point.category),
    sqlString(point.detail),
    sqlString(point.title),
    sqlString(point.pattern ?? null),
    sqlString(point.explanation ?? null),
    sqlJson(point.examples || []),
    sqlTextArray(point.items),
    sqlInteger(point.order_idx ?? null),
  ]);
}

function buildGrammarPrerequisiteRows() {
  const prerequisites = readJson('grammar-prerequisites.json');

  return prerequisites.map((prerequisite) => [
    sqlInteger(prerequisite.hsk_level),
    sqlString(prerequisite.code),
    sqlInteger(prerequisite.requires_level),
    sqlString(prerequisite.requires_code),
  ]);
}

function loadCorpus() {
  const corpus = [];
  for (const level of [1, 2, 3]) {
    corpus.push(...readJson(`hsk${level}-words.json`).map((word) => ({ ...word, hsk_level: level })));
  }
  return corpus;
}

function buildUnitRows() {
  return readJson('units.json').map((unit, index) => [
    sqlString(unit.code),
    sqlInteger(unit.hsk_level),
    sqlString(unit.title),
    sqlString(unit.group),
    sqlString(unit.category),
    unit.patterns.length > 0
      ? `array[${unit.patterns.map(sqlString).join(', ')}]::text[]`
      : `'{}'::text[]`,
    sqlInteger(index + 1),
  ]);
}

function buildUnitWordMemberships() {
  const units = readJson('units.json');
  const corpus = loadCorpus();
  const memberships = [];

  for (const unit of units) {
    for (const wordIndex of unit.word_ids) {
      const word = corpus[wordIndex];
      if (!word) continue;
      memberships.push(
        `  (${sqlInteger(unit.hsk_level)}, ${sqlString(unit.code)}, ${sqlString(word.hanzi)}, ${sqlInteger(word.hsk_level ?? unit.hsk_level)}, ${sqlInteger(word.sense_index ?? null)})`,
      );
    }
  }

  return memberships;
}

function buildUnitSql() {
  const unitRows = buildUnitRows();
  const memberships = buildUnitWordMemberships();
  const unitInsert = buildInsert(
    'unit',
    ['code', 'hsk_level', 'title', '"group"', 'category', 'patterns', 'order_idx'],
    unitRows,
    'on conflict (hsk_level, code) do update set title = excluded.title, patterns = excluded.patterns, order_idx = excluded.order_idx',
  );

  const wordInsert = memberships.length === 0
    ? '-- unit_word: no rows\n'
    : `insert into public.unit_word (hsk_level, code, word_id)
select m.unit_level, m.code, w.id
from (values
${memberships.join(',\n')}
) as m(unit_level, code, hanzi, word_level, sense_index)
join public.words w on w.hanzi = m.hanzi
  and w.hsk_level = m.word_level
  and ((m.sense_index is null and w.sense_index is null) or w.sense_index = m.sense_index)
on conflict do nothing;
`;

  return { sql: `${unitInsert}\n${wordInsert}`, unitCount: unitRows.length, unitWordCount: memberships.length };
}

function buildCharacterRows() {
  return readJson('hsk-characters.json').map((entry) => [
    sqlString(entry.hanzi),
    sqlInteger(entry.hsk_level),
  ]);
}

function buildExerciseRows() {
  const exercises = loadExercises();

  return exercises.map((exercise) => {
    const prompt = {
      type: exercise.type,
      slug: exercise.slug,
      unit_code: exercise.unit_code,
      ...(exercise.prompt || {}),
      explanation: exercise.explanation ?? exercise.prompt?.explanation ?? null,
    };
    const answer = exercise.answer ??
      (exercise.type === 'fill_blank' || exercise.type === 'multiple_choice'
        ? exercise.prompt?.correct
        : exercise.type === 'reorder'
          ? exercise.prompt?.correct_order?.join('')
          : exercise.type === 'dictation'
            ? exercise.prompt?.audio_text
            : 'matched');

    return [
      sqlString(exercise.type),
      sqlInteger(exercise.hsk_level),
      sqlJson(prompt),
      sqlJson(answer),
      sqlString('seed'),
      'null',
    ];
  });
}

function buildReadingRows() {
  return loadReadings().map(reading => [
    sqlString(reading.slug),
    sqlInteger(reading.hsk_level),
    sqlString(reading.format),
    sqlString(reading.title),
    sqlString(reading.topic),
    sqlString(reading.series ?? null),
    sqlInteger(reading.series_index ?? null),
    sqlJson(reading.sentences),
    sqlJson(reading.questions || []),
    sqlTextArray(reading.target_words),
    sqlJson(reading.target_grammar || []),
    sqlString(reading.audio_kind || 'tts'),
    sqlString(reading.audio_url ?? null),
  ]);
}

function buildReadingContentRows() {
  return loadReadings().map(reading => [
    sqlString('reading'),
    sqlInteger(reading.hsk_level),
    sqlString(reading.title),
    sqlString('reading'),
    sqlString(reading.slug),
  ]);
}

function buildReadingTeachingRows() {
  return loadReadings().flatMap(reading => [
    ...(reading.target_words || []).map(target => [
      reading.slug,
      'word',
      target,
      reading.hsk_level,
    ]),
    ...(reading.target_grammar || []).map(target => {
      const code = target?.code;
      const level = target?.level;
      if (typeof code !== 'string' || !code || typeof level !== 'number' || !Number.isInteger(level)) {
        throw new Error(`Invalid grammar target in ${reading.slug}`);
      }
      return [reading.slug, 'grammar', code, level];
    }),
  ]);
}

function buildReadingTeachesSql() {
  const rows = buildReadingTeachingRows();
  if (!rows.length) return '-- content_teaches: no rows\n';

  const values = rows
    .map(row => `  (${sqlString(row[0])}, ${sqlString(row[1])}, ${sqlString(row[2])}, ${sqlInteger(row[3])})`)
    .join(',\n');

  return `with reading_targets (slug, target_kind, target_value, target_level) as (\n` +
    `  values\n${values}\n` +
    `), resolved as (\n` +
    `  select ci.id as content_id, 'word'::public.learning_target_kind as target_kind, w.id as target_id\n` +
    `  from reading_targets t\n` +
    `  join public.content_item ci on ci.source_table = 'reading' and ci.source_id = t.slug\n` +
    `  join lateral (\n` +
    `    select w.id\n` +
    `    from public.words w\n` +
    `    join public.reading r on r.slug = t.slug\n` +
    `    where t.target_kind = 'word' and w.hanzi = t.target_value and w.hsk_level <= r.hsk_level\n` +
    `    order by w.hsk_level desc, coalesce(w.sense_index, 0), w.id\n` +
    `    limit 1\n` +
    `  ) w on true\n` +
    `  union all\n` +
    `  select ci.id, 'grammar'::public.learning_target_kind, g.id\n` +
    `  from reading_targets t\n` +
    `  join public.content_item ci on ci.source_table = 'reading' and ci.source_id = t.slug\n` +
    `  join public.grammar_points g on g.code = t.target_value and g.hsk_level = t.target_level\n` +
    `)\n` +
    `insert into public.content_teaches (content_id, target_kind, target_id, role)\n` +
    `select distinct content_id, target_kind, target_id, 'target'::public.teaches_role\n` +
    `from resolved\n` +
    `on conflict (content_id, target_kind, target_id) do update set role = excluded.role;\n`;
}

export function buildSeedSql() {
  const wordsRows = buildWordsRows();
  const characterRows = buildCharacterRows();
  const grammarRows = buildGrammarRows();
  const grammarPrerequisiteRows = buildGrammarPrerequisiteRows();
  const unitSql = buildUnitSql();
  const exerciseRows = buildExerciseRows();
  const readingRows = buildReadingRows();
  const readingContentRows = buildReadingContentRows();

  const sql = [
    '-- Generated by scripts/build-supabase-seed.js',
    '-- Source: server/db/seeds/*.json',
    '',
    'begin;',
    '',
    buildInsert(
      'hsk_characters',
      ['hanzi', 'hsk_level'],
      characterRows,
      'on conflict (hanzi) do update set hsk_level = excluded.hsk_level',
    ),
    buildInsert(
      'words',
      [
        'hanzi',
        'traditional',
        'pinyin',
        'meaning_en',
        'meaning_es',
        'classifier',
        'hsk_level',
        'pos',
        'frequency',
        'sense_index',
        'variants',
      ],
      wordsRows,
      'on conflict (hanzi, hsk_level, coalesce(sense_index, 0)) do update set traditional = excluded.traditional, pinyin = excluded.pinyin, meaning_en = excluded.meaning_en, meaning_es = excluded.meaning_es, classifier = excluded.classifier, pos = excluded.pos, frequency = excluded.frequency, sense_index = excluded.sense_index, variants = excluded.variants',
    ),
    buildInsert(
      'grammar_points',
      ['hsk_level', 'code', '"group"', 'category', 'detail', 'title', 'pattern', 'explanation', 'examples', 'items', 'order_idx'],
      grammarRows,
      'on conflict (hsk_level, code) do update set "group" = excluded."group", category = excluded.category, detail = excluded.detail, title = excluded.title, pattern = excluded.pattern, explanation = excluded.explanation, examples = excluded.examples, items = excluded.items, order_idx = excluded.order_idx',
    ),
    buildInsert(
      'grammar_prerequisite',
      ['hsk_level', 'code', 'requires_level', 'requires_code'],
      grammarPrerequisiteRows,
      'on conflict do nothing',
    ),
    unitSql.sql,
    buildInsert(
      'generated_exercises',
      ['type', 'hsk_level', 'prompt', 'answer', 'source_model', 'created_by'],
      exerciseRows,
      'on conflict do nothing'
    ),
    buildInsert(
      'reading',
      ['slug', 'hsk_level', 'format', 'title', 'topic', 'series', 'series_index', 'sentences', 'questions', 'target_words', 'target_grammar', 'audio_kind', 'audio_url'],
      readingRows,
      'on conflict (slug) do update set hsk_level = excluded.hsk_level, format = excluded.format, title = excluded.title, topic = excluded.topic, series = excluded.series, series_index = excluded.series_index, sentences = excluded.sentences, questions = excluded.questions, target_words = excluded.target_words, target_grammar = excluded.target_grammar, audio_kind = excluded.audio_kind, audio_url = excluded.audio_url',
    ),
    buildInsert(
      'content_item',
      ['kind', 'hsk_level', 'title', 'source_table', 'source_id'],
      readingContentRows,
      'on conflict (source_table, source_id) do update set hsk_level = excluded.hsk_level, title = excluded.title',
    ),
    buildReadingTeachesSql(),
    'commit;',
    '',
  ].join('\n');

  return {
    sql,
    counts: {
      words: wordsRows.length,
      characters: characterRows.length,
      grammar_points: grammarRows.length,
      grammar_prerequisites: grammarPrerequisiteRows.length,
      units: unitSql.unitCount,
      unit_words: unitSql.unitWordCount,
      generated_exercises: exerciseRows.length,
      readings: readingRows.length,
      reading_content_items: readingContentRows.length,
      reading_teaches: buildReadingTeachingRows().length,
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith('build-supabase-seed.js')) {
  const generated = buildSeedSql();
  mkdirSync(supabaseDir, { recursive: true });
  writeFileSync(outputPath, generated.sql, 'utf8');

  console.log(`Generated ${outputPath}`);
  console.log(generated.counts);
}
