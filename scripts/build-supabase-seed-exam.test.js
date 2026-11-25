import { describe, expect, it } from 'vitest';
import { buildExamFormSql } from './build-supabase-seed.js';

describe('formas del simulacro en el seed', () => {
  it('vuelca cada forma de exam-forms.json en exam_form, con contenido, línea de tiempo y medios', () => {
    const sql = buildExamFormSql([
      { level: 2, code: 'A', content: { code: 'A', groups: [] }, timeline: [{ at_ms: 0 }], media: { audio: {} } },
    ]);
    expect(sql).toContain('insert into public.exam_form (level, code, content, timeline, media)');
    expect(sql).toContain(`(2, 'A', '{"code":"A","groups":[]}'::jsonb, '[{"at_ms":0}]'::jsonb, '{"audio":{}}'::jsonb)`);
    expect(sql).toContain('on conflict (level, code) do update set content = excluded.content');
  });

  it('sin formas construidas no siembra ninguna', () => {
    expect(buildExamFormSql([])).toBe('-- exam_form: no rows\n');
  });
});
