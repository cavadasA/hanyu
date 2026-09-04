#!/usr/bin/env node
// Runs every verification step in the monorepo and reports all of their results,
// instead of stopping at the first failure the way a chain of `&&` does. Exits
// non-zero if any step failed.
//
// Steps are named so a red run says which surface broke without having to
// re-read the scrollback.
import { spawnSync } from 'node:child_process';

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
  results.push([name, status === 0]);
}

console.log('\n--- resumen ---');
for (const [name, ok] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

const failed = results.filter(([, ok]) => !ok);

if (failed.length > 0) {
  console.log(`\n${failed.length} de ${results.length} pasos fallaron.`);
  process.exit(1);
}

console.log(`\nLos ${results.length} pasos pasaron.`);
