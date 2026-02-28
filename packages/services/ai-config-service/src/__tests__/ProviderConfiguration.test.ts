import { describe, it, expect } from 'vitest';
import type {
  ProviderConfiguration,
  InsertProviderConfiguration,
  ProviderConfigFilter,
  ProviderType,
} from '../domains/providers/domain/entities/ProviderConfiguration';

describe('ProviderConfiguration', () => {
  describe('ProviderConfiguration entity', () => {
    it('should define valid provider configuration structure', () => {
      const config: ProviderConfiguration = {
        id: 1,
        providerId: 'openai-gpt4',
        providerName: 'OpenAI GPT-4',
        providerType: 'llm',
        description: 'GPT-4 language model',
        configuration: {
          endpoint: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          requestTemplate: { model: 'gpt-4' },
          responseMapping: { content: 'choices[0].message.content' },
          timeout: 30000,
        },
        isActive: true,
        isPrimary: true,
        priority: 1,
        costPerUnit: '0.03',
        creditCost: 10,
        healthStatus: 'healthy',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'admin',
        updatedBy: 'admin',
      };

      expect(config.providerId).toBe('openai-gpt4');
      expect(config.providerType).toBe('llm');
      expect(config.isActive).toBe(true);
      expect(config.isPrimary).toBe(true);
      expect(config.healthStatus).toBe('healthy');
    });

    it('should allow null values for optional fields', () => {
      const config: ProviderConfiguration = {
        id: 2,
        providerId: 'test-provider',
        providerName: 'Test Provider',
        providerType: 'music',
        description: null,
        configuration: { endpoint: 'http://test.com' },
        isActive: false,
        isPrimary: false,
        priority: 2,
        costPerUnit: '0.00',
        creditCost: null,
        healthStatus: 'unknown',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      expect(config.description).toBeNull();
      expect(config.creditCost).toBeNull();
      expect(config.createdBy).toBeNull();
    });
  });

  describe('InsertProviderConfiguration', () => {
    it('should define valid insert structure with required fields', () => {
      const insert: InsertProviderConfiguration = {
        providerId: 'new-provider',
        providerName: 'New Provider',
        providerType: 'image',
        configuration: {
          endpoint: 'https://api.example.com/generate',
          requestTemplate: { size: '1024x1024' },
          responseMapping: { url: 'data.url' },
        },
      };

      expect(insert.providerId).toBe('new-provider');
      expect(insert.providerType).toBe('image');
      expect(insert.isActive).toBeUndefined();
    });

    it('should allow optional fields', () => {
      const insert: InsertProviderConfiguration = {
        providerId: 'configured-provider',
        providerName: 'Configured Provider',
        providerType: 'audio',
        configuration: { endpoint: 'http://audio.api' },
        isActive: true,
        isPrimary: false,
        priority: 5,
        costPerUnit: '0.05',
        creditCost: 15,
        healthStatus: 'healthy',
        createdBy: 'system',
      };

      expect(insert.isActive).toBe(true);
      expect(insert.priority).toBe(5);
      expect(insert.creditCost).toBe(15);
    });
  });

  describe('ProviderType', () => {
    it('should support all valid provider types', () => {
      const types: ProviderType[] = ['llm', 'music', 'image', 'video', 'audio', 'text'];
      expect(types).toHaveLength(6);
      expect(types).toContain('llm');
      expect(types).toContain('music');
      expect(types).toContain('image');
      expect(types).toContain('video');
      expect(types).toContain('audio');
      expect(types).toContain('text');
    });
  });

  describe('ProviderConfigFilter', () => {
    it('should define filter with all options', () => {
      const filter: ProviderConfigFilter = {
        includeInactive: true,
        providerType: 'llm',
        isActive: true,
        isPrimary: false,
        providerId: 'specific-id',
        healthStatus: 'healthy',
      };

      expect(filter.providerType).toBe('llm');
      expect(filter.healthStatus).toBe('healthy');
    });

    it('should allow partial filter', () => {
      const filter: ProviderConfigFilter = {
        providerType: 'music',
      };

      expect(filter.providerType).toBe('music');
      expect(filter.isActive).toBeUndefined();
    });

    it('should allow empty filter', () => {
      const filter: ProviderConfigFilter = {};
      expect(Object.keys(filter)).toHaveLength(0);
    });
  });

  describe('Health status values', () => {
    it('should support all health status options', () => {
      const statuses: Array<'healthy' | 'error' | 'unknown'> = ['healthy', 'error', 'unknown'];
      expect(statuses).toContain('healthy');
      expect(statuses).toContain('error');
      expect(statuses).toContain('unknown');
    });
  });
});
