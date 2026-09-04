#!/usr/bin/env node
// Runs every verification step in the monorepo and reports all of their results,
// instead of stopping at the first failure the way a chain of `&&` does. Exits
// non-zero if any step failed.
//
// Steps are named so a red run says which surface broke without having to
// re-read the scrollback.
//
// A step that could not run is reported as SKIP, never as PASS: `run-supabase-tests.js`
// exits with this code when there is no test database, and calling that green would
// claim coverage nobody has. Kept in sync by hand — importing the runner would run it.
import { spawnSync } from 'node:child_process';

const SKIP_EXIT_CODE = 78;

const steps = [
  ['typecheck @hanyu/domain', 'npm', ['run', 'typecheck', '-w', '@hanyu/domain']],
  ['typecheck @hanyu/data', 'npm', ['run', 'typecheck', '-w', '@hanyu/data']],
  ['typecheck @hanyu/mobile', 'npm', ['run', 'typecheck', '-w', '@hanyu/mobile']],
  ['tests corpus + data + domain + functions (vitest)', 'npx', ['vitest', 'run']],
  ['tests mobile (jest)', 'npm', ['run', 'test', '-w', '@hanyu/mobile']],
  ['tests Supabase SQL (pgTAP)', 'node', ['scripts/run-supabase-tests.js']],
];

const results = [];

for (const [name, command, args] of steps) {
  console.log(`\n--- ${name} ---`);
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  results.push([name, status === SKIP_EXIT_CODE ? 'skip' : status === 0 ? 'pass' : 'fail']);
}

console.log('\n--- resumen ---');
for (const [name, state] of results) {
  console.log(`${state.toUpperCase().padEnd(4)}  ${name}`);
}

const failed = results.filter(([, state]) => state === 'fail');
const skipped = results.filter(([, state]) => state === 'skip');

if (failed.length > 0) {
  console.log(`\n${failed.length} de ${results.length} pasos fallaron.`);
  process.exit(1);
}

const passed = results.length - skipped.length;

console.log(
  skipped.length > 0
    ? `\n${passed} de ${results.length} pasos pasaron; ${skipped.length} ${skipped.length === 1 ? 'se omitió' : 'se omitieron'} sin ejecutarse.`
    : `\nLos ${results.length} pasos pasaron.`,
);
