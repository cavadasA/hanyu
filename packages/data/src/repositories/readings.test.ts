import { describe, expect, it, vi } from 'vitest';
import {
  completeReading,
  getReading,
  getReadingPlannerInput,
  getReadingProgress,
  getReadings,
  markRead,
  toggleBookmark,
} from './readings';

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

  it('mapea sentence_audio y resuelve cada clip con la URL pública del bucket', async () => {
    const client = {
      ...readingClient([{
        slug: 'casa-01',
        title: '早上',
        audio_kind: 'neural',
        sentences: [{ zh: '我起床。', pinyin: 'Wǒ qǐchuáng.', es: '' }, { zh: '我吃饭。', pinyin: 'Wǒ chīfàn.', es: '' }],
        sentence_audio: [{ path: 'media/abc.m4a', duration_ms: 1500 }, { path: 'media/def.m4a', duration_ms: 1700 }],
      }]),
      storage: {
        from: vi.fn((bucket: string) => ({
          getPublicUrl: (object: string) => ({
            data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${object}` },
          }),
        })),
      },
    };

    const [reading] = await getReadings({}, client as never);

    expect(reading.audio_kind).toBe('neural');
    expect(reading.sentence_audio).toEqual([
      { url: 'https://x.supabase.co/storage/v1/object/public/media/abc.m4a', duration_ms: 1500 },
      { url: 'https://x.supabase.co/storage/v1/object/public/media/def.m4a', duration_ms: 1700 },
    ]);
    expect(client.storage.from).toHaveBeenCalledWith('media');
    expect('audio_url' in reading).toBe(false);
  });

  it('una lectura tts tiene una entrada null por frase', async () => {
    const client = readingClient([{
      slug: 'casa-02',
      title: '晚上',
      audio_kind: 'tts',
      sentences: [{ zh: '我睡觉。', pinyin: 'Wǒ shuìjiào.', es: '' }],
      sentence_audio: [null],
    }]);

    const [reading] = await getReadings({}, client as never);

    expect(reading.audio_kind).toBe('tts');
    expect(reading.sentence_audio).toEqual([null]);
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

  it('tokeniza el catálogo completo con una sola invocación bulk', async () => {
    const catalog = readingClient([
      { slug: 'reading-1', title: 'Una lectura', sentences: [] },
      { slug: 'reading-2', title: 'Otra lectura', sentences: [] },
    ]);
    const skillQuery: Record<string, any> = {
      select: vi.fn(() => skillQuery),
      eq: vi.fn(() => skillQuery),
      in: vi.fn(() => skillQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ target_id: 1, stability: 31 }],
        error: null,
      }).then(resolve),
    };
    const invoke = vi.fn().mockResolvedValue({
      data: {
        tokens_by_reading: {
          'reading-1': [{ id: 't0', text: '我', type: 'word', word: { id: 1 } }],
          'reading-2': [{ id: 't0', text: '龘', type: 'unknown', word: null }],
        },
      },
      error: null,
    });
    const client = {
      ...catalog,
      from: vi.fn((table: string) => table === 'learner_skill_state' ? skillQuery : (catalog as any).from()),
      functions: { invoke },
    };

    const readings = await getReadings({ level: 2 }, client as never);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('tokenize-reading', {
      body: { reading_ids: ['reading-1', 'reading-2'] },
    });
    expect(readings.map(reading => reading.coverage?.ratio)).toEqual([1, 0]);
  });

  it('reparte los tokens entre todas las frases de una lectura', async () => {
    const readingQuery: any = {
      select: vi.fn(() => readingQuery),
      eq: vi.fn(() => readingQuery),
      single: vi.fn().mockResolvedValue({
        data: {
          slug: 'reading-1', hsk_level: 2, format: 'short_text', title: 'Dos frases',
          topic: 'estudio', series: null, series_index: null,
          sentences: JSON.stringify([
            { zh: '你好。', pinyin: 'Nǐ hǎo.', es: 'Hola.' },
            { zh: '谢谢。', pinyin: 'Xièxie.', es: 'Gracias.' },
          ]),
          questions: [], target_words: [], target_grammar: [], audio_kind: 'tts', audio_url: null,
        },
        error: null,
      }),
    };
    const stateQuery: any = {
      select: vi.fn(() => stateQuery),
      eq: vi.fn(() => stateQuery),
      in: vi.fn(() => stateQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    const client = {
      from: vi.fn((table: string) => table === 'reading' ? readingQuery : stateQuery),
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            tokens: [
              { id: 't0', text: '你好', type: 'word', word: { id: 1, hanzi: '你好', in_srs: false } },
              { id: 't2', text: '。', type: 'punctuation', word: null },
              { id: 't3', text: '谢谢', type: 'word', word: { id: 2, hanzi: '谢谢', in_srs: false } },
              { id: 't5', text: '。', type: 'punctuation', word: null },
            ],
          },
          error: null,
        }),
      },
    };

    const reading = await getReading('reading-1', client as never);

    expect(reading.sentences.map(sentence => sentence.tokens.map(token => token.text))).toEqual([
      ['你好', '。'],
      ['谢谢', '。'],
    ]);
  });

  it('marcar como leída registra el evento que el planificador consulta', async () => {
    const client = progressClient();

    await markRead('shop-01-tea-and-coffee', client as never);

    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reading_completed' }),
    );
  });

  it('guarda si el pinyin estaba visible al terminar la lectura', async () => {
    const client = progressClient();

    await markRead('shop-01-tea-and-coffee', { pinyinShown: true }, client as never);

    expect((client as any).chains.reading_progress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pinyin_shown: true }),
      expect.anything(),
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

  it('no duplica el evento al volver a marcar una lectura terminada', async () => {
    const client = progressClient({ finished_at: '2026-09-05T00:00:00Z' });

    await markRead('shop-01-tea-and-coffee', client as never);

    expect(client.chains.learning_event.insert).not.toHaveBeenCalled();
    expect(client.chains.reading_progress.upsert).not.toHaveBeenCalled();
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

function plannerClient(options: {
  readings?: any[];
  tokensByReading?: Record<string, any[]>;
  states?: any[];
  progress?: any[];
  events?: any[];
} = {}) {
  const table = (rows: unknown[]) => {
    const query: Record<string, any> = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      gte: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  };

  const chains: Record<string, any> = {
    reading: table(options.readings ?? []),
    learner_skill_state: table(options.states ?? []),
    reading_progress: table(options.progress ?? []),
    learning_event: table(options.events ?? []),
  };

  return {
    chains,
    from: vi.fn((name: string) => chains[name]),
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { tokens_by_reading: options.tokensByReading ?? {} },
        error: null,
      }),
    },
  };
}

describe('getReadingPlannerInput', () => {
  const catalog = [
    { slug: 'r1', hsk_level: 2, title: 'Té y café', topic: 'compras', target_words: ['比'], sentences: [] },
    { slug: 'r2', hsk_level: 2, title: 'La biblioteca', topic: 'lugares', target_words: [], sentences: [] },
  ];

  it('da al planificador el vocabulario real de cada lectura, sin repetir formas', async () => {
    // rankContent divide sobre word_ids.length: contar 我 tres veces bajaría la
    // comprensibilidad de un texto que en realidad usa dos palabras distintas.
    const client = plannerClient({
      readings: catalog,
      tokensByReading: {
        r1: [
          { id: 't0', text: '我', type: 'word', word: { id: 1, hanzi: '我' } },
          { id: 't1', text: '我', type: 'word', word: { id: 1, hanzi: '我' } },
          { id: 't2', text: '比', type: 'word', word: { id: 2, hanzi: '比' } },
          { id: 't3', text: '。', type: 'punctuation', word: null },
        ],
        r2: [{ id: 't0', text: '书', type: 'word', word: { id: 3, hanzi: '书' } }],
      },
    });

    const input = await getReadingPlannerInput(2, 'u1', client as never);

    expect(input.rankable).toEqual([
      { id: 'r1', topic: 'compras', word_ids: [1, 2] },
      { id: 'r2', topic: 'lugares', word_ids: [3] },
    ]);
  });

  it('define conocido igual que la cobertura de la lista', async () => {
    // La lista dice "94 % conocido" con el umbral de estabilidad; si el
    // planificador usara otro, propondría una lectura contradiciendo su etiqueta.
    const client = plannerClient({
      readings: catalog,
      tokensByReading: {
        r1: [
          { id: 't0', text: '我', type: 'word', word: { id: 1, hanzi: '我' } },
          { id: 't1', text: '书', type: 'word', word: { id: 3, hanzi: '书' } },
        ],
      },
      states: [{ target_id: 1, stability: 31 }, { target_id: 3, stability: 4 }],
    });

    const input = await getReadingPlannerInput(2, 'u1', client as never);

    expect(input.known_word_ids).toEqual([1]);
  });

  it('saca las lecturas vistas hace poco del evento que markRead escribe', async () => {
    const client = plannerClient({
      readings: catalog,
      tokensByReading: { r1: [], r2: [] },
      events: [{ payload: { reading_slug: 'r1' } }, { payload: { reading_slug: 'r1' } }],
    });

    const input = await getReadingPlannerInput(2, 'u1', client as never);

    expect(input.recent_content_ids).toEqual(['r1']);
  });

  it('cuenta como cubierto el tema de una lectura terminada, no el de una empezada', async () => {
    const client = plannerClient({
      readings: catalog,
      tokensByReading: { r1: [], r2: [] },
      progress: [
        { reading_slug: 'r1', finished_at: '2026-09-04T10:00:00Z' },
        { reading_slug: 'r2', finished_at: null },
      ],
    });

    const input = await getReadingPlannerInput(2, 'u1', client as never);

    expect(input.finished_slugs).toEqual(['r1']);
    expect(input.covered_topics).toEqual(['compras']);
  });

  it('no inventa vocabulario cuando el tokenizador no responde', async () => {
    // Sin word_ids no se puede rankear. Rankear con la lista vacía daría valor
    // cero a todas y el planificador elegiría por orden alfabético.
    const client = plannerClient({ readings: catalog });
    client.functions.invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } });

    const input = await getReadingPlannerInput(2, 'u1', client as never);

    expect(input.rankable).toEqual([]);
    expect(input.rows).toHaveLength(2);
  });
});
