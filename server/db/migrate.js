import { getDb } from './index.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');
const db = getDb();

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of files) {
  console.log(`Running migration: ${file}`);
  const sql = readFileSync(join(migrationsDir, file), 'utf-8');
  db.exec(sql);
}

console.log('Migrations complete.');