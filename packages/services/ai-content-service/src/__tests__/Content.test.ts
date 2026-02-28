import { describe, it, expect } from 'vitest';
import { Content, ContentType, ContentStatus, ContentMetadata } from '../domains/entities/Content';

describe('Content Entity', () => {
  const createValidMetadata = (): ContentMetadata => ({
    wordCount: 100,
    characterCount: 500,
    readingTimeMinutes: 1,
    language: 'en',
    tokensUsed: 150,
    generationTimeMs: 2000,
    qualityScore: 0.85,
    coherenceScore: 0.8,
    relevanceScore: 0.9,
    creativityScore: 0.75,
    providerId: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    processingSteps: ['validation', 'generation'],
    errorCount: 0,
    warnings: [],
  });

  describe('Constructor Validation', () => {
    it('should create content with valid parameters', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'This is valid content',
        'article',
        createValidMetadata()
      );

      expect(content.id).toBe('content-123');
      expect(content.requestId).toBe('request-456');
      expect(content.content).toBe('This is valid content');
      expect(content.contentType).toBe('article');
    });

    it('should throw error for empty ID', () => {
      expect(() => {
        new Content('', 'request-456', 'Content', 'article', createValidMetadata());
      }).toThrow('Content ID is required');
    });

    it('should throw error for empty request ID', () => {
      expect(() => {
        new Content('content-123', '', 'Content', 'article', createValidMetadata());
      }).toThrow('Content request ID is required');
    });

    it('should throw error for empty content', () => {
      expect(() => {
        new Content('content-123', 'request-456', '', 'article', createValidMetadata());
      }).toThrow('Content text is required');
    });

    it('should throw error for whitespace-only content', () => {
      expect(() => {
        new Content('content-123', 'request-456', '   ', 'article', createValidMetadata());
      }).toThrow('Content text is required');
    });

    it('should throw error for content exceeding maximum length', () => {
      const longContent = 'a'.repeat(100001);
      expect(() => {
        new Content('content-123', 'request-456', longContent, 'article', createValidMetadata());
      }).toThrow('Content exceeds maximum length');
    });

    it('should throw error for version less than 1', () => {
      expect(() => {
        new Content(
          'content-123',
          'request-456',
          'Content',
          'article',
          createValidMetadata(),
          undefined,
          undefined,
          0 // version
        );
      }).toThrow('Content version must be at least 1');
    });

    it('should throw error for negative cost', () => {
      expect(() => {
        new Content(
          'content-123',
          'request-456',
          'Content',
          'article',
          createValidMetadata(),
          undefined,
          undefined,
          1,
          undefined,
          'generated',
          false,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
          -0.01 // cost
        );
      }).toThrow('Content cost cannot be negative');
    });
  });

  describe('Content Update', () => {
    it('should update content and increment version', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Original content',
        'article',
        createValidMetadata()
      );

      content.updateContent('Updated content');

      expect(content.content).toBe('Updated content');
      expect(content.version).toBe(2);
      expect(content.status).toBe('generated');
    });

    it('should throw error for empty updated content', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Original content',
        'article',
        createValidMetadata()
      );

      expect(() => content.updateContent('')).toThrow('Updated content cannot be empty');
    });

    it('should reset approval status on update', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Original content',
        'article',
        createValidMetadata()
      );

      content.approve('approver-1');
      expect(content.isApproved).toBe(true);

      content.updateContent('New content');
      expect(content.isApproved).toBe(false);
      expect(content.approvedBy).toBeUndefined();
    });

    it('should update metadata word count', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Two words',
        'article',
        createValidMetadata()
      );

      content.updateContent('Now there are five words');
      expect(content.metadata.wordCount).toBe(5);
    });
  });

  describe('Approval Workflow', () => {
    it('should approve content', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content to approve',
        'article',
        createValidMetadata()
      );

      content.approve('reviewer-1');

      expect(content.isApproved).toBe(true);
      expect(content.approvedBy).toBe('reviewer-1');
      expect(content.approvedAt).toBeDefined();
      expect(content.status).toBe('reviewed');
    });

    it('should throw error for empty approver ID', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content',
        'article',
        createValidMetadata()
      );

      expect(() => content.approve('')).toThrow('Approver ID is required');
    });
  });

  describe('Publishing Workflow', () => {
    it('should publish approved content', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content to publish',
        'article',
        createValidMetadata()
      );

      content.approve('reviewer-1');
      content.publish('https://example.com/article');

      expect(content.isPublished).toBe(true);
      expect(content.publishedAt).toBeDefined();
      expect(content.publishUrl).toBe('https://example.com/article');
      expect(content.status).toBe('published');
    });

    it('should throw error when publishing unapproved content', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content',
        'article',
        createValidMetadata()
      );

      expect(() => content.publish()).toThrow("Cannot transition from 'draft' to 'published'");
    });
  });

  describe('Archive', () => {
    it('should archive content', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content to archive',
        'article',
        createValidMetadata()
      );

      content.archive();

      expect(content.status).toBe('archived');
    });
  });

  describe('Version Creation', () => {
    it('should create a new version', () => {
      const original = new Content(
        'content-123',
        'request-456',
        'Original content',
        'article',
        createValidMetadata()
      );

      const newVersion = original.createVersion('Modified content');

      expect(newVersion.id).toBe('content-123_v2');
      expect(newVersion.content).toBe('Modified content');
      expect(newVersion.version).toBe(2);
      expect(newVersion.parentId).toBe('content-123');
      expect(newVersion.status).toBe('generated');
    });
  });

  describe('Summary', () => {
    it('should return content summary', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content for summary',
        'blog',
        createValidMetadata()
      );

      const summary = content.getSummary();

      expect(summary.id).toBe('content-123');
      expect(summary.contentType).toBe('blog');
      expect(summary.status).toBe('generated');
      expect(summary.isApproved).toBe(false);
      expect(summary.isPublished).toBe(false);
    });
  });

  describe('Publication Readiness', () => {
    it('should indicate when content is ready for publication', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Ready content',
        'article',
        createValidMetadata()
      );

      expect(content.isReadyForPublication()).toBe(false);

      content.approve('reviewer-1');
      expect(content.isReadyForPublication()).toBe(true);

      content.publish();
      expect(content.isReadyForPublication()).toBe(false);
    });
  });

  describe('Performance Metrics', () => {
    it('should return performance metrics', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Content with metrics',
        'article',
        createValidMetadata()
      );

      const metrics = content.getPerformanceMetrics();

      expect(metrics.qualityScore).toBe(0.85);
      expect(metrics.engagementPotential).toBeGreaterThan(0);
    });

    it('should calculate higher engagement for content with questions', () => {
      const withQuestion = new Content(
        'content-1',
        'request-1',
        'What do you think? This is engaging!',
        'article',
        createValidMetadata()
      );

      const withoutQuestion = new Content(
        'content-2',
        'request-2',
        'This is just a statement.',
        'article',
        createValidMetadata()
      );

      expect(withQuestion.getPerformanceMetrics().engagementPotential).toBeGreaterThan(
        withoutQuestion.getPerformanceMetrics().engagementPotential
      );
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const content = new Content(
        'content-123',
        'request-456',
        'Serializable content',
        'email',
        createValidMetadata()
      );

      const json = content.toJSON();

      expect(json.id).toBe('content-123');
      expect(json.requestId).toBe('request-456');
      expect(json.content).toBe('Serializable content');
      expect(json.contentType).toBe('email');
      expect(json.metadata).toBeDefined();
    });
  });

  describe('Content Types', () => {
    const contentTypes: ContentType[] = ['article', 'blog', 'creative', 'technical', 'email', 'social', 'summary', 'educational'];

    it.each(contentTypes)('should accept %s content type', (type) => {
      const content = new Content(
        `content-${type}`,
        'request-456',
        'Content',
        type,
        createValidMetadata()
      );

      expect(content.contentType).toBe(type);
    });
  });
});
