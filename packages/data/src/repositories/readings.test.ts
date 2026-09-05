import { describe, expect, it, vi } from 'vitest';
import { completeReading, getReadingProgress, getReadings, markRead, toggleBookmark } from './readings';

function readingClient(rows: unknown[]) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
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

  it('calcula la cobertura conocida antes de abrir cada lectura', async () => {
    const catalog = readingClient([{ slug: 'reading-1', title: 'Una lectura', sentences: [] }]);
    const skillQuery: Record<string, any> = {
      select: vi.fn(() => skillQuery),
      eq: vi.fn(() => skillQuery),
      in: vi.fn(() => skillQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ target_id: 1, stability: 31 }],
        error: null,
      }).then(resolve),
    };
    const client = {
      ...catalog,
      from: vi.fn((table: string) => table === 'learner_skill_state' ? skillQuery : (catalog as any).from()),
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            tokens: [
              { id: 't0', text: '我', type: 'word', word: { id: 1 } },
              { id: 't1', text: '龘', type: 'unknown', word: null },
            ],
          },
          error: null,
        }),
      },
    };

    const readings = await getReadings({ level: 2 }, client as never);

    expect(readings[0].coverage).toEqual({ ratio: 0.5, known_count: 1, unknown_count: 1 });
  });

  it('marcar como leída registra el evento que el planificador consulta', async () => {
    const client = progressClient();

    await markRead('shop-01-tea-and-coffee', client as never);

    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reading_completed' }),
    );
  });

  it('el marcador se puede quitar', async () => {
    const client = progressClient({ bookmarked: true });

    await toggleBookmark('shop-01-tea-and-coffee', client as never);

    expect(client.chains.reading_progress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarked: false }),
      expect.anything(),
    );
  });

  it('recuerda por qué frase se iba', async () => {
    const client = progressClient({ last_sentence: 4 });

    expect((await getReadingProgress('shop-01-tea-and-coffee', client as never)).last_sentence).toBe(4);
  });

  it('incluye el estado de progreso en el catálogo', async () => {
    const catalog = readingClient([{ slug: 'reading-1', title: 'Una lectura' }]);
    const progressQuery: Record<string, any> = {
      select: vi.fn(() => progressQuery),
      eq: vi.fn(() => progressQuery),
      in: vi.fn(() => progressQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ reading_slug: 'reading-1', bookmarked: true, last_sentence: 2, finished_at: null }],
        error: null,
      }).then(resolve),
    };
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn((table: string) => table === 'reading_progress' ? progressQuery : (catalog as any).from()),
    };

    const readings = await getReadings({ level: 2 }, client as never);

    expect(readings[0].progress).toMatchObject({ bookmarked: true, last_sentence: 2 });
  });
});

function progressClient(progress: Record<string, unknown> = {}) {
  const chains: Record<string, any> = {
    reading: {
      select: vi.fn(function(this: any) { return this; }),
      eq: vi.fn(function(this: any) { return this; }),
      single: vi.fn().mockResolvedValue({
        data: { slug: 'shop-01-tea-and-coffee', target_words: ['比'] },
        error: null,
      }),
    },
    reading_progress: {
      select: vi.fn(function(this: any) { return this; }),
      eq: vi.fn(function(this: any) { return this; }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { reading_slug: 'shop-01-tea-and-coffee', bookmarked: false, last_sentence: 0, ...progress },
        error: null,
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    },
    learning_event: {
      insert: vi.fn().mockResolvedValue({ error: null }),
    },
  };

  return {
    chains,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: vi.fn((table: string) => chains[table]),
  };
}
