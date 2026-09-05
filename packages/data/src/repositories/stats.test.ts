import { describe, expect, it, vi } from 'vitest';
import type { HanyuClient } from '../client';
import { getLearningReport } from './stats';

function reportClient(data: any = { reviews: [], attempts: [], lookups: 0, reading_sessions: [], skill_states: [] }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  } as unknown as HanyuClient;
}

describe('getLearningReport', () => {
  it('pide el historial de una sola vez', async () => {
    const client = reportClient();

    await getLearningReport(client);

    expect((client as any).rpc).toHaveBeenCalledWith('learning_report', { p_days: 90 });
  });

  it('devuelve listas vacías cuando no hay historial, no null', async () => {
    const client = reportClient({});

    const report = await getLearningReport(client);

    expect(report.reviews).toEqual([]);
    expect(report.attempts).toEqual([]);
    expect(report.reading_attempts).toEqual([]);
    expect(report.units).toEqual([]);
    expect(report.syllabus_word_ids).toEqual([]);
    expect(report.syllabus_words_count).toBe(0);
    expect(report.mistakes_count).toBe(0);
  });

  it('normaliza las calificaciones numéricas de reviews a strings ("1" -> "again", "3" -> "good")', async () => {
    const client = reportClient({
      reviews: [
        { occurred_at: '2026-09-01T00:00:00Z', grade: '1', skill: 'recognition', phase_before: 'review' },
        { occurred_at: '2026-09-01T00:01:00Z', grade: 3, skill: 'recognition', phase_before: 'review' },
      ],
      skill_states: [
        { target_id: 1, skill: 'recognition', stability: 200, suspended: false, last_reviewed_at: null, in_scope: true },
      ],
      reading_sessions: [
        { slug: 'text-1', seconds: 120, pinyin_shown: false, chars: 150 },
      ],
      reading_attempts: [
        { created_at: '2026-09-01T00:00:00Z', reading_slug: 'text-1', score: 4, total: 5 },
      ],
      mistakes_count: 3,
      syllabus_words_count: 300,
      syllabus_word_ids: [1, 2, 3],
      units: [
        { code: 'U1', title: 'Unidad 1', hsk_level: 1, total_words: 0, settled_words: 0, total_items: 1, settled_items: 1, completed: true },
      ],
    });

    const report = await getLearningReport(client);

    expect(report.reviews[0]?.grade).toBe('again');
    expect(report.reviews[1]?.grade).toBe('good');
    expect(report.skill_states[0]?.in_scope).toBe(true);
    expect(report.reading_sessions[0]?.chars).toBe(150);
    expect(report.reading_attempts[0]?.score).toBe(4);
    expect(report.mistakes_count).toBe(3);
    expect(report.syllabus_words_count).toBe(300);
    expect(report.syllabus_word_ids).toEqual([1, 2, 3]);
    expect(report.units[0]?.completed).toBe(true);
  });
});
