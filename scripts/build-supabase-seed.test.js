import { describe, expect, it } from 'vitest';
import { buildSeedSql } from './build-supabase-seed.js';

describe('buildSeedSql', () => {
  const { sql, counts } = buildSeedSql();

  it('builds seed SQL for words, grammar, and exercises', () => {
    const generated = { sql, counts };

    expect(generated.sql).toContain('insert into public.words');
    expect(generated.sql).toContain('insert into public.grammar_points');
    expect(generated.sql).toContain('insert into public.generated_exercises');

    expect(generated.counts.words).toBeGreaterThan(0);
    expect(generated.counts.grammar_points).toBeGreaterThan(0);
    expect(generated.counts.generated_exercises).toBeGreaterThan(0);
  });

  it('inserta las columnas de sentido', () => {
    expect(sql).toContain(
      'insert into public.words (hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency)',
    );
  });

  it('emite las dos lecturas de 还 con glosas distintas', () => {
    const hai = sql.match(/\('还', '還', 'hái', '([^']*)'/);
    const huan = sql.match(/\('还', '還', 'huán', '([^']*)'/);

    expect(hai).not.toBeNull();
    expect(huan).not.toBeNull();
    expect(hai[1]).not.toBe(huan[1]);
  });

  it('lleva el corpus completo', () => {
    expect(counts.words).toBe(1011);
  });
});
