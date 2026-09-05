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
  });
});
