/**
 * Generation Request Domain Entity
 * Represents a content generation request with parameters and tracking
 */

import { ContentError } from '../../application/errors';

export interface GenerationParameters {
  maxLength?: number;
  temperature?: number;
  tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'persuasive';
  targetAudience?: string;
  style?: 'informative' | 'narrative' | 'promotional' | 'educational';
  language?: string;
  includeOutline?: boolean;
  seoOptimize?: boolean;
}

export interface GenerationOptions {
  includeAlternatives?: boolean;
  optimizeForSEO?: boolean;
  addCitations?: boolean;
  formatOutput?: 'plain' | 'markdown' | 'html';
  priority?: 'low' | 'normal' | 'high';
  templateId?: string;
}

export interface RequestMetadata {
  sourceService?: string;
  requestIp?: string;
  userAgent?: string;
  apiVersion?: string;
  clientId?: string;
  error?: string;
  cancelReason?: string;
}

export type RequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
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

export class GenerationRequest {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly contentType: ContentType,
    public readonly prompt: string,
    public parameters: GenerationParameters = {},
    public options: GenerationOptions = {},
    public status: RequestStatus = 'pending',
    public workflowId?: string,
    public providerId?: string,
    public model?: string,
    public metadata: RequestMetadata = {},
    public readonly createdAt: Date = new Date(),
    public startedAt?: Date,
    public completedAt?: Date,
    public updatedAt: Date = new Date()
  ) {
    this.validateRequest();
  }

  private validateRequest(): void {
    if (!this.id?.trim()) {
      throw ContentError.validationError('id', 'Request ID is required');
    }

    if (!this.userId?.trim()) {
      throw ContentError.userIdRequired();
    }

    if (!this.prompt?.trim()) {
      throw ContentError.validationError('prompt', 'Prompt is required');
    }

    // Allow larger prompts (20000 chars) since templates can add 3000-5000 chars of instructions
    // User input is validated at 5000 chars in GenerateContentUseCase before template expansion
    if (this.prompt.length > 20000) {
      throw ContentError.validationError('prompt', 'Prompt exceeds maximum length of 20000 characters');
    }

    if (this.parameters.maxLength && this.parameters.maxLength < 50) {
      throw ContentError.validationError('maxLength', 'Max length must be at least 50 characters');
    }

    if (this.parameters.temperature && (this.parameters.temperature < 0 || this.parameters.temperature > 1)) {
      throw ContentError.validationError('temperature', 'Temperature must be between 0 and 1');
    }
  }

  /**
   * Start processing the request
   */
  startProcessing(workflowId?: string, providerId?: string, model?: string): void {
    if (this.status !== 'pending') {
      throw ContentError.invalidStateTransition(this.status, 'processing');
    }

    this.status = 'processing';
    this.startedAt = new Date();
    this.updatedAt = new Date();

    if (workflowId) this.workflowId = workflowId;
    if (providerId) this.providerId = providerId;
    if (model) this.model = model;
  }

  /**
   * Complete the request successfully
   */
  complete(): void {
    if (this.status !== 'processing') {
      throw ContentError.invalidStateTransition(this.status, 'completed');
    }

    this.status = 'completed';
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Mark the request as failed
   */
  fail(error?: string): void {
    if (this.status === 'completed') {
      throw ContentError.invalidStateTransition('completed', 'failed');
    }

    this.status = 'failed';
    this.completedAt = new Date();
    this.updatedAt = new Date();

    if (error && this.metadata) {
      this.metadata.error = error;
    }
  }

  /**
   * Cancel the request
   */
  cancel(reason?: string): void {
    if (this.status === 'completed') {
      throw ContentError.invalidStateTransition('completed', 'cancelled');
    }

    this.status = 'cancelled';
    this.completedAt = new Date();
    this.updatedAt = new Date();

    if (reason && this.metadata) {
      this.metadata.cancelReason = reason;
    }
  }

  /**
   * Update request parameters
   */
  updateParameters(newParameters: Partial<GenerationParameters>): void {
    if (this.status !== 'pending') {
      throw ContentError.invalidStateTransition(this.status, 'pending');
    }

    this.parameters = { ...this.parameters, ...newParameters };
    this.updatedAt = new Date();

    // Re-validate after update
    this.validateRequest();
  }

  /**
   * Update request options
   */
  updateOptions(newOptions: Partial<GenerationOptions>): void {
    if (this.status !== 'pending') {
      throw ContentError.invalidStateTransition(this.status, 'pending');
    }

    this.options = { ...this.options, ...newOptions };
    this.updatedAt = new Date();
  }

  /**
   * Get processing duration in milliseconds
   */
  getProcessingDuration(): number | null {
    if (!this.startedAt) return null;

    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  /**
   * Get total duration since creation in milliseconds
   */
  getTotalDuration(): number {
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.createdAt.getTime();
  }

  /**
   * Check if request is in progress
   */
  isInProgress(): boolean {
    return this.status === 'processing';
  }

  /**
   * Check if request is completed (successfully or with failure)
   */
  isCompleted(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Check if request was successful
   */
  isSuccessful(): boolean {
    return this.status === 'completed';
  }

  /**
   * Get request priority (with default)
   */
  getPriority(): 'low' | 'normal' | 'high' {
    return this.options.priority || 'normal';
  }

  /**
   * Get expected content length based on type and parameters
   */
  getExpectedContentLength(): number {
    if (this.parameters.maxLength) {
      return this.parameters.maxLength;
    }

    // Default lengths by content type
    const defaultLengths: Record<ContentType, number> = {
      article: 1000,
      blog: 800,
      creative: 600,
      technical: 1200,
      email: 300,
      social: 280,
      summary: 200,
      educational: 1000,
      analysis: 500,
    };

    return defaultLengths[this.contentType] || 500;
  }

  /**
   * Get processing timeout based on content type and length
   */
  getProcessingTimeout(): number {
    const baseTimeout = 30000; // 30 seconds
    const expectedLength = this.getExpectedContentLength();

    // Add extra time for longer content
    const lengthMultiplier = Math.ceil(expectedLength / 1000);
    return baseTimeout + lengthMultiplier * 10000; // Add 10s per 1000 characters
  }

  /**
   * Get request summary for logging/monitoring
   */
  getSummary(): {
    id: string;
    userId: string;
    contentType: ContentType;
    status: RequestStatus;
    priority: string;
    promptLength: number;
    expectedLength: number;
    processingDuration?: number;
    totalDuration: number;
    providerId?: string;
    model?: string;
  } {
    return {
      id: this.id,
      userId: this.userId,
      contentType: this.contentType,
      status: this.status,
      priority: this.getPriority(),
      promptLength: this.prompt.length,
      expectedLength: this.getExpectedContentLength(),
      processingDuration: this.getProcessingDuration() || undefined,
      totalDuration: this.getTotalDuration(),
      providerId: this.providerId,
      model: this.model,
    };
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      userId: this.userId,
      contentType: this.contentType,
      prompt: this.prompt,
      parameters: this.parameters,
      options: this.options,
      status: this.status,
      workflowId: this.workflowId,
      providerId: this.providerId,
      model: this.model,
      metadata: this.metadata,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      updatedAt: this.updatedAt,
    };
  }
}
