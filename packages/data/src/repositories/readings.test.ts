import { describe, expect, it, vi } from 'vitest';
import { getReadings } from './readings';

function readingClient(rows: unknown[]) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };

  return {
    from: vi.fn(() => query),
  };
}

describe('readings repository', () => {
  it('lee del catálogo, no de generated_readings', async () => {
    const client = readingClient([{ slug: 'market-01-first-visit', title: '第一次去市场' }]);

    const readings = await getReadings({ level: 2 }, client as never);

    expect((client as any).from).toHaveBeenCalledWith('reading');
    expect(readings[0]).toMatchObject({
      id: 'market-01-first-visit',
      slug: 'market-01-first-visit',
      title: '第一次去市场',
    });
  });

  it('ya no expone una función de generación', async () => {
    const module = await import('./readings');

    expect('generateReading' in module).toBe(false);
  });
});
