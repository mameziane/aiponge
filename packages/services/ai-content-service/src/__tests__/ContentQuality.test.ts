import { describe, it, expect, vi } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => ({
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { ContentQuality } from '../domains/value-objects/ContentQuality';
import type { QualityMetrics } from '../domains/value-objects/ContentQuality';

const validMetrics: QualityMetrics = {
  overall: 0.85,
  coherence: 0.8,
  relevance: 0.9,
  creativity: 0.75,
  readability: 0.8,
};

describe('ContentQuality', () => {
  describe('constructor', () => {
    it('should create with valid metrics', () => {
      const quality = new ContentQuality(validMetrics);
      expect(quality.metrics).toEqual(validMetrics);
    });

    it('should use default thresholds', () => {
      const quality = new ContentQuality(validMetrics);
      expect(quality.thresholds.minimum).toBe(0.6);
      expect(quality.thresholds.good).toBe(0.75);
      expect(quality.thresholds.excellent).toBe(0.9);
    });

    it('should accept custom thresholds', () => {
      const thresholds = { minimum: 0.5, good: 0.7, excellent: 0.85 };
      const quality = new ContentQuality(validMetrics, thresholds);
      expect(quality.thresholds).toEqual(thresholds);
    });

    it('should throw for metric value > 1', () => {
      expect(() => new ContentQuality({
        ...validMetrics,
        overall: 1.5,
      })).toThrow('Invalid content quality');
    });

    it('should throw for metric value < 0', () => {
      expect(() => new ContentQuality({
        ...validMetrics,
        coherence: -0.1,
      })).toThrow('Invalid content quality');
    });

    it('should allow boundary values 0 and 1', () => {
      const quality = new ContentQuality({
        overall: 0,
        coherence: 1,
        relevance: 0,
        creativity: 1,
        readability: 0.5,
      });
      expect(quality.metrics.overall).toBe(0);
      expect(quality.metrics.coherence).toBe(1);
    });
  });

  describe('getQualityLevel', () => {
    it('should return excellent for scores >= 0.9', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.95 });
      expect(quality.getQualityLevel()).toBe('excellent');
    });

    it('should return good for scores >= 0.75 and < 0.9', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.8 });
      expect(quality.getQualityLevel()).toBe('good');
    });

    it('should return acceptable for scores >= 0.6 and < 0.75', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.65 });
      expect(quality.getQualityLevel()).toBe('acceptable');
    });

    it('should return poor for scores < 0.6', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.4 });
      expect(quality.getQualityLevel()).toBe('poor');
    });

    it('should respect custom thresholds', () => {
      const quality = new ContentQuality(
        { ...validMetrics, overall: 0.8 },
        { minimum: 0.5, good: 0.7, excellent: 0.8 }
      );
      expect(quality.getQualityLevel()).toBe('excellent');
    });
  });

  describe('meetsMinimumStandards', () => {
    it('should return true when above minimum', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.7 });
      expect(quality.meetsMinimumStandards()).toBe(true);
    });

    it('should return true at exact minimum', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.6 });
      expect(quality.meetsMinimumStandards()).toBe(true);
    });

    it('should return false below minimum', () => {
      const quality = new ContentQuality({ ...validMetrics, overall: 0.5 });
      expect(quality.meetsMinimumStandards()).toBe(false);
    });
  });

  describe('getImprovementSuggestions', () => {
    it('should suggest coherence improvement for low coherence', () => {
      const quality = new ContentQuality({ ...validMetrics, coherence: 0.5 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Improve content structure and logical flow');
    });

    it('should suggest relevance improvement for low relevance', () => {
      const quality = new ContentQuality({ ...validMetrics, relevance: 0.5 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Ensure content stays focused on the main topic');
    });

    it('should suggest creativity improvement for low creativity', () => {
      const quality = new ContentQuality({ ...validMetrics, creativity: 0.4 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Add more creative elements and unique perspectives');
    });

    it('should suggest readability improvement for low readability', () => {
      const quality = new ContentQuality({ ...validMetrics, readability: 0.5 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Simplify sentence structure and vocabulary');
    });

    it('should suggest SEO improvement when seo is present and low', () => {
      const quality = new ContentQuality({ ...validMetrics, seo: 0.5 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Optimize for search engines with better keyword usage');
    });

    it('should suggest engagement improvement when engagement is present and low', () => {
      const quality = new ContentQuality({ ...validMetrics, engagement: 0.5 });
      const suggestions = quality.getImprovementSuggestions();
      expect(suggestions).toContain('Add more engaging elements like questions or calls-to-action');
    });

    it('should return empty array for high-quality content', () => {
      const quality = new ContentQuality({
        overall: 0.95,
        coherence: 0.9,
        relevance: 0.9,
        creativity: 0.85,
        readability: 0.9,
      });
      expect(quality.getImprovementSuggestions()).toHaveLength(0);
    });
  });

  describe('compareWith', () => {
    it('should calculate improvement difference', () => {
      const better = new ContentQuality({ ...validMetrics, overall: 0.9 });
      const worse = new ContentQuality({ ...validMetrics, overall: 0.7 });

      const comparison = better.compareWith(worse);

      expect(comparison.improvement).toBeCloseTo(0.2);
    });

    it('should identify better and worse metrics', () => {
      const a = new ContentQuality({
        overall: 0.8,
        coherence: 0.9,
        relevance: 0.7,
        creativity: 0.8,
        readability: 0.6,
      });
      const b = new ContentQuality({
        overall: 0.7,
        coherence: 0.6,
        relevance: 0.9,
        creativity: 0.8,
        readability: 0.8,
      });

      const comparison = a.compareWith(b);

      expect(comparison.betterMetrics).toContain('overall');
      expect(comparison.betterMetrics).toContain('coherence');
      expect(comparison.worseMetrics).toContain('relevance');
      expect(comparison.worseMetrics).toContain('readability');
    });

    it('should handle equal metrics', () => {
      const a = new ContentQuality(validMetrics);
      const b = new ContentQuality(validMetrics);

      const comparison = a.compareWith(b);

      expect(comparison.improvement).toBe(0);
      expect(comparison.betterMetrics).toHaveLength(0);
      expect(comparison.worseMetrics).toHaveLength(0);
    });
  });

  describe('getSummaryReport', () => {
    it('should return complete summary report', () => {
      const quality = new ContentQuality(validMetrics);
      const report = quality.getSummaryReport();

      expect(report.level).toBe('good');
      expect(report.score).toBe(0.85);
      expect(report.meetsStandards).toBe(true);
      expect(report.strengths).toBeDefined();
      expect(report.improvements).toBeDefined();
    });

    it('should include strengths for high metrics', () => {
      const quality = new ContentQuality({
        overall: 0.95,
        coherence: 0.9,
        relevance: 0.85,
        creativity: 0.85,
        readability: 0.9,
        seo: 0.85,
        engagement: 0.9,
      });

      const report = quality.getSummaryReport();

      expect(report.strengths.length).toBeGreaterThan(0);
      expect(report.strengths).toContain('Well-structured and coherent');
      expect(report.strengths).toContain('Easy to read and understand');
    });

    it('should report poor quality with improvements needed', () => {
      const quality = new ContentQuality({
        overall: 0.3,
        coherence: 0.4,
        relevance: 0.3,
        creativity: 0.2,
        readability: 0.3,
      });

      const report = quality.getSummaryReport();

      expect(report.level).toBe('poor');
      expect(report.meetsStandards).toBe(false);
      expect(report.improvements.length).toBeGreaterThan(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const quality = new ContentQuality(validMetrics);
      const json = quality.toJSON();

      expect(json.metrics).toEqual(validMetrics);
      expect(json.thresholds).toBeDefined();
      expect(json.level).toBe('good');
      expect(json.meetsStandards).toBe(true);
    });
  });

  describe('static methods', () => {
    it('fromMetrics should create instance from metrics', () => {
      const quality = ContentQuality.fromMetrics(validMetrics);
      expect(quality.metrics).toEqual(validMetrics);
    });

    it('fromMetrics should accept custom thresholds', () => {
      const thresholds = { minimum: 0.5, good: 0.7, excellent: 0.85 };
      const quality = ContentQuality.fromMetrics(validMetrics, thresholds);
      expect(quality.thresholds).toEqual(thresholds);
    });

    it('createDefault should create with default metrics', () => {
      const quality = ContentQuality.createDefault();
      expect(quality.metrics.overall).toBe(0.7);
      expect(quality.metrics.coherence).toBe(0.7);
      expect(quality.metrics.readability).toBe(0.8);
    });
  });
});
