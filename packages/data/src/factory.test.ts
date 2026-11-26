import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = { auth: {} as Record<string, unknown> };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeClient,
}));

const getTodayMock = vi.fn((_client?: unknown) => Promise.resolve({ ok: true }));
const sendPasswordResetMock = vi.fn(
  (_email?: string, _client?: unknown, _redirectTo?: string) => Promise.resolve(undefined)
);
const getReadingsMock = vi.fn();
const getReadingMock = vi.fn();

vi.mock('./repositories/today', () => ({
  getToday: (client: unknown) => getTodayMock(client as never),
}));

vi.mock('./repositories/readings', () => ({
  completeReading: vi.fn(),
  getReading: (slug: string, client: unknown) => getReadingMock(slug, client),
  getReadings: (params: unknown, client: unknown) => getReadingsMock(params, client),
  getReadingProgress: vi.fn(),
  markRead: vi.fn(),
  saveReadingProgress: vi.fn(),
  toggleBookmark: vi.fn(),
}));

vi.mock('./auth', () => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
  sendPasswordReset: (email: string, client: unknown, redirectTo?: string) =>
    sendPasswordResetMock(email as never, client as never, redirectTo as never),
}));

const { createHanyuData } = await import('./factory');

const config = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' };

describe('createHanyuData', () => {
  beforeEach(() => {
    getTodayMock.mockClear();
    sendPasswordResetMock.mockClear();
    getReadingsMock.mockReset();
    getReadingMock.mockReset();
  });

  it('binds the created client to every repository call', async () => {
    const data = createHanyuData(config);

    await data.today.getToday();

    expect(getTodayMock).toHaveBeenCalledWith(fakeClient);
  });

  it('injects the configured password reset redirect', async () => {
    const data = createHanyuData({ ...config, passwordResetRedirectTo: 'https://hanyu.app' });

    await data.auth.sendPasswordReset('learner@example.com');

    expect(sendPasswordResetMock).toHaveBeenCalledWith(
      'learner@example.com',
      fakeClient,
      'https://hanyu.app'
    );
  });

  it('exposes the whole repository surface', () => {
    const data = createHanyuData(config);

    expect(Object.keys(data).sort()).toEqual(
      ['auth', 'client', 'decks', 'events', 'exam', 'exercises', 'expression', 'flashcards', 'grammar', 'readings', 'settings', 'skills', 'stats', 'today', 'words'].sort()
    );
  });

  it('carga una lectura desde la caché cuando se pierde la red', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(),
    };
    const reading = { id: 'reading-1', sentences: [{ zh: '你好。' }] };
    getReadingMock.mockResolvedValueOnce(reading).mockRejectedValueOnce(new Error('offline'));
    const data = createHanyuData({ ...config, storage });

    await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    expect(storage.setItem).toHaveBeenCalled();
    expect(getReadingMock).toHaveBeenCalledTimes(2);
  });

  // GoTrueClient.getSession usa `this`: sacarla del objeto y llamarla suelta
  // lanzaba, la caché se quedaba sin ámbito de usuario y nunca se escribía.
  it('cachea con el cliente de auth real, cuyos métodos dependen de this', async () => {
    class AuthWithThis {
      private readonly userId = 'user-a';
      async getSession() {
        return { data: { session: { user: { id: this.userId } } }, error: null };
      }
    }
    const originalAuth = fakeClient.auth;
    fakeClient.auth = new AuthWithThis() as never;
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(),
    };
    const reading = { id: 'reading-1', sentences: [{ zh: '你好。' }] };
    getReadingMock.mockResolvedValueOnce(reading).mockRejectedValueOnce(new Error('Failed to fetch'));

    try {
      const data = createHanyuData({ ...config, storage });
      await data.readings.getReading('reading-1');
      expect(storage.setItem).toHaveBeenCalledWith(expect.stringContaining('user-a'), expect.any(String));
      await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    } finally {
      fakeClient.auth = originalAuth;
    }
  });

  it('no sustituye un error HTTP por contenido cacheado', async () => {
    const storage = {
      getItem: vi.fn((key: string) => key ? JSON.stringify({ id: 'cached' }) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const data = createHanyuData({ ...config, storage });
    getReadingMock.mockRejectedValue(Object.assign(new Error('Reading not found'), { status: 404 }));

    await expect(data.readings.getReading('reading-404')).rejects.toMatchObject({ status: 404 });
  });

  it('separa la caché de lecturas por usuario', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(),
    };
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    fakeClient.auth.getUser = getUser;
    const reading = { id: 'reading-1', sentences: [{ zh: '你好。' }] };
    getReadingMock.mockResolvedValueOnce(reading).mockRejectedValueOnce(new Error('Failed to fetch'));
    const data = createHanyuData({ ...config, storage });

    await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-b' } }, error: null });
    await expect(data.readings.getReading('reading-1')).rejects.toThrow('Failed to fetch');

    delete fakeClient.auth.getUser;
  });

  it('cachea el catálogo completo para poder abrir una lectura no visitada offline', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(),
    };
    getReadingsMock.mockResolvedValue([{
      id: 'reading-1', slug: 'reading-1', title: 'Una lectura',
      offline: {
        sentences: [{ zh: '你好。', pinyin: 'Nǐ hǎo.', es: 'Hola.', tokens: [] }],
        content: '你好。', grammar_points: [], questions: [], tokens: [],
      },
    }]);
    const data = createHanyuData({ ...config, storage });
    await data.readings.getReadings({ level: 2 });
    getReadingMock.mockRejectedValue(new Error('Failed to fetch'));

    await expect(data.readings.getReading('reading-1')).resolves.toMatchObject({
      id: 'reading-1',
      sentences: [{ zh: '你好。' }],
    });
  });

  // Sin red, la lista tardaba 20–25 s en caer a la caché: con el token caducado,
  // getSession reintenta el refresco con backoff antes de rendirse, y la petición
  // espera a lo mismo. Con copia guardada no hay por qué esperar tanto.
  describe('cuando la red no responde', () => {
    const never = () => new Promise<never>(() => undefined);
    const list = [{ id: 'reading-1', slug: 'reading-1', title: 'Una lectura' }];
    let values: Map<string, string>;
    let storage: { getItem: any; setItem: any; removeItem: any };
    let getSession: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      values = new Map();
      storage = {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
        removeItem: vi.fn(),
      };
      getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-a' } } }, error: null });
      fakeClient.auth.getSession = getSession;
    });

    afterEach(() => {
      vi.useRealTimers();
      delete fakeClient.auth.getSession;
    });

    async function settledWithin(ms: number, promise: Promise<unknown>) {
      let state: 'pending' | 'resolved' | 'rejected' = 'pending';
      let value: unknown;
      promise.then(v => { state = 'resolved'; value = v; }, e => { state = 'rejected'; value = e; });
      await vi.advanceTimersByTimeAsync(ms);
      return { state, value };
    }

    it('con copia guardada, sirve la lista de la caché en pocos segundos', async () => {
      getReadingsMock.mockResolvedValueOnce(list).mockImplementationOnce(never);
      const data = createHanyuData({ ...config, storage });
      await data.readings.getReadings({ level: 2 });

      const result = await settledWithin(5_000, data.readings.getReadings({ level: 2 }));
      expect(result).toEqual({ state: 'resolved', value: list });
    });

    it('aunque se cuelgue el refresco de la sesión, usa la caché del último usuario', async () => {
      getReadingsMock.mockResolvedValueOnce(list).mockImplementationOnce(never);
      const data = createHanyuData({ ...config, storage });
      await data.readings.getReadings({ level: 2 });
      getSession.mockImplementation(never);

      const result = await settledWithin(8_000, data.readings.getReadings({ level: 2 }));
      expect(result).toEqual({ state: 'resolved', value: list });
    });

    it('tras reiniciar la app, recuerda el último usuario desde el almacenamiento', async () => {
      getReadingsMock.mockResolvedValueOnce(list).mockImplementationOnce(never);
      await createHanyuData({ ...config, storage }).readings.getReadings({ level: 2 });
      getSession.mockImplementation(never);

      const fresh = createHanyuData({ ...config, storage });
      const result = await settledWithin(8_000, fresh.readings.getReadings({ level: 2 }));
      expect(result).toEqual({ state: 'resolved', value: list });
    });

    it('sin copia guardada, sigue esperando a la red en vez de fallar antes', async () => {
      let answer: (value: unknown) => void = () => undefined;
      getReadingsMock.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
      const data = createHanyuData({ ...config, storage });

      const pending = data.readings.getReadings({ level: 2 });
      expect((await settledWithin(10_000, pending)).state).toBe('pending');
      answer(list);
      await expect(pending).resolves.toEqual(list);
    });

    it('una lectura abierta antes también sale de la caché sin esperar a la red', async () => {
      const reading = { id: 'reading-1', sentences: [{ zh: '你好。' }] };
      getReadingMock.mockResolvedValueOnce(reading).mockImplementationOnce(never);
      const data = createHanyuData({ ...config, storage });
      await data.readings.getReading('reading-1');

      const result = await settledWithin(5_000, data.readings.getReading('reading-1'));
      expect(result).toEqual({ state: 'resolved', value: reading });
    });
  });
});
