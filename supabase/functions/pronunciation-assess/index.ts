import { getServiceClient } from '../_shared/supabase.ts';
import { handlePronunciationAssess } from './handler.ts';

Deno.serve((request) =>
  handlePronunciationAssess(request, {
    supabase: getServiceClient(),
    fetch,
    env: {
      AZURE_SPEECH_KEY: Deno.env.get('AZURE_SPEECH_KEY'),
      AZURE_SPEECH_REGION: Deno.env.get('AZURE_SPEECH_REGION'),
    },
  })
);
