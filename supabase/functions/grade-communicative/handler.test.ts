import { describe, expect, it, vi } from 'vitest';
import { GRADER_MODEL, buildGraderPrompt, handleGradeCommunicative } from './handler';

const TASK_ROW = {
  slug: '2-03-rechazar-invitacion',
  hsk_level: 2,
  situation_es: 'Tu compañera te invita al cine el sábado. No puedes: explica por qué y propón otro día.',
  mode: 'write',
  intent: ['rechazar la invitación', 'dar un motivo', 'proponer otro día'],
  required_markers: [{ hsk_level: 2, code: '6.4.3' }],
  min_chars: 6,
  max_chars: 30,
  model_answer: { zh: '我今天有事，所以不能去。明天去吧！', pinyin: '…', es: '…' },
};

function client(row: unknown = TASK_ROW) {
  const tables: string[] = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  return {
    tables,
    query,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => {
      tables.push(table);
      return query;
    }),
  };
}

function request(body: unknown, token = 'jwt') {
  return new Request('https://functions.local/grade-communicative', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

const ANSWER = '因为我今天有事，所以不能去。明天去吧！';
const CONFIGURED = { ANTHROPIC_API_KEY: 'test-key' };

describe('handleGradeCommunicative', () => {
  it('sin ANTHROPIC_API_KEY responde 503 not_configured y no llama al modelo', async () => {
    const callModel = vi.fn();

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase: client(), callModel, env: {} },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ reason: 'not_configured' });
    expect(callModel).not.toHaveBeenCalled();
  });

  it('exige sesión', async () => {
    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }, ''),
      { supabase: client(), callModel: vi.fn(), env: CONFIGURED },
    );

    expect(response.status).toBe(401);
  });

  it('todas las intenciones cumplidas → acierto, con la devolución del evaluador', async () => {
    const callModel = vi.fn(async () => JSON.stringify({ intents: [true, true, true], feedback_es: 'Bien.' }));

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase: client(), callModel, env: CONFIGURED },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'graded',
      passed: true,
      intents: [true, true, true],
      feedback_es: 'Bien.',
    });
  });

  it('una intención sin cumplir → fallo, con feedback_es', async () => {
    const callModel = vi.fn(async () =>
      JSON.stringify({ intents: [true, true, false], feedback_es: 'No propones otro día.' }),
    );

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase: client(), callModel, env: CONFIGURED },
    );

    await expect(response.json()).resolves.toEqual({
      status: 'graded',
      passed: false,
      intents: [true, true, false],
      feedback_es: 'No propones otro día.',
    });
  });

  it('JSON inválido → ungraded, sin nota inventada y sin escribir nada', async () => {
    const supabase = client();

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase, callModel: vi.fn(async () => 'Sí, cumple todo {'), env: CONFIGURED },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ungraded' });
    expect(supabase.tables).toEqual(['communicative_task']);
  });

  it('un número de intenciones distinto al de la tarea → ungraded', async () => {
    const callModel = vi.fn(async () => JSON.stringify({ intents: [true, true], feedback_es: 'Bien.' }));

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase: client(), callModel, env: CONFIGURED },
    );

    await expect(response.json()).resolves.toEqual({ status: 'ungraded' });
  });

  it('el modelo no responde → ungraded', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('timeout');
    });

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER }),
      { supabase: client(), callModel, env: CONFIGURED },
    );

    await expect(response.json()).resolves.toEqual({ status: 'ungraded' });
  });

  it('repite las reglas de forma: pinyin no llega al modelo', async () => {
    const callModel = vi.fn();

    const response = await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: 'wo bu neng qu' }),
      { supabase: client(), callModel, env: CONFIGURED },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ status: 'rejected', reasons: ['not_chinese'] });
    expect(callModel).not.toHaveBeenCalled();
  });

  it('una tarea que no existe → 404', async () => {
    const response = await handleGradeCommunicative(
      request({ task_slug: 'no-existe', answer: ANSWER }),
      { supabase: client(null), callModel: vi.fn(), env: CONFIGURED },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ reason: 'unknown_task' });
  });

  it('lee la tarea de la base, no del cuerpo de la petición', async () => {
    const supabase = client();
    const callModel = vi.fn(async () => JSON.stringify({ intents: [true, true, true], feedback_es: 'Bien.' }));

    await handleGradeCommunicative(
      request({ task_slug: TASK_ROW.slug, answer: ANSWER, intent: ['decir hola'] }),
      { supabase, callModel, env: CONFIGURED },
    );

    expect(supabase.query.eq).toHaveBeenCalledWith('slug', TASK_ROW.slug);
    const [prompt] = callModel.mock.calls[0] as unknown as [ReturnType<typeof buildGraderPrompt>];
    expect(prompt.user).toContain('proponer otro día');
    expect(prompt.user).not.toContain('decir hola');
  });
});

describe('buildGraderPrompt', () => {
  it('fija la rúbrica y aísla la respuesta del alumno como dato', () => {
    const prompt = buildGraderPrompt(TASK_ROW as never, ANSWER);

    expect(prompt.system).toContain('solo si cumple cada intención');
    expect(prompt.user).toContain(`<respuesta>${ANSWER}</respuesta>`);
    expect(prompt.user).toContain('1. rechazar la invitación');
    expect(prompt.user).toContain('3. proponer otro día');
  });

  it('el evaluador es Claude Haiku 5.5', () => {
    expect(GRADER_MODEL).toBe('claude-haiku-5-5');
  });
});
