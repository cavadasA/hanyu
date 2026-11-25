// El desglose literal/inferencial de la comprensión necesita que cada intento
// guarde cuántas preguntas inferenciales tenía y cuántas acertó, y que el
// informe lo devuelva. Sin esto, Progreso solo podría mostrar una mezcla.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDir = join(rootDir, 'supabase', 'migrations');
const normalize = sql => sql.replace(/\s+/g, ' ').trim();

function latestDefinitionOf(fn) {
  const files = readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort();
  let latest = null;
  for (const name of files) {
    const sql = readFileSync(join(migrationDir, name), 'utf8');
    const start = sql.indexOf(`create or replace function public.${fn}(`);
    if (start !== -1) latest = { name, body: sql.slice(start, sql.indexOf('$$;', start)) };
  }
  return latest;
}

function migrationAdding(column) {
  return readdirSync(migrationDir)
    .filter(name => name.endsWith('.sql'))
    .map(name => readFileSync(join(migrationDir, name), 'utf8'))
    .find(sql => normalize(sql).includes(`add column if not exists ${column} integer not null default 0`));
}

describe('comprensión inferencial en reading_attempts', () => {
  it('cada intento guarda aciertos y total de preguntas inferenciales, a 0 en los antiguos', () => {
    const sql = migrationAdding('inferential_score');
    expect(sql).toBeDefined();
    expect(normalize(sql)).toContain('add column if not exists inferential_total integer not null default 0');
    expect(normalize(sql)).toContain('check (inferential_score between 0 and inferential_total and inferential_total <= total)');
  });

  it('learning_report devuelve el desglose en cada intento', () => {
    const { body } = latestDefinitionOf('learning_report');
    expect(normalize(body)).toContain("'inferential_score', a.inferential_score, 'inferential_total', a.inferential_total");
  });

  it('database.types conoce las columnas nuevas', () => {
    const types = readFileSync(join(rootDir, 'packages', 'data', 'src', 'database.types.ts'), 'utf8');
    const attempts = types.slice(types.indexOf('reading_attempts: {'), types.indexOf('Relationships', types.indexOf('reading_attempts: {')));
    expect(attempts).toContain('inferential_score: number');
    expect(attempts).toContain('inferential_score?: number');
    expect(attempts).toContain('inferential_total: number');
  });
});
