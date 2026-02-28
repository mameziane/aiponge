/**
 * Content Quality Value Object
 * Represents quality metrics and scoring for generated content
 */

import { ContentError } from '../../application/errors';

export interface QualityMetrics {
  overall: number;
  coherence: number;
  relevance: number;
  creativity: number;
  readability: number;
  seo?: number;
  engagement?: number;
}

export interface QualityThresholds {
  minimum: number;
  good: number;
  excellent: number;
}

export type QualityLevel = 'poor' | 'acceptable' | 'good' | 'excellent';

export class ContentQuality {
  constructor(
    public readonly metrics: QualityMetrics,
    public readonly thresholds: QualityThresholds = {
      minimum: 0.6,
      good: 0.75,
      excellent: 0.9,
    }
  ) {
    this.validateMetrics();
  }

  private validateMetrics(): void {
    Object.entries(this.metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && (value < 0 || value > 1)) {
        throw ContentError.invalidQuality(`Metric ${key} must be between 0 and 1, got ${value}`);
      }
    });
  }

  /**
   * Get overall quality level
   */
  getQualityLevel(): QualityLevel {
    if (this.metrics.overall >= this.thresholds.excellent) return 'excellent';
    if (this.metrics.overall >= this.thresholds.good) return 'good';
    if (this.metrics.overall >= this.thresholds.minimum) return 'acceptable';
    return 'poor';
  }

  /**
   * Check if content meets minimum quality standards
   */
  meetsMinimumStandards(): boolean {
    return this.metrics.overall >= this.thresholds.minimum;
  }

  /**
   * Get quality improvement suggestions
   */
  getImprovementSuggestions(): string[] {
    const suggestions: string[] = [];

    if (this.metrics.coherence < 0.7) {
      suggestions.push('Improve content structure and logical flow');
    }

    if (this.metrics.relevance < 0.7) {
      suggestions.push('Ensure content stays focused on the main topic');
    }

    if (this.metrics.creativity < 0.6) {
      suggestions.push('Add more creative elements and unique perspectives');
    }

    if (this.metrics.readability < 0.7) {
      suggestions.push('Simplify sentence structure and vocabulary');
    }

    if (this.metrics.seo && this.metrics.seo < 0.7) {
      suggestions.push('Optimize for search engines with better keyword usage');
    }

    if (this.metrics.engagement && this.metrics.engagement < 0.7) {
      suggestions.push('Add more engaging elements like questions or calls-to-action');
    }

    return suggestions;
  }

  /**
   * Compare with another quality assessment
   */
  compareWith(other: ContentQuality): {
    improvement: number;
    betterMetrics: string[];
    worseMetrics: string[];
  } {
    const improvement = this.metrics.overall - other.metrics.overall;
    const betterMetrics: string[] = [];
    const worseMetrics: string[] = [];

    Object.entries(this.metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && typeof other.metrics[key as keyof QualityMetrics] === 'number') {
        const otherValue = other.metrics[key as keyof QualityMetrics] as number;
        if (value > otherValue) {
          betterMetrics.push(key);
        } else if (value < otherValue) {
          worseMetrics.push(key);
        }
      }
    });

    return {
      improvement,
      betterMetrics,
      worseMetrics,
    };
  }

  /**
   * Create a summary report
   */
  getSummaryReport(): {
    level: QualityLevel;
    score: number;
    strengths: string[];
    improvements: string[];
    meetsStandards: boolean;
  } {
    const strengths: string[] = [];

    if (this.metrics.coherence >= 0.8) strengths.push('Well-structured and coherent');
    if (this.metrics.relevance >= 0.8) strengths.push('Highly relevant to topic');
    if (this.metrics.creativity >= 0.8) strengths.push('Creative and original');
    if (this.metrics.readability >= 0.8) strengths.push('Easy to read and understand');
    if (this.metrics.seo && this.metrics.seo >= 0.8) strengths.push('SEO optimized');
    if (this.metrics.engagement && this.metrics.engagement >= 0.8) strengths.push('Engaging content');

    return {
      level: this.getQualityLevel(),
      score: this.metrics.overall,
      strengths,
      improvements: this.getImprovementSuggestions(),
      meetsStandards: this.meetsMinimumStandards(),
    };
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      metrics: this.metrics,
      thresholds: this.thresholds,
      level: this.getQualityLevel(),
      meetsStandards: this.meetsMinimumStandards(),
    };
  }

  /**
   * Create from metrics object
   */
  static fromMetrics(metrics: QualityMetrics, thresholds?: QualityThresholds): ContentQuality {
    return new ContentQuality(metrics, thresholds);
  }

  /**
   * Create with default metrics
   */
  static createDefault(): ContentQuality {
    return new ContentQuality({
      overall: 0.7,
      coherence: 0.7,
      relevance: 0.7,
      creativity: 0.6,
      readability: 0.8,
    });
  }
}
