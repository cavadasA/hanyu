import { describe, expect, it, vi } from 'vitest';
import { completeReading, getReadings } from './readings';

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

  it('completa una lectura catalogada sin invocar una RPC inexistente', async () => {
    const attempts: unknown[] = [];
    const rpc = vi.fn();
    const readingRow = {
      slug: 'reading-1',
      hsk_level: 2,
      format: 'short_text',
      title: 'Una lectura',
      topic: 'estudio',
      series: null,
      series_index: null,
      sentences: JSON.stringify([{ zh: '我喜欢喝茶。', pinyin: 'Wǒ xǐhuan hē chá.', es: 'Me gusta el té.' }]),
      questions: JSON.stringify([
        { prompt: '¿Qué me gusta?', options: ['té', 'agua'], answer_index: 0 },
      ]),
      target_words: [],
      target_grammar: [],
      audio_kind: 'tts',
      audio_url: null,
    };
    const from = vi.fn((table: string) => {
      if (table === 'reading') {
        const query: any = {
          eq: vi.fn(() => query),
          single: vi.fn().mockResolvedValue({ data: readingRow, error: null }),
        };
        return { select: vi.fn(() => query) };
      }

      if (table === 'reading_attempts') {
        return {
          insert: vi.fn((row: unknown) => {
            attempts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }

      const statsQuery: any = {
        eq: vi.fn(() => statsQuery),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return {
        select: vi.fn(() => statsQuery),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });
    const client = {
      rpc,
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    };

    await expect(completeReading('reading-1', { q0: '0' }, client as never)).resolves.toMatchObject({
      score: 1,
      total: 1,
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(attempts[0]).toMatchObject({ reading_slug: 'reading-1', score: 1, total: 1 });
  });
});
