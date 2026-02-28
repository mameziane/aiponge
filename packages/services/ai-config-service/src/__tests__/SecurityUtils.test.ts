import { describe, it, expect } from 'vitest';
import {
  maskSecret,
  sanitizeProviderConfiguration,
  sanitizeProviderConfigurations,
  sanitizeErrorMessage,
  sanitizeForLogging,
  containsSecrets,
} from '../domains/providers/utils/security';
import { ProviderConfigurationDB } from '../schema/schema';

describe('Security Utils', () => {
  describe('maskSecret', () => {
    it('should mask long strings preserving first and last 4 chars', () => {
      const result = maskSecret('sk-1234567890abcdef');
      expect(result).toBe('sk-1***********cdef');
    });

    it('should fully redact short strings (8 chars or less)', () => {
      expect(maskSecret('short')).toBe('***REDACTED***');
      expect(maskSecret('12345678')).toBe('***REDACTED***');
    });

    it('should fully redact empty string', () => {
      expect(maskSecret('')).toBe('***REDACTED***');
    });

    it('should handle 9-character strings', () => {
      const result = maskSecret('123456789');
      expect(result.startsWith('1234')).toBe(true);
      expect(result.endsWith('6789')).toBe(true);
      expect(result).toContain('*');
    });

    it('should handle non-string input gracefully', () => {
      expect(maskSecret(null as unknown as string)).toBe('***REDACTED***');
      expect(maskSecret(undefined as unknown as string)).toBe('***REDACTED***');
    });
  });

  describe('sanitizeProviderConfiguration', () => {
    it('should sanitize sensitive fields in configuration', () => {
      const config = {
        id: 'cfg-1',
        providerId: 'openai',
        name: 'OpenAI Config',
        configuration: {
          api_key: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
          model: 'gpt-4',
          temperature: 0.7,
        },
      };

      const result = sanitizeProviderConfiguration(config as unknown as ProviderConfigurationDB);
      const resultConfig = (result as unknown as Record<string, Record<string, unknown>>).configuration;

      expect(resultConfig.api_key).not.toBe('sk-1234567890abcdefghijklmnopqrstuvwxyz');
      expect(resultConfig.api_key).toContain('*');
      expect(resultConfig.model).toBe('gpt-4');
      expect(resultConfig.temperature).toBe(0.7);
    });

    it('should handle configuration with nested objects', () => {
      const config = {
        id: 'cfg-1',
        configuration: {
          credentials: {
            access_token: 'very-long-access-token-value-here',
            client_secret: 'super-secret-client-key-12345678',
          },
          settings: {
            timeout: 30000,
          },
        },
      };

      const result = sanitizeProviderConfiguration(config as unknown as ProviderConfigurationDB);
      const resultConfig = (result as unknown as Record<string, Record<string, unknown>>).configuration;

      expect(resultConfig.credentials).toBe('***REDACTED***');
      expect(resultConfig.settings.timeout).toBe(30000);
    });

    it('should not modify configs without configuration field', () => {
      const config = { id: 'cfg-1', providerId: 'test' };
      const result = sanitizeProviderConfiguration(config as unknown as ProviderConfigurationDB);
      expect(result).toEqual(config);
    });

    it('should handle null configuration', () => {
      const config = { id: 'cfg-1', configuration: null };
      const result = sanitizeProviderConfiguration(config as unknown as ProviderConfigurationDB);
      expect((result as unknown as Record<string, unknown>).configuration).toBeNull();
    });
  });

  describe('sanitizeProviderConfigurations', () => {
    it('should sanitize array of configurations', () => {
      const configs = [
        {
          id: 'cfg-1',
          configuration: { api_key: 'sk-longkeyvalue1234567890abcdef' },
        },
        {
          id: 'cfg-2',
          configuration: { secret_key: 'very-long-secret-key-value-here123' },
        },
      ];

      const results = sanitizeProviderConfigurations(configs as unknown as ProviderConfigurationDB[]);

      expect(results).toHaveLength(2);
      expect((results[0] as unknown as Record<string, Record<string, unknown>>).configuration.api_key).toContain('*');
      expect((results[1] as unknown as Record<string, Record<string, unknown>>).configuration.secret_key).toContain(
        '*'
      );
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact secret-like patterns from error strings', () => {
      const errorMsg = 'Failed with key Bearer abc123def456ghi789';
      const result = sanitizeErrorMessage(errorMsg);
      expect(result).not.toContain('Bearer abc123def456ghi789');
    });

    it('should handle Error objects', () => {
      const error = new Error('API call failed with Bearer abc123def456ghi789');
      const result = sanitizeErrorMessage(error);
      expect(result).not.toContain('Bearer abc123def456ghi789');
    });

    it('should not modify messages without secrets', () => {
      const msg = 'Connection timeout after 30000ms';
      expect(sanitizeErrorMessage(msg)).toBe(msg);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should sanitize objects for logging', () => {
      const data = {
        userId: 'user-1',
        password: 'my-super-long-password-value-1234',
        config: {
          api_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
        },
      };

      const result = sanitizeForLogging(data) as Record<string, unknown>;

      expect(result.userId).toBe('user-1');
      expect(result.password).toContain('*');
      expect((result.config as Record<string, unknown>).api_key).toContain('*');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeForLogging(null)).toBeNull();
      expect(sanitizeForLogging(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(sanitizeForLogging(42)).toBe(42);
      expect(sanitizeForLogging(true)).toBe(true);
      expect(sanitizeForLogging('hello')).toBe('hello');
    });

    it('should handle arrays', () => {
      const data = ['hello', { token: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef' }];
      const result = sanitizeForLogging(data) as unknown[];
      expect(result[0]).toBe('hello');
      expect((result[1] as Record<string, unknown>).token).toContain('*');
    });

    it('should handle deeply nested objects up to max depth', () => {
      let obj: Record<string, unknown> = { value: 'test' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }

      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result).toBeDefined();
    });
  });

  describe('containsSecrets', () => {
    it('should detect sensitive field names', () => {
      const result = containsSecrets({
        api_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
        model: 'gpt-4',
      });

      expect(result.hasSecrets).toBe(true);
      expect(result.suspiciousFields).toContain('api_key');
    });

    it('should detect secret-like values', () => {
      const result = containsSecrets({
        config: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
      });

      expect(result.hasSecrets).toBe(true);
    });

    it('should return false for safe objects', () => {
      const result = containsSecrets({
        name: 'test',
        count: 42,
        enabled: true,
      });

      expect(result.hasSecrets).toBe(false);
      expect(result.suspiciousFields).toHaveLength(0);
    });

    it('should handle null and undefined values', () => {
      const result = containsSecrets({ key: null, value: undefined });
      expect(result.hasSecrets).toBe(false);
    });

    it('should detect secrets in nested objects', () => {
      const result = containsSecrets({
        level1: {
          level2: {
            secret_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
          },
        },
      });

      expect(result.hasSecrets).toBe(true);
      expect(result.suspiciousFields.some(f => f.includes('secret_key'))).toBe(true);
    });

    it('should detect secrets in arrays', () => {
      const result = containsSecrets({
        tokens: ['sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef'],
      });

      expect(result.hasSecrets).toBe(true);
    });

    it('should not flag already-masked values', () => {
      const result = containsSecrets({
        api_key: '***REDACTED***',
      });

      expect(result.suspiciousFields.filter(f => f === 'api_key')).toHaveLength(0);
    });
  });
});
