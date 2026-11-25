#!/usr/bin/env node
// Ejecuta las pruebas pgTAP cuando se proporciona una base de pruebas explícita.
// No usa DATABASE_URL por defecto: nunca debemos apuntar una verificación local
// accidentalmente a una base de producción.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Un paso omitido no es un paso que pasa, así que no puede salir con 0: eso
// contaba como verde en el resumen de verify.js. No se exporta a propósito
// —importar este fichero lo ejecutaría—, así que verify.js repite el número con
// el mismo comentario. psql solo devuelve 0, 1, 2 o 3, de modo que 78 no
// colisiona con un fallo real de la prueba.
const SKIP_EXIT_CODE = 78;

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testFiles = ['exercises_exam_hardening.sql', 'exam_forms.sql'].map((file) =>
  join(rootDir, 'supabase', 'tests', file),
);
const databaseUrl = process.env.SUPABASE_TEST_DATABASE_URL;

if (!databaseUrl) {
  console.log('SKIP  Supabase pgTAP (define SUPABASE_TEST_DATABASE_URL para ejecutarlo)');
  process.exit(SKIP_EXIT_CODE);
}

for (const testFile of testFiles) {
  if (!existsSync(testFile)) {
    console.error(`No existe la prueba SQL: ${testFile}`);
    process.exit(1);
  }
}

const psql = spawnSync('psql', ['--version'], { stdio: 'ignore' });
if (psql.error || psql.status !== 0) {
  console.error('SUPABASE_TEST_DATABASE_URL está definido, pero psql no está instalado.');
  process.exit(1);
}

for (const testFile of testFiles) {
  const result = spawnSync(
    'psql',
    [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', testFile],
    { stdio: 'inherit' },
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);
