import { describe, expect, it, vi } from 'vitest';
import { getToday } from './today';

type RpcFailure = 'missing' | 'network';

function rpcError(failure: RpcFailure | undefined) {
  if (!failure) return null;
  return failure === 'missing'
    ? { code: 'PGRST202', message: 'Function was not found' }
    : { code: '42501', message: 'Network or permission failure' };
}

function tableQuery(rows: unknown[]) {
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
}

function clientFor(options: {
  settings?: Record<string, unknown>;
  reading?: unknown;
  readings?: unknown[];
  tokensByReading?: Record<string, unknown[]>;
  states?: unknown[];
  progress?: unknown[];
  events?: unknown[];
  dueCount?: number;
  deckSize?: number;
  dueState?: { regular_due_count: number; relearning_count: number };
  queue?: unknown[];
  unit?: unknown;
  dueStateError?: RpcFailure;
  unitError?: RpcFailure;
  learnQueueError?: RpcFailure;
} = {}) {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ deck_id: null, count: options.deckSize ?? 150 }], error: null })
    .mockResolvedValueOnce({ data: [{ deck_id: null, count: options.dueCount ?? 3 }], error: null })
    .mockResolvedValueOnce({
      data: [options.dueState ?? { regular_due_count: 2, relearning_count: 1 }],
      error: rpcError(options.dueStateError),
    })
    .mockResolvedValueOnce({
      data: options.unit === undefined
        ? [{ code: '2.2.3', title: '离合词', total_words: 4, settled_words: 1 }]
        : options.unit,
      error: rpcError(options.unitError),
    })
    .mockResolvedValueOnce({
      data: options.queue ?? [
        { is_new: true, fsrs_state: 'new' },
        { is_new: false, fsrs_state: 'review' },
        { is_new: false, fsrs_state: 'relearning' },
      ],
      error: rpcError(options.learnQueueError),
    })
    .mockResolvedValueOnce({
      data: options.queue ?? [{ is_new: true, fsrs_state: 'new' }],
      error: null,
    });

  const from = vi.fn((table: string) => {
    if (table === 'user_settings') {
      const s = { select: vi.fn() };
      s.select.mockReturnValue({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              user_id: 'u1',
              review_limit_per_day: 200,
              session_size: 20,
              card_order: 'due',
              new_cards_per_day: 20,
              current_level: 2,
              theme: 'light',
              ...options.settings,
            },
            error: null,
          }),
        })),
      });
      return s;
    }

    if (table === 'user_stats') {
      const s = { select: vi.fn() };
      s.select.mockReturnValue({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
      });
      return s;
    }

    if (table === 'reading') {
      const rows = options.readings ?? (options.reading ? [options.reading] : []);
      return tableQuery(rows);
    }

    if (table === 'reading_progress') return tableQuery(options.progress ?? []);
    if (table === 'learning_event') return tableQuery(options.events ?? []);
    if (table === 'learner_skill_state') return tableQuery(options.states ?? []);

    return { select: vi.fn(() => ({ data: [], error: null })) };
  });

  const client: Record<string, any> = {
    rpc,
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  };

  if (options.tokensByReading) {
    client.functions = {
      invoke: vi.fn().mockResolvedValue({
        data: { tokens_by_reading: options.tokensByReading },
        error: null,
      }),
    };
  }

  return client as never;
}

const CATALOG = [
  { slug: 'r1', hsk_level: 2, title: 'Té y café', topic: 'compras', format: 'short_text', target_words: [], sentences: [] },
  { slug: 'r2', hsk_level: 2, title: 'La biblioteca', topic: 'lugares', format: 'short_text', target_words: [], sentences: [] },
];

function tokensFor(ids: number[]) {
  return ids.map((id, index) => ({
    id: `t${index}`,
    text: `w${id}`,
    type: 'word',
    word: { id, hanzi: `w${id}` },
  }));
}

/** Doce conocidas de trece: 92,3 %, dentro del rango cómodo del planificador. */
const COMFORTABLE = tokensFor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
/** Dos conocidas de cuatro: 50 %, se descifra en vez de leerse. */
const TOO_HARD = tokensFor([1, 2, 90, 91]);
const KNOWN_STATES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  .map(id => ({ target_id: id, stability: 40 }));

describe('getToday', () => {
  it('counts due and deck size via the scoped count RPC', async () => {
    const client = clientFor();

    const today = await getToday(client as never);

    expect((client as any).rpc).toHaveBeenNthCalledWith(1, 'count_deck_cards', {
      p_deck_id: null,
      p_due_only: false,
    });
    expect((client as any).rpc).toHaveBeenNthCalledWith(2, 'count_deck_cards', {
      p_deck_id: null,
      p_due_only: true,
    });
    expect((client as any).rpc).toHaveBeenNthCalledWith(5, 'build_review_queue_mode', {
      p_mode: 'learn',
      p_deck_id: null,
      p_skill: 'recognition',
      p_limit: null,
    });
    expect(today.flashcards.due).toBe(3);
    expect(today.flashcards.deck_size).toBe(150);
    expect(today.flashcards.new_target).toBe(20);
    expect(today.flashcards.review_target).toBe(200);
  });

  it('no fuerza el nivel del usuario a 2', async () => {
    const today = await getToday(clientFor({ settings: { current_level: 1 } }));

    expect(today.profile.current_level).toBe(1);
  });

  it('no afirma un modo de estudio que nadie ha elegido', async () => {
    const today = await getToday(clientFor({ settings: { current_level: 2 } }));

    expect(today.profile).not.toHaveProperty('mode');
  });

  it('la meta de tarjetas nuevas sale de los ajustes', async () => {
    const today = await getToday(clientFor({ settings: { new_cards_per_day: 15 } }));

    expect(today.flashcards.new_target).toBe(15);
  });

  it('lee la próxima lectura del catálogo reading', async () => {
    const reading = { slug: 'reading-1', title: 'Una lectura', hsk_level: 2, format: 'short_text' };
    const client = clientFor({ reading });

    const today = await getToday(client as never);

    expect(today.reading.next).toEqual(reading);
    expect((client as any).from).toHaveBeenCalledWith('reading');
  });

  it('incluye el plan diario construido con unidad y cola', async () => {
    const client = clientFor();
    const today = await getToday(client);

    expect(today.steps.map((step) => step.kind)).toEqual([
      'reviews',
      'relearning',
      'new_items',
      'reading',
      'exercises',
      'exam',
    ]);
    expect(today.steps[0]).toMatchObject({ kind: 'reviews', status: 'ready', payload: { count: 2 } });
    expect(today.steps[2]).toMatchObject({
      kind: 'new_items',
      status: 'ready',
      payload: { unit_title: '离合词', unit_progress: '1/4' },
    });
  });

  it('un usuario sin mazos no ve el cupo de palabras nuevas como agotado', async () => {
    const result = await getToday(clientFor({ deckSize: 0, queue: [] }));
    const newItems = (result as any).steps.find((step: any) => step.kind === 'new_items');

    expect(newItems).toMatchObject({ status: 'unavailable', reason: 'no_deck' });
  });

  it('separa repasos normales y reaprendizaje sin contar el subconjunto dos veces', async () => {
    const today = await getToday(clientFor());

    expect(today.steps[0]).toMatchObject({ payload: { count: 2 } });
    expect(today.steps[1]).toMatchObject({ payload: { count: 1 } });
  });

  it('usa el conteo real aunque la cola entregada esté limitada por la sesión', async () => {
    const queue = Array.from({ length: 20 }, (_, index) => ({
      is_new: false,
      fsrs_state: index === 0 ? 'relearning' : 'review',
    }));
    const today = await getToday(clientFor({
      dueCount: 137,
      dueState: { regular_due_count: 136, relearning_count: 1 },
      queue,
    }));

    expect(today.flashcards.due).toBe(137);
    expect(today.steps[0]).toMatchObject({ payload: { count: 136 } });
    expect(today.steps[1]).toMatchObject({ payload: { count: 1 } });
  });

  it('degrada los RPC opcionales sin tumbar Today', async () => {
    const today = await getToday(clientFor({
      dueStateError: 'missing',
      unitError: 'missing',
      learnQueueError: 'missing',
    }));

    expect(today.flashcards.due).toBe(3);
    expect(today.steps[0]).toMatchObject({ payload: { count: 3 } });
    expect(today.steps[1]).toMatchObject({ status: 'unavailable', reason: 'nothing_due' });
    expect(today.steps[2]).toMatchObject({ status: 'unavailable', reason: 'unit_unavailable' });
  });

  it('usa la cola antigua solo como degradación cuando falta la cola Learn', async () => {
    const client = clientFor({
      learnQueueError: 'missing',
      queue: [
        { is_new: true, fsrs_state: 'new' },
        { is_new: true, fsrs_state: 'new' },
      ],
    });
    const today = await getToday(client);

    expect(today.steps[2]).toMatchObject({ payload: { count: 2 } });
    expect((client as any).rpc).toHaveBeenNthCalledWith(6, 'build_review_queue', {
      p_deck_id: null,
      p_skill: 'recognition',
      p_limit: null,
    });
  });

  it('propaga errores de red o permisos en los RPC opcionales', async () => {
    await expect(getToday(clientFor({ unitError: 'network' }))).rejects.toThrow(
      'Network or permission failure',
    );
  });

  it('propone la lectura del catálogo en vez de declarar que no hay ninguna', async () => {
    const client = clientFor({
      readings: CATALOG,
      tokensByReading: { r1: COMFORTABLE, r2: TOO_HARD },
      states: KNOWN_STATES,
    });

    const today = await getToday(client);
    const reading = today.steps.find(step => step.kind === 'reading');

    expect(reading).toMatchObject({ status: 'ready', payload: { id: 'r1' } });
  });

  it('explica por qué propone esa lectura', async () => {
    const client = clientFor({
      readings: CATALOG,
      tokensByReading: { r1: COMFORTABLE },
      states: KNOWN_STATES,
    });

    const today = await getToday(client);
    const reading = today.steps.find(step => step.kind === 'reading');

    expect(reading?.why?.map(r => r.kind)).toContain('comprehensible');
  });

  it('deja de proponer una lectura terminada', async () => {
    // El criterio del Plan 8: terminarla escribe un learning_event y el
    // planificador deja de ofrecerla.
    const client = clientFor({
      readings: CATALOG,
      tokensByReading: { r1: COMFORTABLE, r2: COMFORTABLE },
      states: KNOWN_STATES,
      progress: [{ reading_slug: 'r1', finished_at: '2026-09-04T10:00:00Z' }],
      events: [{ payload: { reading_slug: 'r1' } }],
    });

    const today = await getToday(client);
    const reading = today.steps.find(step => step.kind === 'reading');

    expect(reading).toMatchObject({ status: 'ready', payload: { id: 'r2' } });
    expect((today.reading.next as any)?.slug).toBe('r2');
  });

  it('la tarjeta de hoy muestra la lectura que el plan eligió', async () => {
    const client = clientFor({
      readings: CATALOG,
      tokensByReading: { r1: TOO_HARD, r2: COMFORTABLE },
      states: KNOWN_STATES,
    });

    const today = await getToday(client);

    expect((today.reading.next as any)?.slug).toBe('r2');
  });

  it('no finge que el catálogo está vacío cuando no ha podido leerlo', async () => {
    const client = clientFor({ readings: CATALOG });

    const today = await getToday(client);
    const reading = today.steps.find(step => step.kind === 'reading');

    expect(reading).toMatchObject({ status: 'unavailable', reason: 'content_unavailable' });
    expect((today.reading.next as any)?.slug).toBe('r1');
  });

  it('toma como objetivo lo que se está aprendiendo ahora', async () => {
    const client = clientFor({
      readings: CATALOG,
      queue: [{ is_new: true, fsrs_state: 'new', word_id: 50 }],
      tokensByReading: { r1: tokensFor([50]) },
    });

    const today = await getToday(client);
    const reading = today.steps.find(step => step.kind === 'reading');

    expect(reading?.why?.map(r => r.kind)).toContain('reinforces_targets');
  });

});
