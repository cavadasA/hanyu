import { readFileSync } from 'node:fs';
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
});
