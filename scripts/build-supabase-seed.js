import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadExercises } from './build-exercises.js';
import { loadReadingAudio, loadReadings, loadSeries, properNounsFor } from './build-readings.js';
import { loadWordRows, readingSenses } from './lib/reading-senses.js';
import { loadCommunicativeTasks, validateCommunicativeCatalog } from './build-communicative.js';

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
    point.markers?.length ? sqlTextArray(point.markers) : "'{}'::text[]",
    sqlJson(point.common_errors || []),
    sqlJson(point.see_also || []),
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
    entry.handwriting === true ? 'true' : 'false',
  ]);
}

function buildExamStructureRows() {
  const structure = readJson('exam-structure.json');

  return [[
    sqlInteger(structure.hsk_level),
    sqlString(structure.source),
    sqlString(structure.source_note),
    sqlInteger(structure.total_minutes),
    sqlInteger(structure.answer_sheet_minutes),
    sqlJson(structure.sections || []),
  ]];
}

function buildExerciseRows() {
  const exercises = loadExercises();
  const corpus = loadCorpus();

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
    const targetWord = Number.isInteger(exercise.target_word_id)
      ? corpus[exercise.target_word_id - 1]
      : null;
    const targetWordId = targetWord
      ? `(select w.id from public.words w where w.hanzi = ${sqlString(targetWord.hanzi)} and w.pinyin = ${sqlString(targetWord.pinyin)} and w.hsk_level = ${sqlInteger(targetWord.hsk_level)} and ((w.sense_index is null and ${sqlInteger(targetWord.sense_index)} is null) or w.sense_index = ${sqlInteger(targetWord.sense_index)}) order by w.id limit 1)`
      : 'null';

    return [
      sqlString(exercise.type),
      sqlInteger(exercise.hsk_level),
      targetWordId,
      sqlJson(prompt),
      sqlJson(answer),
      sqlString('seed'),
      'null',
    ];
  });
}

function buildReadingRows() {
  const audioOf = loadReadingAudio();
  const words = loadWordRows();
  const series = loadSeries();
  return loadReadings().map(reading => {
    const audio = audioOf(reading);
    if (audio.issues.length > 0) {
      throw new Error(`${reading.slug}: ${audio.issues.map(issue => `${issue.kind} (frase ${issue.sentence_index})`).join(', ')}`);
    }
    // Las frases llevan la acepción resuelta en la build; tokenize-reading la aplica.
    const senses = readingSenses(reading, words, properNounsFor(reading, series));
    if (senses.issues.length > 0) {
      throw new Error(`${reading.slug}: ${senses.issues.map(issue => `${issue.kind} (frase ${issue.sentence_index}): ${issue.detail}`).join(', ')}`);
    }
    return [
    sqlString(reading.slug),
    sqlInteger(reading.hsk_level),
    sqlString(reading.format),
    sqlString(reading.title),
    sqlString(reading.topic),
    sqlString(reading.series ?? null),
    sqlInteger(reading.series_index ?? null),
    sqlJson(senses.sentences),
    sqlJson(reading.questions || []),
    sqlTextArray(reading.target_words),
    sqlJson(reading.target_grammar || []),
    sqlString(audio.audio_kind),
    sqlJson(audio.sentence_audio),
  ];
  });
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

// Una tarea cuya respuesta modelo no supera sus reglas no entra en el seed.
function buildCommunicativeRows() {
  const problems = validateCommunicativeCatalog();
  if (problems.length > 0) {
    throw new Error(`Tareas comunicativas inválidas:\n${problems.join('\n')}`);
  }
  return loadCommunicativeTasks().map(({ task }) => [
    sqlString(task.slug),
    sqlInteger(task.hsk_level),
    sqlString(task.situation_es),
    sqlString(task.mode),
    sqlTextArray(task.intent),
    sqlJson(task.required_markers),
    sqlInteger(task.min_chars),
    sqlInteger(task.max_chars),
    sqlJson(task.model_answer),
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

/** Formas del simulacro (Plan 12) construidas por scripts/build-exam.js. */
function loadExamForms() {
  const path = join(sqliteSeedDir, 'exam-forms.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
}

export function buildExamFormSql(forms = loadExamForms()) {
  return buildInsert(
    'exam_form',
    ['level', 'code', 'content', 'timeline', 'media'],
    forms.map((form) => [
      sqlInteger(form.level),
      sqlString(form.code),
      sqlJson(form.content),
      sqlJson(form.timeline),
      sqlJson(form.media),
    ]),
    'on conflict (level, code) do update set content = excluded.content, timeline = excluded.timeline, media = excluded.media',
  );
}

export function buildSeedSql() {
  const wordsRows = buildWordsRows();
  const characterRows = buildCharacterRows();
  const communicativeRows = buildCommunicativeRows();
  const examStructureRows = buildExamStructureRows();
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
      ['hanzi', 'hsk_level', 'handwriting'],
      characterRows,
      'on conflict (hanzi) do update set hsk_level = excluded.hsk_level, handwriting = excluded.handwriting',
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
      ['hsk_level', 'code', '"group"', 'category', 'detail', 'title', 'pattern', 'explanation', 'examples', 'items', 'order_idx', 'markers', 'common_errors', 'see_also'],
      grammarRows,
      'on conflict (hsk_level, code) do update set "group" = excluded."group", category = excluded.category, detail = excluded.detail, title = excluded.title, pattern = excluded.pattern, explanation = excluded.explanation, examples = excluded.examples, items = excluded.items, order_idx = excluded.order_idx, markers = excluded.markers, common_errors = excluded.common_errors, see_also = excluded.see_also',
    ),
    buildInsert(
      'grammar_prerequisite',
      ['hsk_level', 'code', 'requires_level', 'requires_code'],
      grammarPrerequisiteRows,
      'on conflict do nothing',
    ),
    unitSql.sql,
    buildInsert(
      'exam_structure',
      ['hsk_level', 'source', 'source_note', 'total_minutes', 'answer_sheet_minutes', 'sections'],
      examStructureRows,
      'on conflict (hsk_level) do update set source = excluded.source, source_note = excluded.source_note, total_minutes = excluded.total_minutes, answer_sheet_minutes = excluded.answer_sheet_minutes, sections = excluded.sections',
    ),
    buildInsert(
      'generated_exercises',
      ['type', 'hsk_level', 'target_word_id', 'prompt', 'answer', 'source_model', 'created_by'],
      exerciseRows,
      "on conflict ((prompt->>'slug')) where source_model = 'seed' and nullif(prompt->>'slug', '') is not null do update set type = excluded.type, hsk_level = excluded.hsk_level, target_word_id = excluded.target_word_id, prompt = excluded.prompt, answer = excluded.answer, source_model = excluded.source_model"
    ),
    buildInsert(
      'reading',
      ['slug', 'hsk_level', 'format', 'title', 'topic', 'series', 'series_index', 'sentences', 'questions', 'target_words', 'target_grammar', 'audio_kind', 'sentence_audio'],
      readingRows,
      'on conflict (slug) do update set hsk_level = excluded.hsk_level, format = excluded.format, title = excluded.title, topic = excluded.topic, series = excluded.series, series_index = excluded.series_index, sentences = excluded.sentences, questions = excluded.questions, target_words = excluded.target_words, target_grammar = excluded.target_grammar, audio_kind = excluded.audio_kind, sentence_audio = excluded.sentence_audio',
    ),
    buildInsert(
      'content_item',
      ['kind', 'hsk_level', 'title', 'source_table', 'source_id'],
      readingContentRows,
      'on conflict (source_table, source_id) do update set hsk_level = excluded.hsk_level, title = excluded.title',
    ),
    buildReadingTeachesSql(),
    buildExamFormSql(),
    buildInsert(
      'communicative_task',
      ['slug', 'hsk_level', 'situation_es', 'mode', 'intent', 'required_markers', 'min_chars', 'max_chars', 'model_answer'],
      communicativeRows,
      'on conflict (slug) do update set hsk_level = excluded.hsk_level, situation_es = excluded.situation_es, mode = excluded.mode, intent = excluded.intent, required_markers = excluded.required_markers, min_chars = excluded.min_chars, max_chars = excluded.max_chars, model_answer = excluded.model_answer',
    ),
    'commit;',
    '',
  ].join('\n');

  return {
    sql,
    counts: {
      words: wordsRows.length,
      characters: characterRows.length,
      exam_structures: examStructureRows.length,
      grammar_points: grammarRows.length,
      grammar_prerequisites: grammarPrerequisiteRows.length,
      units: unitSql.unitCount,
      unit_words: unitSql.unitWordCount,
      generated_exercises: exerciseRows.length,
      readings: readingRows.length,
      reading_content_items: readingContentRows.length,
      reading_teaches: buildReadingTeachingRows().length,
      communicative_tasks: communicativeRows.length,
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
