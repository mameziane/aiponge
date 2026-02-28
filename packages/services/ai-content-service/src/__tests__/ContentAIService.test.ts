import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
  createLogger: () => mockLogger,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

vi.mock('../domains/constants/template-ids', () => ({
  TEMPLATE_IDS: {
    SYSTEM_PROMPT: 'system-prompt',
    ENTRY_ANALYSIS: 'entry-analysis',
  },
}));

import { ContentAIService } from '../domains/services/ContentAIService';

function createMockProvidersClient() {
  return {
    generateText: vi.fn().mockResolvedValue({
      success: true,
      result: 'Generated content here. This is a test article about technology.',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4',
      metadata: {
        tokensUsed: 100,
        cost: 0.01,
      },
    }),
  };
}

function createMockAnalyticsClient() {
  return {
    recordEvent: vi.fn(),
  };
}

function createMockTemplateClient() {
  return {
    executeTemplate: vi.fn().mockResolvedValue({
      success: true,
      result: 'You are a helpful assistant. Write an article about technology.',
      systemPrompt: 'You are a helpful content writer.',
      userPrompt: 'Write an article about technology.',
    }),
    executeContentTemplate: vi.fn().mockResolvedValue({
      success: true,
      result: 'Processed template',
    }),
  };
}

describe('ContentAIService', () => {
  let service: ContentAIService;
  let mockProviders: ReturnType<typeof createMockProvidersClient>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsClient>;
  let mockTemplateClient: ReturnType<typeof createMockTemplateClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProviders = createMockProvidersClient();
    mockAnalytics = createMockAnalyticsClient();
    mockTemplateClient = createMockTemplateClient();
    service = new ContentAIService(
      mockProviders as unknown as ConstructorParameters<typeof ContentAIService>[0],
      mockAnalytics as unknown as ConstructorParameters<typeof ContentAIService>[1],
      mockTemplateClient as unknown as ConstructorParameters<typeof ContentAIService>[2]
    );
  });

  describe('constructor', () => {
    it('should throw if templateClient is not provided', () => {
      expect(() => new ContentAIService(mockProviders as unknown as ConstructorParameters<typeof ContentAIService>[0], mockAnalytics as unknown as ConstructorParameters<typeof ContentAIService>[1])).toThrow(
        'ContentAIService requires a templateClient instance'
      );
    });

    it('should create successfully with all dependencies', () => {
      const svc = new ContentAIService(
        mockProviders as unknown as ConstructorParameters<typeof ContentAIService>[0],
        mockAnalytics as unknown as ConstructorParameters<typeof ContentAIService>[1],
        mockTemplateClient as unknown as ConstructorParameters<typeof ContentAIService>[2]
      );
      expect(svc).toBeDefined();
    });
  });

  describe('generateContent', () => {
    it('should generate content with valid request', async () => {
      const result = await service.generateContent({
        prompt: 'Write an article about technology',
        contentType: 'article',
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.provider).toBe('openai');
      expect(result.metadata.model).toBe('gpt-4');
    });

    it('should throw for empty prompt', async () => {
      await expect(
        service.generateContent({ prompt: '', contentType: 'article' })
      ).rejects.toThrow();
    });

    it('should throw for whitespace-only prompt', async () => {
      await expect(
        service.generateContent({ prompt: '   ', contentType: 'article' })
      ).rejects.toThrow();
    });

    it('should throw for prompt exceeding max length', async () => {
      await expect(
        service.generateContent({
          prompt: 'a'.repeat(20001),
          contentType: 'article',
        })
      ).rejects.toThrow();
    });

    it('should throw for maxLength below minimum', async () => {
      await expect(
        service.generateContent({
          prompt: 'Valid prompt',
          contentType: 'article',
          parameters: { maxLength: 10 },
        })
      ).rejects.toThrow();
    });

    it('should throw for temperature out of range', async () => {
      await expect(
        service.generateContent({
          prompt: 'Valid prompt',
          contentType: 'article',
          parameters: { temperature: 1.5 },
        })
      ).rejects.toThrow();
    });

    it('should throw for negative temperature', async () => {
      await expect(
        service.generateContent({
          prompt: 'Valid prompt',
          contentType: 'article',
          parameters: { temperature: -0.1 },
        })
      ).rejects.toThrow();
    });

    it('should pass template variables from request parameters', async () => {
      await service.generateContent({
        prompt: 'Test content',
        contentType: 'blog',
        parameters: {
          tone: 'casual',
          targetAudience: 'developers',
          style: 'informative',
          language: 'fr',
        },
      });

      expect(mockTemplateClient.executeTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            tone: 'casual',
            target_audience: 'developers',
            style: 'informative',
            language: 'French',
          }),
        })
      );
    });

    it('should throw when template execution fails', async () => {
      mockTemplateClient.executeTemplate.mockResolvedValue({
        success: false,
        error: 'Template not found',
      });

      await expect(
        service.generateContent({ prompt: 'Test', contentType: 'article' })
      ).rejects.toThrow();
    });

    it('should throw when providers client is not set', async () => {
      const serviceNoProvider = new ContentAIService(
        undefined,
        mockAnalytics as unknown as ConstructorParameters<typeof ContentAIService>[1],
        mockTemplateClient as unknown as ConstructorParameters<typeof ContentAIService>[2]
      );

      await expect(
        serviceNoProvider.generateContent({ prompt: 'Test', contentType: 'article' })
      ).rejects.toThrow();
    });

    it('should record analytics events', async () => {
      await service.generateContent({
        prompt: 'Test content',
        contentType: 'article',
      });

      expect(mockAnalytics.recordEvent).toHaveBeenCalled();
    });

    it('should use custom templateId from options', async () => {
      await service.generateContent({
        prompt: 'Test content',
        contentType: 'creative',
        options: { templateId: 'music-lyrics' },
      });

      expect(mockTemplateClient.executeTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'music-lyrics',
        })
      );
    });

    it('should use entry-analysis template for analysis content type', async () => {
      await service.generateContent({
        prompt: 'Analyze this text',
        contentType: 'analysis',
      });

      expect(mockTemplateClient.executeTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'entry-analysis',
        })
      );
    });
  });

  describe('analyzeContent', () => {
    it('should return content scores', async () => {
      const result = await service.analyzeContent(
        'This is a test article about technology. It covers important topics.',
        'article'
      );

      expect(result.seoScore).toBeGreaterThanOrEqual(0);
      expect(result.readabilityScore).toBeGreaterThanOrEqual(0);
      expect(result.engagementScore).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.sentenceCount).toBeGreaterThan(0);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(1);
    });

    it('should count words correctly', async () => {
      const result = await service.analyzeContent('One two three four five', 'article');
      expect(result.wordCount).toBe(5);
    });

    it('should count sentences correctly', async () => {
      const result = await service.analyzeContent(
        'First sentence. Second sentence! Third sentence?',
        'article'
      );
      expect(result.sentenceCount).toBe(3);
    });
  });

  describe('optimizeContent', () => {
    it('should optimize content and return improvements', async () => {
      mockProviders.generateText.mockResolvedValue({
        success: true,
        result: 'Optimized version of the content with better structure and clarity.',
        providerId: 'openai',
        model: 'gpt-4',
      });

      const result = await service.optimizeContent({
        content: 'Bad content here that needs improving.',
        contentType: 'article',
        optimizationGoals: ['readability', 'seo'],
      });

      expect(result.optimizedContent).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.scores.seoScore).toBeGreaterThanOrEqual(0);
      expect(result.scores.readabilityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy when providers are available', async () => {
      mockProviders.generateText.mockResolvedValue({
        success: true,
        result: 'pong',
      });

      const status = await service.getHealthStatus();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(status.status);
      expect(typeof status.cacheSize).toBe('number');
      expect(typeof status.providersAvailable).toBe('boolean');
    });
  });
});
