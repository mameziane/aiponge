/**
 * Content Domain Entity
 * Represents generated content with metadata and lifecycle management
 */

import { ContentError } from '../../application/errors';
import {
  AI_CONTENT_LIFECYCLE,
  AI_CONTENT_TRANSITIONS,
  assertValidTransition,
  type AiContentLifecycleStatus,
} from '@aiponge/shared-contracts';

export interface ContentMetadata {
  wordCount: number;
  characterCount: number;
  readingTimeMinutes: number;
  language: string;
  tokensUsed: number;
  generationTimeMs: number;

  // Quality metrics
  qualityScore: number;
  coherenceScore: number;
  relevanceScore: number;
  creativityScore: number;

  // SEO metrics
  seoScore?: number;
  readabilityScore?: number;
  keywordDensity?: Record<string, number>;

  // Provider info
  providerId: string;
  model: string;
  temperature: number;

  // Processing info
  processingSteps: string[];
  errorCount: number;
  warnings: string[];
}

export interface ContentAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  topics: string[];
  entities: Array<{ text: string; type: string; confidence: number }>;
  keyPhrases: string[];
  languageConfidence: number;
  contentStructure: {
    headings: number;
    paragraphs: number;
    bulletPoints: number;
    links: number;
  };
}

export type ContentType =
  | 'article'
  | 'blog'
  | 'creative'
  | 'technical'
  | 'email'
  | 'social'
  | 'summary'
  | 'educational'
  | 'analysis';
export type ContentStatus = AiContentLifecycleStatus;

export class Content {
  constructor(
    public readonly id: string,
    public readonly requestId: string,
    public content: string,
    public readonly contentType: ContentType,
    public metadata: ContentMetadata,
    public analysis?: ContentAnalysis,
    public formattedContent?: string,
    public version: number = 1,
    public parentId?: string,
    public status: ContentStatus = AI_CONTENT_LIFECYCLE.GENERATED,
    public isApproved: boolean = false,
    public approvedBy?: string,
    public approvedAt?: Date,
    public isPublished: boolean = false,
    public publishedAt?: Date,
    public publishUrl?: string,
    public cost: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    this.validateContent();
  }

  private validateContent(): void {
    if (!this.id?.trim()) {
      throw ContentError.validationError('id', 'Content ID is required');
    }

    if (!this.requestId?.trim()) {
      throw ContentError.validationError('requestId', 'Content request ID is required');
    }

    if (!this.content?.trim()) {
      throw ContentError.validationError('content', 'Content text is required');
    }

    if (this.content.length > 100000) {
      throw ContentError.validationError('content', 'Content exceeds maximum length of 100,000 characters');
    }

    if (this.version < 1) {
      throw ContentError.validationError('version', 'Content version must be at least 1');
    }

    if (this.cost < 0) {
      throw ContentError.validationError('cost', 'Content cost cannot be negative');
    }
  }

  /**
   * Update the content text and increment version
   */
  updateContent(newContent: string, _updatedBy?: string): void {
    if (!newContent?.trim()) {
      throw ContentError.validationError('content', 'Updated content cannot be empty');
    }

    this.content = newContent;
    this.version += 1;
    this.updatedAt = new Date();
    this.status = AI_CONTENT_LIFECYCLE.GENERATED;
    this.isApproved = false; // Reset approval when content changes
    this.approvedBy = undefined;
    this.approvedAt = undefined;

    // Update metadata if present
    if (this.metadata) {
      this.metadata.wordCount = this.calculateWordCount();
      this.metadata.characterCount = newContent.length;
      this.metadata.readingTimeMinutes = Math.ceil(this.metadata.wordCount / 200);
    }
  }

  /**
   * Approve the content
   */
  approve(approvedBy: string): void {
    if (!approvedBy?.trim()) {
      throw ContentError.validationError('approvedBy', 'Approver ID is required');
    }

    this.isApproved = true;
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.status = AI_CONTENT_LIFECYCLE.REVIEWED;
    this.updatedAt = new Date();
  }

  /**
   * Publish the content
   */
  publish(publishUrl?: string): void {
    if (!this.isApproved) {
      throw ContentError.invalidStateTransition('draft', 'published');
    }

    assertValidTransition(this.status, AI_CONTENT_LIFECYCLE.PUBLISHED, AI_CONTENT_TRANSITIONS, 'Content');
    this.isPublished = true;
    this.publishedAt = new Date();
    this.publishUrl = publishUrl;
    this.status = AI_CONTENT_LIFECYCLE.PUBLISHED;
    this.updatedAt = new Date();
  }

  /**
   * Archive the content
   */
  archive(): void {
    assertValidTransition(this.status, AI_CONTENT_LIFECYCLE.ARCHIVED, AI_CONTENT_TRANSITIONS, 'Content');
    this.status = AI_CONTENT_LIFECYCLE.ARCHIVED;
    this.updatedAt = new Date();
  }

  /**
   * Create a new version based on this content
   */
  createVersion(newContent: string, parentId?: string): Content {
    return new Content(
      `${this.id}_v${this.version + 1}`,
      this.requestId,
      newContent,
      this.contentType,
      { ...this.metadata, wordCount: this.calculateWordCount(newContent) },
      this.analysis,
      undefined, // Reset formatted content
      this.version + 1,
      parentId || this.id,
      AI_CONTENT_LIFECYCLE.GENERATED,
      false, // Reset approval
      undefined,
      undefined,
      false, // Reset published status
      undefined,
      undefined,
      this.cost
    );
  }

  /**
   * Calculate word count for content
   */
  private calculateWordCount(text?: string): number {
    const content = text || this.content;
    return content
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }

  /**
   * Get content summary information
   */
  getSummary(): {
    id: string;
    contentType: ContentType;
    wordCount: number;
    status: ContentStatus;
    qualityScore?: number;
    isApproved: boolean;
    isPublished: boolean;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id,
      contentType: this.contentType,
      wordCount: this.metadata?.wordCount || this.calculateWordCount(),
      status: this.status,
      qualityScore: this.metadata?.qualityScore,
      isApproved: this.isApproved,
      isPublished: this.isPublished,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Check if content is ready for publication
   */
  isReadyForPublication(): boolean {
    return (
      this.isApproved &&
      !this.isPublished &&
      this.status === AI_CONTENT_LIFECYCLE.REVIEWED &&
      this.content.trim().length > 0
    );
  }

  /**
   * Get content performance metrics
   */
  getPerformanceMetrics(): {
    qualityScore: number;
    readabilityScore: number;
    seoScore: number;
    engagementPotential: number;
  } {
    return {
      qualityScore: this.metadata?.qualityScore || 0,
      readabilityScore: this.metadata?.readabilityScore || 0,
      seoScore: this.metadata?.seoScore || 0,
      engagementPotential: this.calculateEngagementPotential(),
    };
  }

  /**
   * Calculate engagement potential based on content characteristics
   */
  private calculateEngagementPotential(): number {
    let score = 0.5; // Base score

    if (this.content.includes('?')) score += 0.1; // Questions engage readers
    if (this.content.includes('!')) score += 0.05; // Exclamations
    if (this.analysis?.sentiment === 'positive') score += 0.1;
    if (this.metadata?.creativityScore && this.metadata.creativityScore > 0.7) score += 0.15;

    return Math.min(score, 1.0);
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      requestId: this.requestId,
      content: this.content,
      contentType: this.contentType,
      metadata: this.metadata,
      analysis: this.analysis,
      formattedContent: this.formattedContent,
      version: this.version,
      parentId: this.parentId,
      status: this.status,
      isApproved: this.isApproved,
      approvedBy: this.approvedBy,
      approvedAt: this.approvedAt,
      isPublished: this.isPublished,
      publishedAt: this.publishedAt,
      publishUrl: this.publishUrl,
      cost: this.cost,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
