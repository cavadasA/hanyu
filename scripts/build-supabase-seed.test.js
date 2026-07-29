import { describe, expect, it } from 'vitest';
import { buildSeedSql } from './build-supabase-seed.js';

describe('buildSeedSql', () => {
  it('builds seed SQL for words, grammar, and exercises', () => {
    const generated = buildSeedSql();

    expect(generated.sql).toContain('insert into public.words');
    expect(generated.sql).toContain('insert into public.grammar_points');
    expect(generated.sql).toContain('insert into public.generated_exercises');

    expect(generated.counts.words).toBeGreaterThan(0);
    expect(generated.counts.grammar_points).toBeGreaterThan(0);
    expect(generated.counts.generated_exercises).toBeGreaterThan(0);
  });
});
