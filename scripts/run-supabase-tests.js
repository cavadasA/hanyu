#!/usr/bin/env node
// Ejecuta las pruebas pgTAP cuando se proporciona una base de pruebas explícita.
// No usa DATABASE_URL por defecto: nunca debemos apuntar una verificación local
// accidentalmente a una base de producción.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testFile = join(rootDir, 'supabase', 'tests', 'exercises_exam_hardening.sql');
const databaseUrl = process.env.SUPABASE_TEST_DATABASE_URL;

if (!databaseUrl) {
  console.log('SKIP  Supabase pgTAP (define SUPABASE_TEST_DATABASE_URL para ejecutarlo)');
  process.exit(0);
}

if (!existsSync(testFile)) {
  console.error(`No existe la prueba SQL: ${testFile}`);
  process.exit(1);
}

const psql = spawnSync('psql', ['--version'], { stdio: 'ignore' });
if (psql.error || psql.status !== 0) {
  console.error('SUPABASE_TEST_DATABASE_URL está definido, pero psql no está instalado.');
  process.exit(1);
}

const result = spawnSync(
  'psql',
  [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', testFile],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
