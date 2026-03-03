/**
 * Tests for LLM prompt caching support:
 * - Cache metrics extraction (OpenAI + Anthropic response formats)
 * - Anthropic cache_control markers pass through processTemplate untouched
 */

import { describe, it, expect } from 'vitest';
import { UniversalHTTPProvider } from '../infrastructure/providers/clients/UniversalHTTPProvider';
import { TemplateEngine } from '../infrastructure/providers/services/TemplateEngine';

// Access private methods for testing
type ProviderWithPrivates = UniversalHTTPProvider & {
  extractCacheMetrics: (
    responseData: Record<string, unknown>
  ) => { cachedTokens: number; cacheWriteTokens: number; cacheHitRate: number } | undefined;
  processTemplate: (template: unknown, context: Record<string, unknown>) => unknown;
};

describe('Prompt Caching', () => {
  const provider = new UniversalHTTPProvider() as ProviderWithPrivates;

  describe('extractCacheMetrics', () => {
    it('should extract OpenAI cache metrics from prompt_tokens_details', () => {
      const responseData = {
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 200,
          total_tokens: 1200,
          prompt_tokens_details: {
            cached_tokens: 768,
          },
        },
      };

      const metrics = provider.extractCacheMetrics(responseData);

      expect(metrics).toBeDefined();
      expect(metrics!.cachedTokens).toBe(768);
      expect(metrics!.cacheWriteTokens).toBe(0); // OpenAI has no explicit write
      expect(metrics!.cacheHitRate).toBeCloseTo(76.8, 1);
    });

    it('should extract Anthropic cache metrics from cache_read/creation tokens', () => {
      const responseData = {
        usage: {
          input_tokens: 100,
          output_tokens: 250,
          cache_creation_input_tokens: 1500,
          cache_read_input_tokens: 0,
        },
      };

      const metrics = provider.extractCacheMetrics(responseData);

      expect(metrics).toBeDefined();
      expect(metrics!.cachedTokens).toBe(0);
      expect(metrics!.cacheWriteTokens).toBe(1500);
      expect(metrics!.cacheHitRate).toBe(0); // First request, all writes
    });

    it('should calculate Anthropic cache hit rate on subsequent requests', () => {
      const responseData = {
        usage: {
          input_tokens: 50,
          output_tokens: 200,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1500,
        },
      };

      const metrics = provider.extractCacheMetrics(responseData);

      expect(metrics).toBeDefined();
      expect(metrics!.cachedTokens).toBe(1500);
      expect(metrics!.cacheWriteTokens).toBe(0);
      // 1500 cached / (50 input + 1500 cached + 0 write) = 96.77%
      expect(metrics!.cacheHitRate).toBeCloseTo(96.77, 1);
    });

    it('should return undefined when no usage data', () => {
      expect(provider.extractCacheMetrics({})).toBeUndefined();
    });

    it('should return undefined when usage has no cache fields', () => {
      const responseData = {
        usage: {
          prompt_tokens: 500,
          completion_tokens: 100,
          total_tokens: 600,
        },
      };

      expect(provider.extractCacheMetrics(responseData)).toBeUndefined();
    });

    it('should handle OpenAI zero cached tokens', () => {
      const responseData = {
        usage: {
          prompt_tokens: 500,
          completion_tokens: 100,
          total_tokens: 600,
          prompt_tokens_details: {
            cached_tokens: 0,
          },
        },
      };

      const metrics = provider.extractCacheMetrics(responseData);

      expect(metrics).toBeDefined();
      expect(metrics!.cachedTokens).toBe(0);
      expect(metrics!.cacheHitRate).toBe(0);
    });
  });

  describe('processTemplate with cache_control markers', () => {
    it('should pass through Anthropic cache_control markers untouched', () => {
      const anthropicTemplate = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: '${systemPrompt}',
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: '${userPrompt}',
          },
        ],
      };

      const context = {
        systemPrompt: 'You are a helpful wellness assistant.',
        userPrompt: 'Write me an affirmation about courage.',
      };

      const result = provider.processTemplate(anthropicTemplate, context) as Record<string, unknown>;

      // Verify model and max_tokens pass through
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.max_tokens).toBe(4096);

      // Verify system array with cache_control
      const system = result.system as Array<Record<string, unknown>>;
      expect(system).toHaveLength(1);
      expect(system[0].type).toBe('text');
      expect(system[0].text).toBe('You are a helpful wellness assistant.');
      expect(system[0].cache_control).toEqual({ type: 'ephemeral' });

      // Verify messages array
      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Write me an affirmation about courage.');
    });

    it('should not affect OpenAI templates (no cache_control present)', () => {
      const openaiTemplate = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '${systemPrompt}' },
          { role: 'user', content: '${userPrompt}' },
        ],
        temperature: 0.7,
      };

      const context = {
        systemPrompt: 'You are a wellness AI.',
        userPrompt: 'Generate a quote.',
      };

      const result = provider.processTemplate(openaiTemplate, context) as Record<string, unknown>;

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'system', content: 'You are a wellness AI.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Generate a quote.' });
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('TemplateEngine with static cache values', () => {
    const engine = new TemplateEngine();

    it('should not modify "ephemeral" string (no ${} pattern)', () => {
      expect(engine.render('ephemeral', { foo: 'bar' })).toBe('ephemeral');
    });

    it('should not modify "text" string (no ${} pattern)', () => {
      expect(engine.render('text', { type: 'something' })).toBe('text');
    });

    it('should substitute ${systemPrompt} but leave static strings unchanged', () => {
      expect(engine.render('${systemPrompt}', { systemPrompt: 'Hello world' })).toBe('Hello world');
    });
  });
});
