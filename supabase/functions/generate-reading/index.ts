import { buildFallbackReading, VALID_READING_FORMATS } from '../_shared/ai.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = getServiceClient();
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return jsonResponse({ error: 'Missing bearer token' }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const level = Math.max(1, Math.min(6, Number.parseInt(String(body?.level || 1), 10) || 1));
    const format = String(body?.format || 'short_text');

    if (!VALID_READING_FORMATS.has(format)) {
      return jsonResponse({ error: 'Invalid reading format' }, 400);
    }

    const { data: cachedRows, error: cachedError } = await supabase
      .from('generated_readings')
      .select('id, hsk_level, format, title, content, pinyin_text, questions, source_model, created_by')
      .eq('hsk_level', level)
      .eq('format', format)
      .or(`created_by.is.null,created_by.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (cachedError) {
      return jsonResponse({ error: cachedError.message || 'Failed to load readings' }, 500);
    }

    if (cachedRows && cachedRows.length > 0) {
      const selected = cachedRows[Math.floor(Math.random() * cachedRows.length)];
      return jsonResponse({
        id: selected.id,
        hsk_level: selected.hsk_level,
        format: selected.format,
        title: selected.title,
        content: selected.content,
        pinyin_text: selected.pinyin_text,
        questions: selected.questions || [],
        source_model: selected.source_model,
      });
    }

    const fallback = buildFallbackReading(level, format);
    const { data: inserted, error: insertError } = await supabase
      .from('generated_readings')
      .insert({
        ...fallback,
        source_model: 'fallback',
        created_by: user.id,
      })
      .select('id, hsk_level, format, title, content, pinyin_text, questions, source_model')
      .single();

    if (insertError || !inserted) {
      return jsonResponse({ error: insertError?.message || 'Failed to create fallback reading' }, 500);
    }

    return jsonResponse({
      id: inserted.id,
      hsk_level: inserted.hsk_level,
      format: inserted.format,
      title: inserted.title,
      content: inserted.content,
      pinyin_text: inserted.pinyin_text,
      questions: inserted.questions || [],
      source_model: inserted.source_model,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unexpected error while generating reading',
      },
      500
    );
  }
});
