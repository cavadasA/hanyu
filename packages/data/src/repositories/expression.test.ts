import { describe, expect, it, vi } from 'vitest';
import { assessPronunciation, gradeCommunicative } from './expression';

/** supabase-js: una respuesta no 2xx llega como error con la Response en `context`. */
function httpError(status: number, body: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), { status }),
  });
}

function client(result: { data?: unknown; error?: unknown }) {
  return { functions: { invoke: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) } } as any;
}

const ASSESSMENT = {
  accuracy: 88,
  fluency: 90,
  completeness: 100,
  syllables: [{ syllable: '你', accuracy: 92 }, { syllable: '好', accuracy: 84 }],
};

describe('assessPronunciation', () => {
  it('200 → puntuación por sílaba', async () => {
    const fake = client({ data: ASSESSMENT });

    const outcome = await assessPronunciation({ audio_base64: 'UklGRg==', reference_text: '你好' }, fake);

    expect(fake.functions.invoke).toHaveBeenCalledWith('pronunciation-assess', {
      body: { audio_base64: 'UklGRg==', reference_text: '你好' },
    });
    expect(outcome).toEqual({ status: 'scored', assessment: ASSESSMENT });
  });

  it('503 not_configured → no disponible', async () => {
    const outcome = await assessPronunciation(
      { audio_base64: 'x', reference_text: '你好' },
      client({ error: httpError(503, { reason: 'not_configured' }) }),
    );

    expect(outcome).toEqual({ status: 'unavailable', reason: 'not_configured' });
  });

  it('sin red o con otra respuesta → no disponible, nunca una nota inventada', async () => {
    const offline = await assessPronunciation(
      { audio_base64: 'x', reference_text: '你好' },
      client({ error: Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' }) }),
    );
    const odd = await assessPronunciation({ audio_base64: 'x', reference_text: '你好' }, client({ data: { accuracy: 'alta' } }));

    expect(offline.status).toBe('unavailable');
    expect(odd.status).toBe('unavailable');
  });
});

describe('gradeCommunicative', () => {
  it('graded → con aprobado, intenciones y devolución', async () => {
    const graded = { status: 'graded', passed: false, intents: [true, false], feedback_es: 'Falta el motivo.' };

    const outcome = await gradeCommunicative({ task_slug: '2-03-x', answer: '我不去。' }, client({ data: graded }));

    expect(outcome).toEqual(graded);
  });

  it('ungraded → sin corregir', async () => {
    const outcome = await gradeCommunicative({ task_slug: '2-03-x', answer: '我不去。' }, client({ data: { status: 'ungraded' } }));

    expect(outcome).toEqual({ status: 'ungraded' });
  });

  it('422 → rechazada con sus motivos', async () => {
    const outcome = await gradeCommunicative(
      { task_slug: '2-03-x', answer: 'wo bu qu' },
      client({ error: httpError(422, { status: 'rejected', reasons: ['not_chinese'] }) }),
    );

    expect(outcome).toEqual({ status: 'rejected', reasons: ['not_chinese'] });
  });

  it('503 o sin red → no disponible', async () => {
    const unconfigured = await gradeCommunicative(
      { task_slug: '2-03-x', answer: '我不去。' },
      client({ error: httpError(503, { reason: 'not_configured' }) }),
    );
    const offline = await gradeCommunicative(
      { task_slug: '2-03-x', answer: '我不去。' },
      client({ error: new Error('Failed to fetch') }),
    );

    expect(unconfigured).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(offline).toEqual({ status: 'unavailable', reason: 'network' });
  });
});
