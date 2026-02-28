/**
 * Shared Contracts Validation Tests
 * Verify that shared contracts work correctly between all services
 * 
 * NOTE: Legacy @shared/ai-contracts types (TextAnalysisRequest, MusicGenerationRequest, etc.)
 * were merged into @aiponge/shared-contracts. Some legacy types no longer exist as separate
 * exports. This test validates the contracts that DO exist in the current shared-contracts package.
 */

import { describe, it, expect } from 'vitest';

import {
  isSuccessResponse,
  isErrorResponse,
  type ServiceResponse,
} from '@aiponge/shared-contracts';
import { createLogger } from '@aiponge/platform-core';

const logger = createLogger('shared-contracts-test');

describe('Shared Contracts Validation Tests', () => {

  describe('Contract Type Definitions', () => {
    it('should validate content service contract types are importable', () => {
      logger.info('Validating content service contract types...');
      expect(typeof isSuccessResponse).toBe('function');
      expect(typeof isErrorResponse).toBe('function');
      logger.info('Content service contract types properly defined');
    });
  });

  describe('Utility Functions Validation', () => {
    it('should validate isSuccessResponse utility function', () => {
      logger.info('Testing isSuccessResponse utility...');
      
      const successResponse: ServiceResponse<string> = { success: true, data: 'test' };
      const errorResponse: ServiceResponse<string> = { success: false, error: 'test error' };
      
      expect(isSuccessResponse(successResponse)).toBe(true);
      expect(isSuccessResponse(errorResponse)).toBe(false);
      
      logger.info('isSuccessResponse utility works correctly');
    });

    it('should validate isErrorResponse utility function', () => {
      logger.info('Testing isErrorResponse utility...');
      
      const successResponse: ServiceResponse<string> = { success: true, data: 'test' };
      const errorResponse: ServiceResponse<string> = { success: false, error: 'test error' };
      
      expect(isErrorResponse(successResponse)).toBe(false);
      expect(isErrorResponse(errorResponse)).toBe(true);
      
      logger.info('isErrorResponse utility works correctly');
    });
  });

  describe('Schema Validation', () => {
    it('should export Zod schemas for runtime validation', () => {
      logger.info('Testing Zod schema exports...');
      
      const contractExports = require('@aiponge/shared-contracts');
      
      expect(contractExports.EntrySchema).toBeDefined();
      expect(contractExports.TrackSchema).toBeDefined();
      expect(contractExports.LyricsSchema).toBeDefined();
      expect(contractExports.ChapterSchema).toBeDefined();
      expect(contractExports.ProfileSchema).toBeDefined();
      
      logger.info('Zod schemas properly exported');
    });

    it('should validate parseResponse utility', () => {
      const { parseResponse, EntrySchema } = require('@aiponge/shared-contracts');
      
      expect(typeof parseResponse).toBe('function');
      
      const validEntry = {
        id: 'test-id',
        userId: 'user-id',
        content: 'test content',
      };
      
      const result = parseResponse(EntrySchema, validEntry, 'test');
      expect(result.id).toBe('test-id');
      expect(result.content).toBe('test content');
    });
  });

  describe('Contract Compatibility Summary', () => {
    it('should provide contract compatibility summary', () => {
      logger.info('Shared contracts validation completed');
      expect(true).toBe(true);
    });
  });
});
