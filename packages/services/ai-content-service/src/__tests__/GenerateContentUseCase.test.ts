import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    getEnabledFrameworks: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../domains/services/FrameworkSelectionService', () => ({
  FrameworkSelectionService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    selectFrameworks: vi.fn().mockResolvedValue([]),
    getAvailableFrameworks: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../config/service-urls', () => ({
  createLogger: vi.fn(() => mockLogger),
  getLogger: vi.fn(() => mockLogger),
  getServiceUrls: vi.fn(() => ({})),
}));

vi.mock('../infrastructure/clients/TemplateServiceClient', () => ({
  TemplateServiceClient: class MockTemplateServiceClient {
    executeTemplate = vi.fn().mockResolvedValue({ success: true, result: 'Test prompt' });
  },
}));

vi.mock('../infrastructure/database/DatabaseConnectionFactory', () => ({
  DatabaseConnectionFactory: {
    getInstance: vi.fn(() => ({
      getDatabase: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

import { GenerateContentUseCase, GenerateContentUseCaseRequest } from '../application/use-cases/GenerateContentUseCase';
import { ContentAIService, ContentGenerationResponse } from '../domains/services/ContentAIService';
import { ContentTemplateService } from '../domains/services/ContentTemplateService';

const mockContentAIService = {
  generateContent: vi.fn(),
};

const mockTemplateService = {
  processTemplate: vi.fn(),
  loadTemplate: vi.fn(),
};

describe('GenerateContentUseCase', () => {
  let useCase: GenerateContentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GenerateContentUseCase(
      mockContentAIService as unknown as ContentAIService,
      mockTemplateService as unknown as ContentTemplateService
    );
  });

  describe('Request Validation', () => {
    it('should reject empty userId', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: '',
        prompt: 'Test prompt',
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('User ID is required');
    });

    it('should reject empty prompt', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: '',
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/[Pp]rompt.*required/);
    });

    it('should reject prompt exceeding 5000 characters', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'a'.repeat(5001),
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/[Pp]rompt.*exceeds maximum length/);
    });

    it('should reject missing contentType', async () => {
      const request = {
        userId: 'user-123',
        prompt: 'Test prompt',
      } as GenerateContentUseCaseRequest;

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/[Cc]ontent type.*required/);
    });

    it('should reject maxLength less than 50', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Test prompt',
        contentType: 'article',
        parameters: {
          maxLength: 30,
        },
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/[Mm]ax length must be at least 50/);
    });

    it('should reject temperature outside 0-1 range', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Test prompt',
        contentType: 'article',
        parameters: {
          temperature: 1.5,
        },
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/[Tt]emperature must be between 0 and 1/);
    });
  });

  describe('Content Generation', () => {
    const mockAIResponse: ContentGenerationResponse = {
      id: 'content-123',
      content: 'Generated content here',
      metadata: {
        wordCount: 3,
        characterCount: 22,
        readingTimeMinutes: 1,
        processingTimeMs: 500,
        tokensUsed: 100,
        provider: 'test-provider',
        model: 'test-model',
        cost: 0.01,
        qualityScore: 0.85,
      },
    };

    beforeEach(() => {
      mockContentAIService.generateContent.mockResolvedValue(mockAIResponse);
    });

    it('should successfully generate content with valid request', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Write an article about AI',
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content?.content).toBe('Generated content here');
      expect(result.requestId).toBeDefined();
      expect(mockContentAIService.generateContent).toHaveBeenCalled();
    });

    it('should include processing metadata in response', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Write a blog post',
        contentType: 'blog',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.processingMetadata).toBeDefined();
      expect(result.processingMetadata.tokensUsed).toBe(100);
      expect(result.processingMetadata.provider).toBe('test-provider');
      expect(result.processingMetadata.model).toBe('test-model');
    });

    it('should include workflow stages in response', async () => {
      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Create content',
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.workflow?.stagesCompleted).toContain('validation');
      expect(result.workflow?.stagesCompleted).toContain('generation');
    });

    it('should use template when templateId is specified', async () => {
      mockTemplateService.processTemplate.mockResolvedValue({
        systemPrompt: 'System prompt',
        userPrompt: 'Enhanced user prompt',
        processedVariables: {},
        warnings: [],
        metadata: {
          templateId: 'test-template',
          templateVersion: '1.0',
          processingTime: 10,
          variableCount: 1,
        },
      });

      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Write lyrics',
        contentType: 'creative',
        options: {
          templateId: 'music-lyrics',
        },
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(mockTemplateService.processTemplate).toHaveBeenCalledWith(
        'music-lyrics',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Content Quality Assessment', () => {
    it('should assess quality based on content characteristics', async () => {
      const mockResponse: ContentGenerationResponse = {
        id: 'content-456',
        content: 'This is engaging content! Are you ready? Great work!',
        metadata: {
          wordCount: 9,
          characterCount: 50,
          readingTimeMinutes: 1,
          processingTimeMs: 300,
          tokensUsed: 50,
          provider: 'test',
          model: 'test',
          cost: 0.005,
          qualityScore: 0.9,
        },
      };

      mockContentAIService.generateContent.mockResolvedValue(mockResponse);

      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Write engaging content',
        contentType: 'social',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.quality).toBeDefined();
      expect(result.quality?.metrics.overall).toBeGreaterThan(0);
    });
  });

  describe('Batch Generation', () => {
    it('should handle batch generation requests', async () => {
      const mockResponse: ContentGenerationResponse = {
        id: 'batch-content',
        content: 'Batch content',
        metadata: {
          wordCount: 2,
          characterCount: 13,
          readingTimeMinutes: 1,
          processingTimeMs: 200,
          tokensUsed: 30,
          provider: 'test',
          model: 'test',
          cost: 0.003,
          qualityScore: 0.8,
        },
      };

      mockContentAIService.generateContent.mockResolvedValue(mockResponse);

      const requests: GenerateContentUseCaseRequest[] = [
        { userId: 'user-1', prompt: 'First content', contentType: 'article' },
        { userId: 'user-2', prompt: 'Second content', contentType: 'blog' },
      ];

      const results = await useCase.generateBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle partial failures in batch generation', async () => {
      mockContentAIService.generateContent
        .mockResolvedValueOnce({
          id: 'success',
          content: 'Success content',
          metadata: {
            wordCount: 2,
            characterCount: 15,
            readingTimeMinutes: 1,
            processingTimeMs: 100,
            tokensUsed: 20,
            provider: 'test',
            model: 'test',
            cost: 0.002,
            qualityScore: 0.85,
          },
        })
        .mockRejectedValueOnce(new Error('Provider error'));

      const requests: GenerateContentUseCaseRequest[] = [
        { userId: 'user-1', prompt: 'Good request', contentType: 'article' },
        { userId: 'user-2', prompt: 'Bad request', contentType: 'article' },
      ];

      const results = await useCase.generateBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.code).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle AI service errors gracefully', async () => {
      mockContentAIService.generateContent.mockRejectedValue(new Error('AI provider unavailable'));

      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Test content',
        contentType: 'article',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTENT_GENERATION_FAILED');
      expect(result.error?.message).toContain('AI provider unavailable');
    });

    it('should include error details in failed response', async () => {
      mockContentAIService.generateContent.mockRejectedValue(new Error('Network timeout'));

      const request: GenerateContentUseCaseRequest = {
        userId: 'user-123',
        prompt: 'Test content',
        contentType: 'blog',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.details).toBeDefined();
      expect(result.error?.details.contentType).toBe('blog');
      expect(result.error?.details.promptLength).toBe(12);
    });
  });
});
