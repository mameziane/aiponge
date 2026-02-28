import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockTemplateClient = vi.hoisted(() => ({
  executeContentTemplate: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async (importOriginal) => {
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

vi.mock('../infrastructure/clients/TemplateEngineServiceClient', () => {
  return {
    TemplateEngineServiceClient: class MockTemplateEngineServiceClient {
      executeContentTemplate = mockTemplateClient.executeContentTemplate;
    },
  };
});

import { AnalyzeTextUseCase, AnalyzeTextUseCaseRequest } from '../application/use-cases/AnalyzeTextUseCase';
import { ContentAIService } from '../domains/services/ContentAIService';

const mockContentAIService = {
  generateContent: vi.fn(),
};

describe('AnalyzeTextUseCase', () => {
  let useCase: AnalyzeTextUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new AnalyzeTextUseCase(mockContentAIService as unknown as ContentAIService);
  });

  describe('Request Validation', () => {
    it('should reject empty content', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: '',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content is required');
    });

    it('should reject whitespace-only content', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: '   ',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content is required');
    });

    it('should reject content exceeding 10,000 characters', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'a'.repeat(10001),
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject invalid analysis type', async () => {
      const request = {
        content: 'Valid content',
        analysisType: 'invalid' as unknown as string,
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid analysis type');
    });
  });

  describe('Basic Analysis', () => {
    beforeEach(() => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze the sentiment',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'analysis-1',
        content: 'The text has positive sentiment.',
        metadata: { wordCount: 5, tokensUsed: 10 },
      });
    });

    it('should perform basic analysis with sentiment and complexity', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'This is a wonderful and amazing experience! I love it!',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment).toBeDefined();
      expect(result.analysis.complexity).toBeDefined();
    });

    it('should detect positive sentiment from positive keywords', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'This is excellent, amazing, wonderful, and fantastic!',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment?.overall).toBe('positive');
    });

    it('should detect negative sentiment from negative keywords', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'This is terrible, awful, horrible, and disappointing.',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment?.overall).toBe('negative');
    });

    it('should detect mixed sentiment', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'This product is great but the service was terrible.',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment?.overall).toBe('mixed');
    });

    it('should return neutral sentiment for neutral content', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'The weather today is cloudy. Temperature is 20 degrees.',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment?.overall).toBe('neutral');
    });
  });

  describe('Complexity Analysis', () => {
    it('should identify simple text', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'The cat sat on the mat. It was a nice day. The sun was out.',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.complexity?.level).toBe('simple');
      expect(result.analysis.complexity?.readabilityScore).toBeGreaterThan(0.5);
    });

    it('should identify complex text', async () => {
      const longSentence = 'The implementation of sophisticated algorithmic paradigms necessitates a comprehensive understanding of computational complexity theory and its multifaceted implications for software engineering practices in contemporary technological infrastructures.';
      const request: AnalyzeTextUseCaseRequest = {
        content: longSentence,
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(['moderate', 'complex']).toContain(result.analysis.complexity?.level);
    });
  });

  describe('Sentiment Analysis', () => {
    beforeEach(() => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze the sentiment',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'sentiment-1',
        content: 'Positive sentiment detected',
        metadata: {},
      });
    });

    it('should perform sentiment-only analysis', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'I am so happy today!',
        analysisType: 'sentiment',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment).toBeDefined();
      expect(result.analysis.themes).toBeUndefined();
      expect(result.analysis.topics).toBeUndefined();
    });

    it('should include emotion details in sentiment', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'I feel worried and anxious about the future.',
        analysisType: 'sentiment',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment?.details).toBeDefined();
      expect(result.analysis.sentiment?.details?.fear).toBeGreaterThan(0);
    });
  });

  describe('Theme Analysis', () => {
    beforeEach(() => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze the themes',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'theme-1',
        content: 'Theme analysis complete',
        metadata: {},
      });
    });

    it('should perform theme-only analysis', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'The journey of self-discovery is important for personal growth.',
        analysisType: 'themes',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.themes).toBeDefined();
      expect(result.analysis.themes?.length).toBeGreaterThan(0);
    });
  });

  describe('Comprehensive Analysis', () => {
    beforeEach(() => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Comprehensive analysis prompt',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'comprehensive-1',
        content: 'Full analysis complete',
        metadata: {},
      });
    });

    it('should include all analysis types', async () => {
      const request: AnalyzeTextUseCaseRequest = {
        content: 'This is a comprehensive test of text analysis capabilities.',
        analysisType: 'comprehensive',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment).toBeDefined();
      expect(result.analysis.themes).toBeDefined();
      expect(result.analysis.topics).toBeDefined();
      expect(result.analysis.complexity).toBeDefined();
    });
  });

  describe('Context Handling', () => {
    it('should accept userId in context', async () => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'context-1',
        content: 'Analysis',
        metadata: {},
      });

      const request: AnalyzeTextUseCaseRequest = {
        content: 'Test content for analysis',
        analysisType: 'basic',
        context: {
          userId: 'user-123',
          domainContext: 'therapeutic',
        },
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Metadata', () => {
    it('should include processing metadata', async () => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze',
      });
      mockContentAIService.generateContent.mockResolvedValue({
        id: 'meta-1',
        content: 'Result',
        metadata: {},
      });

      const request: AnalyzeTextUseCaseRequest = {
        content: 'Content to analyze',
        analysisType: 'basic',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.analysisDepth).toBe('basic');
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle template client failures gracefully', async () => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: false,
        error: 'Template not found',
      });

      const request: AnalyzeTextUseCaseRequest = {
        content: 'Test content',
        analysisType: 'sentiment',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment).toBeDefined();
    });

    it('should fallback to basic analysis on AI service failure', async () => {
      mockTemplateClient.executeContentTemplate.mockResolvedValue({
        success: true,
        processedPrompt: 'Analyze',
      });
      mockContentAIService.generateContent.mockRejectedValue(new Error('AI unavailable'));

      const request: AnalyzeTextUseCaseRequest = {
        content: 'I am happy and excited!',
        analysisType: 'sentiment',
      };

      const result = await useCase.execute(request);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment).toBeDefined();
    });
  });
});
