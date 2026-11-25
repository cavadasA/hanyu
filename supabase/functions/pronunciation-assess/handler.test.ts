import { describe, expect, it, vi } from 'vitest';
import { handlePronunciationAssess, MAX_AUDIO_SECONDS } from './handler';

const SAMPLE_RATE = 16000;

/** WAV PCM 16 kHz, mono, 16 bits, en silencio. */
function wavBase64(seconds: number, { sampleRate = SAMPLE_RATE, channels = 1 } = {}): string {
  const dataSize = Math.round(seconds * sampleRate) * channels * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  return Buffer.from(buffer).toString('base64');
}

function authClient(userId: string | null = 'user-1') {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null }, error: null })),
    },
  };
}

function request(body: unknown, token = 'jwt') {
  return new Request('https://functions.local/pronunciation-assess', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

const CONFIGURED = { AZURE_SPEECH_KEY: 'test-key', AZURE_SPEECH_REGION: 'westeurope' };

// Forma de la respuesta detallada de la API REST de audio corto con
// evaluación de pronunciación (las puntuaciones, planas en NBest y en Words).
const AZURE_SAMPLE = {
  RecognitionStatus: 'Success',
  Offset: 500000,
  Duration: 9800000,
  DisplayText: '你好。',
  NBest: [
    {
      Confidence: 0.94,
      Lexical: '你 好',
      Display: '你好。',
      AccuracyScore: 82,
      FluencyScore: 90,
      CompletenessScore: 100,
      PronScore: 86.4,
      Words: [
        { Word: '你', Offset: 500000, Duration: 3000000, AccuracyScore: 95, ErrorType: 'None' },
        { Word: '好', Offset: 3600000, Duration: 4000000, AccuracyScore: 69, ErrorType: 'Mispronunciation' },
      ],
    },
  ],
};

function azureFetch(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status }));
}

describe('handlePronunciationAssess', () => {
  it('sin AZURE_SPEECH_KEY responde 503 not_configured y no llama a nadie', async () => {
    const fetchImpl = azureFetch(AZURE_SAMPLE);

    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }),
      { supabase: authClient(), fetch: fetchImpl, env: {} },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ reason: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exige sesión: la clave de Azure cuesta dinero', async () => {
    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }, ''),
      { supabase: authClient(), fetch: azureFetch(AZURE_SAMPLE), env: CONFIGURED },
    );

    expect(response.status).toBe(401);
  });

  it('mapea la respuesta de Azure a puntuación por sílaba', async () => {
    const fetchImpl = azureFetch(AZURE_SAMPLE);

    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1.2), reference_text: '你好' }),
      { supabase: authClient(), fetch: fetchImpl, env: CONFIGURED },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accuracy: 82,
      fluency: 90,
      completeness: 100,
      syllables: [
        { syllable: '你', accuracy: 95 },
        { syllable: '好', accuracy: 69 },
      ],
    });
  });

  it('pide a Azure zh-CN, centésimas y granularidad de fonema, con el texto de referencia', async () => {
    const fetchImpl = azureFetch(AZURE_SAMPLE);

    await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }),
      { supabase: authClient(), fetch: fetchImpl, env: CONFIGURED },
    );

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed',
    );
    const headers = new Headers(init.headers);
    expect(headers.get('Ocp-Apim-Subscription-Key')).toBe('test-key');
    expect(headers.get('Content-Type')).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
    const config = JSON.parse(Buffer.from(headers.get('Pronunciation-Assessment')!, 'base64').toString('utf8'));
    expect(config).toEqual({
      ReferenceText: '你好',
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
    });
  });

  it('acepta también las puntuaciones anidadas en PronunciationAssessment', async () => {
    const nested = {
      RecognitionStatus: 'Success',
      NBest: [{
        PronunciationAssessment: { AccuracyScore: 70, FluencyScore: 60, CompletenessScore: 50, PronScore: 62 },
        Words: [{ Word: '好', PronunciationAssessment: { AccuracyScore: 70, ErrorType: 'None' } }],
      }],
    };

    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '好' }),
      { supabase: authClient(), fetch: azureFetch(nested), env: CONFIGURED },
    );

    await expect(response.json()).resolves.toEqual({
      accuracy: 70,
      fluency: 60,
      completeness: 50,
      syllables: [{ syllable: '好', accuracy: 70 }],
    });
  });

  it(`rechaza con 413 un audio de más de ${MAX_AUDIO_SECONDS} s sin llamar a Azure`, async () => {
    const fetchImpl = azureFetch(AZURE_SAMPLE);

    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(MAX_AUDIO_SECONDS + 1), reference_text: '你好' }),
      { supabase: authClient(), fetch: fetchImpl, env: CONFIGURED },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ reason: 'audio_too_long' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rechaza audio que no es WAV PCM de 16 kHz mono', async () => {
    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1, { sampleRate: 44100 }), reference_text: '你好' }),
      { supabase: authClient(), fetch: azureFetch(AZURE_SAMPLE), env: CONFIGURED },
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ reason: 'unsupported_audio' });
  });

  it('rechaza una petición sin texto de referencia', async () => {
    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '  ' }),
      { supabase: authClient(), fetch: azureFetch(AZURE_SAMPLE), env: CONFIGURED },
    );

    expect(response.status).toBe(400);
  });

  it('si Azure no reconoce nada, lo dice y no inventa puntuación', async () => {
    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }),
      {
        supabase: authClient(),
        fetch: azureFetch({ RecognitionStatus: 'InitialSilenceTimeout' }),
        env: CONFIGURED,
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ reason: 'not_recognized' });
  });

  it('si Azure falla, responde 502 sin puntuación', async () => {
    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }),
      { supabase: authClient(), fetch: azureFetch({ error: 'quota' }, 429), env: CONFIGURED },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ reason: 'provider_error' });
  });

  it('no reparte la nota de una palabra de varios caracteres entre sus sílabas', async () => {
    // Azure solo da sílabas en en-US. Si en zh-CN agrupa caracteres en una
    // palabra, no hay nota por sílaba que devolver: inventarla sería mentir.
    const grouped = {
      RecognitionStatus: 'Success',
      NBest: [{
        AccuracyScore: 80,
        FluencyScore: 80,
        CompletenessScore: 100,
        Words: [{ Word: '你好', AccuracyScore: 80, ErrorType: 'None' }],
      }],
    };

    const response = await handlePronunciationAssess(
      request({ audio_base64: wavBase64(1), reference_text: '你好' }),
      { supabase: authClient(), fetch: azureFetch(grouped), env: CONFIGURED },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ reason: 'no_syllable_scores' });
  });
});
