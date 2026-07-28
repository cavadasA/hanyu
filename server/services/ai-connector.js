import { DeepSeekProvider } from './deepseek-provider.js';
import { GeminiProvider } from './gemini-provider.js';

export function getAiProvider(settings) {
  const { ai_provider, api_key } = settings;

  if (!api_key || ai_provider === 'none') {
    return null;
  }

  switch (ai_provider) {
    case 'deepseek':
      return new DeepSeekProvider(api_key);
    case 'gemini':
      return new GeminiProvider(api_key);
    default:
      return null;
  }
}