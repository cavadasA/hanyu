import { buildFallbackExercise, VALID_EXERCISE_TYPES } from '../_shared/ai.ts';
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
    const type = String(body?.type || 'fill_blank');
    const level = Math.max(1, Math.min(6, Number.parseInt(String(body?.level || 1), 10) || 1));

    if (!VALID_EXERCISE_TYPES.has(type)) {
      return jsonResponse({ error: 'Invalid exercise type' }, 400);
    }

    const { data: cachedRows, error: cachedError } = await supabase
      .from('generated_exercises')
      .select('id, type, hsk_level, prompt, answer, source_model, created_by')
      .eq('type', type)
      .eq('hsk_level', level)
      .or(`created_by.is.null,created_by.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (cachedError) {
      return jsonResponse({ error: cachedError.message || 'Failed to load exercises' }, 500);
    }

    if (cachedRows && cachedRows.length > 0) {
      const selected = cachedRows[Math.floor(Math.random() * cachedRows.length)];
      return jsonResponse({
        id: selected.id,
        ...(selected.prompt || {}),
        type: selected.type,
        hsk_level: selected.hsk_level,
      });
    }

    const fallback = buildFallbackExercise(type, level);
    const { data: inserted, error: insertError } = await supabase
      .from('generated_exercises')
      .insert({
        type,
        hsk_level: level,
        prompt: fallback.prompt,
        answer: fallback.answer,
        source_model: 'fallback',
        created_by: user.id,
      })
      .select('id, type, hsk_level, prompt')
      .single();

    if (insertError || !inserted) {
      return jsonResponse({ error: insertError?.message || 'Failed to create fallback exercise' }, 500);
    }

    return jsonResponse({
      id: inserted.id,
      ...(inserted.prompt || {}),
      type: inserted.type,
      hsk_level: inserted.hsk_level,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unexpected error while generating exercise',
      },
      500
    );
  }
});
