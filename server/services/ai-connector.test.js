import { describe, it, expect } from 'vitest';
import { getAiProvider } from './ai-connector.js';
import { DeepSeekProvider } from './deepseek-provider.js';
import { GeminiProvider } from './gemini-provider.js';

describe('AI Connector', () => {
  it('returns DeepSeekProvider when ai_provider is deepseek', () => {
    const provider = getAiProvider({ ai_provider: 'deepseek', api_key: 'test-key' });
    expect(provider).toBeInstanceOf(DeepSeekProvider);
  });

  it('returns GeminiProvider when ai_provider is gemini', () => {
    const provider = getAiProvider({ ai_provider: 'gemini', api_key: 'test-key' });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('returns null when ai_provider is none', () => {
    const provider = getAiProvider({ ai_provider: 'none', api_key: '' });
    expect(provider).toBeNull();
  });

  it('returns null when no api_key', () => {
    const provider = getAiProvider({ ai_provider: 'deepseek', api_key: '' });
    expect(provider).toBeNull();
  });
});

describe('DeepSeekProvider', () => {
  it('builds exercise prompt with correct structure', () => {
    const provider = new DeepSeekProvider('test-key');
    const prompt = provider.buildExercisePrompt('fill_blank', 1, { words: ['你', '好'] });

    expect(prompt).toContain('fill_blank');
    expect(prompt).toContain('HSK 1');
    expect(prompt).toContain('JSON');
  });

  it('builds reading prompt with correct structure', () => {
    const provider = new DeepSeekProvider('test-key');
    const prompt = provider.buildReadingPrompt(1, 'dialogue');

    expect(prompt).toContain('dialogue');
    expect(prompt).toContain('HSK 1');
  });
});

describe('GeminiProvider', () => {
  it('builds exercise prompt with correct structure', () => {
    const provider = new GeminiProvider('test-key');
    const prompt = provider.buildExercisePrompt('multiple_choice', 2, { words: ['已经'] });

    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('HSK 2');
  });
});