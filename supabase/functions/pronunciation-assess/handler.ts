// Pronunciación, nivel 2: Azure Pronunciation Assessment, zh-CN.
//
// Apagada hasta que exista la suscripción: sin AZURE_SPEECH_KEY y
// AZURE_SPEECH_REGION responde 503 { reason: 'not_configured' }, y el cliente
// no ofrece este nivel. La clave nunca sale de aquí.
//
// Azure solo da puntuación por sílaba en en-US. En zh-CN da puntuación por
// palabra; cuando la palabra es un único carácter, eso es una sílaba. Si agrupa
// varios caracteres, no hay nota por sílaba que devolver, y la función lo dice
// (502 no_syllable_scores) en lugar de repartir la nota de la palabra.
import { jsonResponse } from '../_shared/cors.ts';

/** Más largo que cualquier frase del HSK 2; Azure admite 30 s. */
export const MAX_AUDIO_SECONDS = 15;

const SAMPLE_RATE = 16000;
const HANZI = /^\p{Script=Han}$/u;

interface AuthClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export interface PronunciationDeps {
  supabase: AuthClient;
  fetch: typeof fetch;
  env: Partial<Record<'AZURE_SPEECH_KEY' | 'AZURE_SPEECH_REGION', string>>;
}

export interface PronunciationAssessment {
  accuracy: number;
  fluency: number;
  completeness: number;
  syllables: Array<{ syllable: string; accuracy: number }>;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64Utf8(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Duración de un WAV PCM 16 kHz mono de 16 bits, o null si no lo es. */
function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let format: { audioFormat: number; channels: number; sampleRate: number; bits: number } | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!format || format.audioFormat !== 1 || format.channels !== 1
        || format.sampleRate !== SAMPLE_RATE || format.bits !== 16) {
        return null;
      }
      const dataBytes = Math.min(size, bytes.length - body);
      return dataBytes / (SAMPLE_RATE * 2);
    }
    offset = body + size + (size % 2);
  }
  return null;
}

function score(entry: Record<string, any>, field: string): number | null {
  const value = entry?.PronunciationAssessment?.[field] ?? entry?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

type Mapped = { ok: true; value: PronunciationAssessment } | { ok: false; reason: string };

function mapAzure(payload: any): Mapped {
  if (payload?.RecognitionStatus !== 'Success') return { ok: false, reason: 'not_recognized' };
  const best = Array.isArray(payload.NBest) ? payload.NBest[0] : null;
  const accuracy = score(best, 'AccuracyScore');
  const fluency = score(best, 'FluencyScore');
  const completeness = score(best, 'CompletenessScore');
  const words = Array.isArray(best?.Words) ? best.Words : null;
  if (accuracy === null || fluency === null || completeness === null || !words) {
    return { ok: false, reason: 'provider_error' };
  }

  const syllables: PronunciationAssessment['syllables'] = [];
  for (const word of words) {
    const text = typeof word?.Word === 'string' ? word.Word : '';
    const wordAccuracy = score(word, 'AccuracyScore');
    if (!HANZI.test(text) || wordAccuracy === null) {
      return { ok: false, reason: 'no_syllable_scores' };
    }
    syllables.push({ syllable: text, accuracy: wordAccuracy });
  }

  return { ok: true, value: { accuracy, fluency, completeness, syllables } };
}

export async function handlePronunciationAssess(
  request: Request,
  deps: PronunciationDeps,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok');
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Missing bearer token' }, 401);
  const { data, error } = await deps.supabase.auth.getUser(token);
  if (error || !data.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const key = deps.env.AZURE_SPEECH_KEY;
  const region = deps.env.AZURE_SPEECH_REGION;
  if (!key || !region) return jsonResponse({ reason: 'not_configured' }, 503);

  const body = await request.json().catch(() => null);
  const referenceText = typeof body?.reference_text === 'string' ? body.reference_text.trim() : '';
  const audio = typeof body?.audio_base64 === 'string' ? decodeBase64(body.audio_base64) : null;
  if (!referenceText || !audio) {
    return jsonResponse({ error: 'audio_base64 and reference_text are required' }, 400);
  }

  const seconds = wavSeconds(audio);
  if (seconds === null) return jsonResponse({ reason: 'unsupported_audio' }, 415);
  if (seconds > MAX_AUDIO_SECONDS) return jsonResponse({ reason: 'audio_too_long' }, 413);

  const config = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
  };
  let azure: Response;
  try {
    azure = await deps.fetch(
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Pronunciation-Assessment': encodeBase64Utf8(JSON.stringify(config)),
          Accept: 'application/json',
        },
        body: new Blob([audio]),
      },
    );
  } catch {
    return jsonResponse({ reason: 'provider_error' }, 502);
  }
  if (!azure.ok) return jsonResponse({ reason: 'provider_error' }, 502);

  const payload = await azure.json().catch(() => null);
  const mapped = mapAzure(payload);
  if (!mapped.ok) {
    return jsonResponse({ reason: mapped.reason }, mapped.reason === 'not_recognized' ? 422 : 502);
  }
  return jsonResponse(mapped.value, 200);
}
