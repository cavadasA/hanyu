import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { getServiceClient } from '../_shared/supabase.ts';
import { GRADE_SCHEMA, GRADER_MODEL, handleGradeCommunicative, type GraderPrompt } from './handler.ts';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 }) : null;

// Juzgar unas pocas intenciones es una clasificación corta: esfuerzo bajo.
async function callModel(prompt: GraderPrompt): Promise<string> {
  if (!anthropic) throw new Error('not_configured');
  const response = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: 4096,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: GRADE_SCHEMA },
    },
  });
  // Una negativa o una salida cortada no es una nota: el handler la deja sin corregir.
  if (response.stop_reason !== 'end_turn') {
    throw new Error(`stop_reason ${response.stop_reason}`);
  }
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new Error('sin texto');
  return text.text;
}

Deno.serve((request) =>
  handleGradeCommunicative(request, {
    supabase: getServiceClient(),
    callModel,
    env: { ANTHROPIC_API_KEY: apiKey },
  })
);
