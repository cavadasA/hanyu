import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDir = join(rootDir, 'supabase', 'migrations');

function readMigration(name) {
  return readFileSync(join(migrationDir, name), 'utf8');
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function expectSqlToContain(sql, fragment) {
  expect(normalizeSql(sql)).toContain(normalizeSql(fragment));
}

describe('contratos de migraciones', () => {
  it('protege ambos extremos de grammar_prerequisite con claves foráneas', () => {
    const migration = readMigration('2026090203_progress_model.sql');

    expectSqlToContain(
      migration,
      'constraint grammar_prerequisite_current_fkey\n' +
        '    foreign key (hsk_level, code)\n' +
        '    references public.grammar_points (hsk_level, code)',
    );
    expectSqlToContain(
      migration,
      'constraint grammar_prerequisite_required_fkey\n' +
        '    foreign key (requires_level, requires_code)\n' +
        '    references public.grammar_points (hsk_level, code)',
    );
  });

  it('deja la corrección de decks solo en la migración posterior', () => {
    const historical = readMigration('2026080202_decks_seed_and_rpc.sql');
    const fix = readMigration('2026080203_fix_decks_rpc.sql');

    expectSqlToContain(historical, 'on conflict (deck_id, word_id) do nothing');
    expectSqlToContain(fix, 'on conflict do nothing');
    expectSqlToContain(fix, 'if not exists (select 1 from public.decks');
  });

  it('mueve la programación de tarjetas a learner_skill_state', () => {
    const migration = readMigration('2026090205_fsrs.sql');

    expectSqlToContain(migration, "add column if not exists fsrs_state text not null default 'new'");
    expectSqlToContain(migration, 'create index if not exists idx_skill_state_due_by_skill');
    expectSqlToContain(migration, "p_skill public.learning_skill default 'recognition'");
  });

  it('deja al servidor guardando el estado calculado por el cliente', () => {
    const migration = readMigration('2026090205_fsrs.sql');

    expectSqlToContain(migration, 'create or replace function public.apply_review(');
    expectSqlToContain(migration, 'p_state jsonb');
    expectSqlToContain(migration, 'drop function if exists public.review_flashcard(uuid, integer, integer);');
    expectSqlToContain(migration, 'drop column if exists ease_factor');
  });

  it('crea las habilidades derivadas y las desbloquea desde reconocimiento', () => {
    const migration = readMigration('2026090206_word_context.sql');

    expectSqlToContain(migration, 'create or replace function public.unlock_derived_skills(');
    expectSqlToContain(migration, "s.skill <> 'recognition'");
    expectSqlToContain(migration, "base.skill = 'recognition'");
    expectSqlToContain(migration, 'coalesce(base.stability, 0) >= p_min_stability');
  });

  it('endurece apply_review sin perder tiempo ni suspensión', () => {
    const migration = readMigration('2026090301_review_hardening.sql');

    expectSqlToContain(
      migration,
      'drop function if exists public.apply_review( uuid, uuid, timestamptz, bigint, smallint, public.learning_skill, jsonb, jsonb );',
    );
    expectSqlToContain(migration, 'p_time_ms integer default null');
    expectSqlToContain(migration, 'select s.version into version');
    expectSqlToContain(migration, 'p_time_ms < 0');
    expectSqlToContain(migration, "retrievability = (p_state->>'retrievability')::numeric");
    expectSqlToContain(migration, 'review_log ( user_id, card_id, reviewed_at, quality, grade, time_ms');
    expectSqlToContain(migration, "perform public.unlock_derived_skills()");
    expectSqlToContain(migration, "leech = ((p_state->>'lapses')::integer >= 8)");
    expectSqlToContain(migration, "'suspended', v_state.suspended");
    expectSqlToContain(migration, "leech = coalesce(");
    expect(normalizeSql(migration)).not.toContain("suspended = ((p_state->>'lapses')::integer >= 8)");
    expect(normalizeSql(migration)).not.toContain("suspended = coalesce((v_prior->>'suspended')::boolean, false)");
  });

  it('deja una sola ruta idempotente para inicializar habilidades', () => {
    const migration = readMigration('2026090301_review_hardening.sql');

    expectSqlToContain(
      migration,
      "insert into public.learner_skill_state ( user_id, target_kind, target_id, skill, suspended )",
    );
    expectSqlToContain(migration, "from public.srs_cards sc");
    expectSqlToContain(migration, "'recall'");
    expectSqlToContain(migration, "'listening'");
    expectSqlToContain(migration, "on conflict (user_id, target_kind, target_id, skill) do nothing");
    expectSqlToContain(migration, 'create trigger initialize_word_skill_states_on_card');
    expectSqlToContain(migration, 'create trigger initialize_reading_skill_state_on_context');
  });

  it('mantiene database.types alineado con FSRS y las RPC actuales', () => {
    const types = readFileSync(
      join(rootDir, 'packages', 'data', 'src', 'database.types.ts'),
      'utf8',
    );

    expect(types).toContain('fsrs_state: string');
    expect(types).toContain('learning_steps: number');
    expect(types).toContain('scheduled_days: number');
    expect(types).toContain('leech: boolean');
    expect(types).toContain('auto_suspended: boolean');
    expect(types).toContain('request_retention: number');
    expect(types).toContain('grade: number | null');
    expect(types).toContain('prior_snapshot: Json | null');
    expect(types).toContain('apply_review: {');
    expect(types).toContain('p_time_ms?: number | null');
    expect(types).toContain('build_review_queue: {');
    expect(types).toContain('build_review_queue_mode: {');
    expect(types).toContain('count_due_cards_by_state: {');
    expect(types).toContain('unit: {');
    expect(types).toContain('unit_word: {');
    expect(types).toContain('active_unit: {');
    expect(types).toContain('unit_completion_stability_days: {');
    expect(types).toContain('create_study_plan: {');
    expect(types).toContain('submit_diagnostic: {');
    expect(types).toContain('p_skill?: string');
    expect(types).toContain('revert_review: {');
    expect(types).not.toContain('retrievability: number | null');
    expect(types).not.toContain('review_flashcard: {');
    expect(types).not.toContain('ease_factor: number');
    expect(types).not.toContain('get_due_cards: {');
    expect(types).not.toContain('create_starter_deck: {');
  });

  it('deja la inicialización de habilidades exclusivamente en los triggers', () => {
    const migration = readMigration('2026090302_trigger_only_skill_init.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'create or replace function public.add_deck_from_template');
    expectSqlToContain(migration, 'create or replace function public.create_starter_deck');
    expect(normalized).not.toContain('insert into public.learner_skill_state');
    expect(normalized).toContain('insert into public.srs_cards');
  });

  it('separa la suspensión automática de la suspensión manual', () => {
    const migration = readMigration('2026090304_skill_suspension_sources.sql');

    expectSqlToContain(
      migration,
      'add column if not exists auto_suspended boolean not null default false',
    );
    expectSqlToContain(migration, 'set suspended = false, auto_suspended = false');
    expectSqlToContain(migration, 'and s.auto_suspended');
    expectSqlToContain(migration, "'recall', true, true");
    expectSqlToContain(migration, "'listening', true, true");
  });

  it('recuerda el umbral de lapsos perdonado sin cambiar la versión', () => {
    const migration = readMigration('2026090306_leech_clear_baseline.sql');
    const normalized = normalizeSql(migration);
    const clearLeechSql = migration.split('create or replace function public.clear_leech')[1]
      .split('revoke all on function public.clear_leech')[0];

    expectSqlToContain(
      migration,
      'add column if not exists leech_cleared_lapses integer not null default 0',
    );
    expectSqlToContain(migration, 'leech_cleared_lapses = lapses');
    expectSqlToContain(migration, 'create or replace function public.leech_lapses_threshold');
    expectSqlToContain(migration, 'leech_lapses_threshold()');
    expectSqlToContain(migration, "coalesce((p_state->>'lapses')::integer, 0)");
    expectSqlToContain(migration, 'coalesce(v_state.leech_cleared_lapses, 0)');
    expect(normalized).not.toContain("p_state->>'lapses')::integer >= 8");
    expect(normalizeSql(clearLeechSql.split('$$;')[0])).not.toContain('version');
  });

  it('elimina el pronóstico persistido hasta que exista un consumidor analítico', () => {
    const migration = readMigration('2026090305_drop_persisted_retrievability.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'drop column if exists retrievability');
    expectSqlToContain(migration, 'create or replace function public.apply_review');
    expectSqlToContain(migration, 'create or replace function public.get_due_cards');
    expect(normalized).not.toContain('retrievability =');
  });

  it('aplica el hardening posterior sobre todas las migraciones 030x', () => {
    const migration = readMigration('2026090401_followup_hardening.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'drop function if exists public.create_starter_deck(text, integer);');
    expectSqlToContain(migration, 'drop function if exists public.get_due_cards(integer, uuid, public.learning_skill);');
    expectSqlToContain(migration, 'drop function if exists public.get_due_cards(integer, uuid);');
    expectSqlToContain(migration, 'create or replace function public.build_review_queue(');
    expectSqlToContain(migration, 'create or replace function public.get_dashboard(');
    expectSqlToContain(migration, 'alter table public.reading');
    expectSqlToContain(migration, 'add column if not exists target_grammar jsonb not null default \'[]\'::jsonb;');
    expectSqlToContain(migration, 'insert into public.content_teaches');
    expectSqlToContain(migration, 'v_new_session_cap integer;');
    expectSqlToContain(migration, 'v_new_session_cap := greatest(0, floor(v_session / 2.0)::integer);');
    expectSqlToContain(migration, 'limit least(v_new_allowance, v_new_session_cap)');
    expect(normalized).toContain("fsrs_state <> 'new'");
    expect(normalized).toContain('next_review_at is not null');
    expect(normalized).toContain('from public.reading');
    expect(normalized).not.toContain('begin;');
    expect(normalized).not.toContain('commit;');
  });

  it('separa Learn, Review y Exam en la cola y conserva la fecha objetivo', () => {
    const migration = readMigration('2026090403_plan_5b_hardening.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'add column if not exists exam_date date;');
    expectSqlToContain(migration, 'create or replace function public.build_review_queue_mode(');
    expectSqlToContain(migration, 'p_mode text');
    expectSqlToContain(migration, "p_mode not in ('learn', 'review', 'exam')");
    expectSqlToContain(migration, 'from public.active_unit()');
    expectSqlToContain(migration, 'count(uw.word_id)::integer as word_count');
    expectSqlToContain(migration, 'cardinality(u.patterns)::integer as pattern_count');
    expectSqlToContain(migration, "target_kind = 'grammar'");
    expectSqlToContain(migration, 'grammar_id');
    expectSqlToContain(migration, "add value if not exists 'grammar_studied'");
    expectSqlToContain(migration, 'create or replace function public.mark_grammar_studied(');
    expectSqlToContain(migration, 'create or replace function public.unit_completion_stability_days()');
    expectSqlToContain(migration, 'default public.unit_completion_stability_days()');
    expectSqlToContain(migration, 'v_completion_stability_days integer');
    expectSqlToContain(migration, "'recognition', null, v_completion_stability_days");
    expectSqlToContain(migration, 'order by random()');
    expectSqlToContain(migration, 'order by case when i.total_words > 0 then 0 else 1 end');
    expectSqlToContain(migration, 'where not q.is_new;');
    expect(normalized).toContain('grant execute on function public.build_review_queue_mode(text, uuid, public.learning_skill, integer) to authenticated');
    expect(normalized).toContain('drop function if exists public.build_review_queue(uuid, public.learning_skill, integer, text)');
    expect(normalized).not.toContain('create or replace function public.build_review_queue(');
    expect(normalized).not.toContain('where total_words > 0 and settled_words < total_words');
  });

  it('aplica la migración de unidades después de las migraciones existentes', () => {
    const names = readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
    const unitMigration = names.find((name) => name.includes('_plan_5b_hardening'));

    expect(unitMigration).toBe('2026090403_plan_5b_hardening.sql');
    expect(names.indexOf(unitMigration)).toBeGreaterThan(names.indexOf('2026090402_normalize_reading_grammar_targets.sql'));
  });

  it('incluye una prueba SQL de comportamiento para la ruta diaria', () => {
    const integrationTest = readFileSync(join(rootDir, 'supabase', 'tests', 'daily_plan.sql'), 'utf8');

    expectSqlToContain(integrationTest, 'begin;');
    expectSqlToContain(integrationTest, 'from public.active_unit()');
    expectSqlToContain(integrationTest, 'public.build_review_queue_mode(');
    expectSqlToContain(integrationTest, 'public.mark_grammar_studied(');
    expectSqlToContain(integrationTest, 'rollback;');
    expect(integrationTest).toContain('prerrequisito bloquea');
    expectSqlToContain(integrationTest, "v_unit.code is distinct from 'test.graph.a'");
    expectSqlToContain(integrationTest, "v_grammar_state.fsrs_state is distinct from 'review'");
    expectSqlToContain(integrationTest, "v_unit.code is distinct from 'test.graph.b'");
  });

  it('publica el hardening SQL posterior para bases que ya aplicaron 0403', () => {
    const migration = readMigration('2026090404_plan_followup_hardening.sql');

    expectSqlToContain(migration, 'create or replace function public.unit_completion_stability_days()');
    expectSqlToContain(migration, 'create or replace function public.mark_grammar_studied(');
    expectSqlToContain(migration, "'recognition', null, v_completion_stability_days");
    expectSqlToContain(migration, 'create or replace function public.active_unit(');
    expectSqlToContain(migration, 'order by case when i.total_words > 0 then 0 else 1 end');
  });

  it('normaliza el formato antiguo de los objetivos gramaticales', () => {
    const migration = readMigration('2026090402_normalize_reading_grammar_targets.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'alter table public.reading alter column target_grammar type jsonb');
    expectSqlToContain(migration, "jsonb_build_object('code', target.code, 'level', g.hsk_level)");
    expectSqlToContain(migration, "jsonb_typeof(item) = 'string'");
    expect(normalized).not.toContain('begin;');
    expect(normalized).not.toContain('commit;');
  });

  it('publica el hardening de ejercicios, simulacro y cuaderno de errores', () => {
    const migration = readMigration('2026090405_exercises_exam_hardening.sql');
    const integrationTest = readFileSync(
      join(rootDir, 'supabase', 'tests', 'exercises_exam_hardening.sql'),
      'utf8',
    );

    expectSqlToContain(migration, 'add column if not exists target_word_id bigint');
    expectSqlToContain(migration, 'p_target_word_ids bigint[]');
    expectSqlToContain(migration, "jsonb_typeof(e.payload->'correct') = 'boolean'");
    expectSqlToContain(migration, 'v_used_exercise_ids uuid[]');
    expectSqlToContain(migration, "v_section->>'code' = 'listening'");
    expectSqlToContain(migration, 'p_section_code text default null');
    expectSqlToContain(integrationTest, 'select plan(10);');
    expectSqlToContain(integrationTest, 'public.build_exercise_session(');
    expectSqlToContain(integrationTest, 'public.build_mock_exam(');
    expectSqlToContain(integrationTest, 'public.mistake_queue(');
    expectSqlToContain(integrationTest, 'select * from finish();');
  });

  it('hace idempotente el seed de ejercicios por slug natural', () => {
    const migration = readMigration('2026090501_generated_exercise_seed_identity.sql');
    const normalized = normalizeSql(migration);

    expectSqlToContain(migration, 'delete from public.generated_exercises duplicate');
    expectSqlToContain(migration, "create unique index if not exists idx_generated_exercises_seed_slug");
    expectSqlToContain(migration, "on public.generated_exercises ((prompt->>'slug'))");
    expectSqlToContain(migration, "where source_model = 'seed'");
    expect(normalized).toContain("duplicate.prompt->>'slug' = keeper.prompt->>'slug'");
  });
});
