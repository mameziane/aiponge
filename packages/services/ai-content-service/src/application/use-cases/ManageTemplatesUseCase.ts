/**
 * Manage Templates Use Case - Business logic for template management operations
 */

import {
  ContentTemplateService,
  ContentTemplate,
  TemplateVariable,
} from '../../domains/services/ContentTemplateService';
import { getLogger } from '../../config/service-urls';
import { TemplateError } from '../errors';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('ai-content-service-managetemplatesusecase');

interface AnalyticsService {
  recordEvent(event: {
    eventType: string;
    eventData: Record<string, unknown>;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

interface TemplateRepository {
  findById(id: string): Promise<unknown>;
  create(data: unknown): Promise<unknown>;
  update(id: string, data: unknown): Promise<unknown>;
  save(data: unknown): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export interface CreateTemplateRequest {
  name: string;
  description: string;
  contentType: 'article' | 'blog' | 'creative' | 'technical' | 'email' | 'social' | 'summary' | 'educational';
  category: string;
  systemPrompt: string;
  userPromptStructure: string;
  variables: TemplateVariable[];
  tags?: string[];
  visibility?: ContentVisibility;
  createdBy: string;
}

export interface UpdateTemplateRequest {
  templateId: string;
  name?: string;
  description?: string;
  systemPrompt?: string;
  userPromptStructure?: string;
  variables?: TemplateVariable[];
  tags?: string[];
  isActive?: boolean;
  visibility?: ContentVisibility;
  updatedBy: string;
}

export interface SearchTemplatesRequest {
  contentType?: string;
  category?: string;
  tags?: string[];
  query?: string;
  visibility?: ContentVisibility;
  limit?: number;
  offset?: number;
}

export interface TemplateUsageRequest {
  templateId: string;
  userId: string;
  variables: Record<string, unknown>;
  rating?: number; // 1-5 scale
  feedback?: string;
}

export interface TemplateAnalyticsRequest {
  templateId?: string;
  timeframe?: 'day' | 'week' | 'month' | 'year';
  contentType?: string;
}

export interface ManageTemplatesResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    operation: string;
    timestamp: Date;
    userId?: string;
    templateId?: string;
  };
}

export class ManageTemplatesUseCase {
  constructor(
    private readonly _templateService: ContentTemplateService,
    private readonly _templateRepository?: TemplateRepository,
    private readonly _analyticsService?: AnalyticsService
  ) {
    logger.debug('📋 Initialized with template management capabilities');
  }

  private get templateService(): ContentTemplateService {
    return this._templateService;
  }

  private get templateRepository(): TemplateRepository | undefined {
    return this._templateRepository;
  }

  private get analyticsService(): AnalyticsService | undefined {
    return this._analyticsService;
  }

  /**
   * Create a new content template
   */
  async createTemplate(request: CreateTemplateRequest): Promise<ManageTemplatesResult<ContentTemplate>> {
    try {
      // Record analytics
      await this.recordAnalyticsSafely({
        eventType: 'template_creation_started',
        eventData: {
          name: request.name,
          contentType: request.contentType,
          category: request.category,
          createdBy: request.createdBy,
          variableCount: request.variables.length,
        },
      });

      // Validate request
      this.validateCreateTemplateRequest(request);

      // Create template data
      const templateData = {
        name: request.name,
        description: request.description,
        contentType: request.contentType,
        category: request.category,
        systemPrompt: request.systemPrompt,
        userPromptStructure: request.userPromptStructure,
        variables: request.variables,
        metadata: {
          author: request.createdBy,
          version: '1.0',
          createdAt: new Date(),
          lastModified: new Date(),
          usageCount: 0,
          averageRating: 0,
          tags: request.tags || [],
        },
        visibility: request.visibility ?? CONTENT_VISIBILITY.PERSONAL,
      };

      // Create template through service
      const template = await this.templateService.createTemplate(templateData as unknown as Omit<ContentTemplate, 'id' | 'metadata' | 'isActive'>);

      // Store in repository if available
      if (this.templateRepository) {
        await this.templateRepository.save(template);
      }

      // Record success analytics
      await this.recordAnalyticsSafely({
        eventType: 'template_created',
        eventData: {
          templateId: template.id,
          name: template.name,
          contentType: template.contentType,
          createdBy: request.createdBy,
        },
      });

      logger.info('✨ Created template: {} ({})', { data0: template.name, data1: template.id });

      return {
        success: true,
        data: template,
        metadata: {
          operation: 'create_template',
          timestamp: new Date(),
          userId: request.createdBy,
          templateId: template.id,
        },
      };
    } catch (error) {
      return this.handleError('CREATE_TEMPLATE_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'create_template',
        userId: request.createdBy,
      });
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(request: UpdateTemplateRequest): Promise<ManageTemplatesResult<ContentTemplate>> {
    try {
      await this.recordAnalyticsSafely({
        eventType: 'template_update_started',
        eventData: {
          templateId: request.templateId,
          updatedBy: request.updatedBy,
          hasNameUpdate: !!request.name,
          hasPromptUpdate: !!request.systemPrompt || !!request.userPromptStructure,
        },
      });

      // Validate request
      this.validateUpdateTemplateRequest(request);

      // Get existing template
      const existingTemplate = await this.templateService.loadTemplate(request.templateId);
      if (!existingTemplate) {
        throw TemplateError.templateNotFound(request.templateId);
      }

      // Prepare updates
      const updates: Partial<ContentTemplate> = {};

      if (request.name) updates.name = request.name;
      if (request.description) updates.description = request.description;
      if (request.systemPrompt) updates.systemPrompt = request.systemPrompt;
      if (request.userPromptStructure) updates.userPromptStructure = request.userPromptStructure;
      if (request.variables) updates.variables = request.variables;
      if (request.isActive !== undefined) updates.isActive = request.isActive;
      if (request.visibility !== undefined) updates.visibility = request.visibility;

      if (request.tags) {
        updates.metadata = {
          ...existingTemplate.metadata,
          tags: request.tags,
          lastModified: new Date(),
        };
      }

      // Update template
      const updatedTemplate = await this.templateService.updateTemplate(request.templateId, updates);

      // Update in repository if available
      if (this.templateRepository) {
        await this.templateRepository.update(request.templateId, updatedTemplate);
      }

      await this.recordAnalyticsSafely({
        eventType: 'template_updated',
        eventData: {
          templateId: request.templateId,
          updatedBy: request.updatedBy,
          fieldsUpdated: Object.keys(updates),
        },
      });

      logger.info('📝 Updated template: {} ({})', { data0: updatedTemplate.name, data1: request.templateId });

      return {
        success: true,
        data: updatedTemplate,
        metadata: {
          operation: 'update_template',
          timestamp: new Date(),
          userId: request.updatedBy,
          templateId: request.templateId,
        },
      };
    } catch (error) {
      return this.handleError('UPDATE_TEMPLATE_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'update_template',
        userId: request.updatedBy,
        templateId: request.templateId,
      });
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string, userId: string): Promise<ManageTemplatesResult<boolean>> {
    try {
      await this.recordAnalyticsSafely({
        eventType: 'template_deletion_started',
        eventData: {
          templateId,
          deletedBy: userId,
        },
      });

      // Check if template exists
      const existingTemplate = await this.templateService.loadTemplate(templateId);
      if (!existingTemplate) {
        throw TemplateError.templateNotFound(templateId);
      }

      // Delete from service
      const deleted = await this.templateService.deleteTemplate(templateId);

      if (!deleted) {
        throw TemplateError.deleteFailed(templateId);
      }

      // Delete from repository if available
      if (this.templateRepository) {
        await this.templateRepository.delete(templateId);
      }

      await this.recordAnalyticsSafely({
        eventType: 'template_deleted',
        eventData: {
          templateId,
          templateName: existingTemplate.name,
          deletedBy: userId,
        },
      });

      logger.info('🗑️ Deleted template: {} ({})', { data0: existingTemplate.name, data1: templateId });

      return {
        success: true,
        data: true,
        metadata: {
          operation: 'delete_template',
          timestamp: new Date(),
          userId,
          templateId,
        },
      };
    } catch (error) {
      return this.handleError('DELETE_TEMPLATE_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'delete_template',
        userId,
        templateId,
      });
    }
  }

  /**
   * Search and list templates
   */
  async searchTemplates(request: SearchTemplatesRequest): Promise<
    ManageTemplatesResult<{
      templates: ContentTemplate[];
      total: number;
      offset: number;
      limit: number;
    }>
  > {
    try {
      await this.recordAnalyticsSafely({
        eventType: 'template_search_started',
        eventData: {
          contentType: request.contentType,
          category: request.category,
          hasQuery: !!request.query,
          visibilityFilter: request.visibility,
        },
      });

      // Search templates
      const allTemplates = await this.templateService.searchTemplates({
        contentType: request.contentType,
        category: request.category,
        tags: request.tags,
        query: request.query,
        visibility: request.visibility,
      });

      // Apply pagination
      const limit = request.limit || 20;
      const offset = request.offset || 0;
      const total = allTemplates.length;
      const templates = allTemplates.slice(offset, offset + limit);

      await this.recordAnalyticsSafely({
        eventType: 'template_search_completed',
        eventData: {
          totalResults: total,
          returnedResults: templates.length,
          searchCriteria: request,
        },
      });

      return {
        success: true,
        data: {
          templates,
          total,
          offset,
          limit,
        },
        metadata: {
          operation: 'search_templates',
          timestamp: new Date(),
        },
      };
    } catch (error) {
      return this.handleError('SEARCH_TEMPLATES_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'search_templates',
      });
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<ManageTemplatesResult<ContentTemplate>> {
    try {
      const template = await this.templateService.loadTemplate(templateId);

      if (!template) {
        throw TemplateError.templateNotFound(templateId);
      }

      await this.recordAnalyticsSafely({
        eventType: 'template_accessed',
        eventData: {
          templateId,
          templateName: template.name,
          contentType: template.contentType,
        },
      });

      return {
        success: true,
        data: template,
        metadata: {
          operation: 'get_template',
          timestamp: new Date(),
          templateId,
        },
      };
    } catch (error) {
      return this.handleError('GET_TEMPLATE_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'get_template',
        templateId,
      });
    }
  }

  /**
   * Record template usage for analytics
   */
  async recordTemplateUsage(request: TemplateUsageRequest): Promise<ManageTemplatesResult<boolean>> {
    try {
      // Update template usage count and rating
      const template = await this.templateService.loadTemplate(request.templateId);
      if (!template) {
        throw TemplateError.templateNotFound(request.templateId);
      }

      // Update template metadata
      const newUsageCount = template.metadata.usageCount + 1;
      let newAverageRating = template.metadata.averageRating;

      if (request.rating) {
        // Calculate new average rating
        const totalRatingPoints = template.metadata.averageRating * template.metadata.usageCount;
        newAverageRating = (totalRatingPoints + request.rating) / newUsageCount;
      }

      await this.templateService.updateTemplate(request.templateId, {
        metadata: {
          ...template.metadata,
          usageCount: newUsageCount,
          averageRating: newAverageRating,
          lastModified: new Date(),
        },
      });

      // Record analytics
      await this.recordAnalyticsSafely({
        eventType: 'template_used',
        eventData: {
          templateId: request.templateId,
          userId: request.userId,
          variableCount: Object.keys(request.variables).length,
          rating: request.rating,
          hasFeedback: !!request.feedback,
        },
      });

      return {
        success: true,
        data: true,
        metadata: {
          operation: 'record_usage',
          timestamp: new Date(),
          userId: request.userId,
          templateId: request.templateId,
        },
      };
    } catch (error) {
      return this.handleError('RECORD_USAGE_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'record_usage',
        userId: request.userId,
        templateId: request.templateId,
      });
    }
  }

  /**
   * Get template analytics and statistics
   */
  async getTemplateAnalytics(request: TemplateAnalyticsRequest): Promise<
    ManageTemplatesResult<{
      overview: {
        totalTemplates: number;
        activeTemplates: number;
        totalUsage: number;
        averageRating: number;
      };
      byContentType?: Record<string, number>;
      topTemplates?: Array<{
        id: string;
        name: string;
        usageCount: number;
        averageRating: number;
      }>;
      recentActivity?: Array<{
        templateId: string;
        templateName: string;
        usageCount: number;
        lastUsed: Date;
      }>;
    }>
  > {
    try {
      const allTemplates = await this.templateService.loadTemplates();

      // Filter by content type if specified
      const templates = request.contentType
        ? allTemplates.filter(t => t.contentType === request.contentType)
        : allTemplates;

      // Calculate overview statistics
      const overview = {
        totalTemplates: templates.length,
        activeTemplates: templates.filter(t => t.isActive).length,
        totalUsage: templates.reduce((sum, t) => sum + t.metadata.usageCount, 0),
        averageRating:
          templates.length > 0 ? templates.reduce((sum, t) => sum + t.metadata.averageRating, 0) / templates.length : 0,
      };

      // Group by content type
      const byContentType = templates.reduce(
        (acc, template) => {
          acc[template.contentType] = (acc[template.contentType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Get top templates by usage
      const topTemplates = templates
        .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
        .slice(0, 10)
        .map(template => ({
          id: template.id,
          name: template.name,
          usageCount: template.metadata.usageCount,
          averageRating: template.metadata.averageRating,
        }));

      // Recent activity (mock implementation - would use actual usage data)
      const recentActivity = templates
        .filter(t => t.metadata.usageCount > 0)
        .sort((a, b) => b.metadata.lastModified.getTime() - a.metadata.lastModified.getTime())
        .slice(0, 5)
        .map(template => ({
          templateId: template.id,
          templateName: template.name,
          usageCount: template.metadata.usageCount,
          lastUsed: template.metadata.lastModified,
        }));

      await this.recordAnalyticsSafely({
        eventType: 'template_analytics_accessed',
        eventData: {
          contentType: request.contentType,
          timeframe: request.timeframe,
          templateId: request.templateId,
        },
      });

      return {
        success: true,
        data: {
          overview,
          byContentType,
          topTemplates,
          recentActivity,
        },
        metadata: {
          operation: 'get_analytics',
          timestamp: new Date(),
        },
      };
    } catch (error) {
      return this.handleError('GET_ANALYTICS_FAILED', error instanceof Error ? error : new Error(String(error)), {
        operation: 'get_analytics',
      });
    }
  }

  // ===== PRIVATE METHODS =====

  private validateCreateTemplateRequest(request: CreateTemplateRequest): void {
    if (!request.name?.trim()) {
      throw TemplateError.validationError('name', 'Template name is required');
    }

    if (!request.contentType) {
      throw TemplateError.validationError('contentType', 'Content type is required');
    }

    if (!request.category?.trim()) {
      throw TemplateError.validationError('category', 'Category is required');
    }

    if (!request.systemPrompt?.trim()) {
      throw TemplateError.validationError('systemPrompt', 'System prompt is required');
    }

    if (!request.userPromptStructure?.trim()) {
      throw TemplateError.validationError('userPromptStructure', 'User prompt structure is required');
    }

    if (!request.createdBy?.trim()) {
      throw TemplateError.validationError('createdBy', 'Creator ID is required');
    }

    if (!Array.isArray(request.variables)) {
      throw TemplateError.validationError('variables', 'Variables must be an array');
    }

    // Validate variables
    request.variables.forEach((variable, index) => {
      if (!variable.name?.trim()) {
        throw TemplateError.validationError('variables', `Variable ${index + 1} name is required`);
      }
      if (!variable.type) {
        throw TemplateError.validationError('variables', `Variable ${index + 1} type is required`);
      }
      if (typeof variable.required !== 'boolean') {
        throw TemplateError.validationError('variables', `Variable ${index + 1} required field must be boolean`);
      }
    });
  }

  private validateUpdateTemplateRequest(request: UpdateTemplateRequest): void {
    if (!request.templateId?.trim()) {
      throw TemplateError.validationError('templateId', 'Template ID is required');
    }

    if (!request.updatedBy?.trim()) {
      throw TemplateError.validationError('updatedBy', 'Updater ID is required');
    }

    // At least one field must be provided for update
    const updateFields = [
      request.name,
      request.description,
      request.systemPrompt,
      request.userPromptStructure,
      request.variables,
      request.tags,
      request.isActive,
      request.visibility,
    ];

    if (!updateFields.some(field => field !== undefined)) {
      throw TemplateError.validationError('update', 'At least one field must be provided for update');
    }
  }

  private handleError(code: string, error: Error, metadata: Record<string, unknown>): ManageTemplatesResult<never> {
    logger.error('${code}:', { error: error instanceof Error ? error.message : String(error) });

    void this.recordAnalyticsSafely({
      eventType: 'template_operation_failed',
      eventData: {
        errorCode: code,
        errorMessage: error.message,
        operation: metadata.operation,
        userId: metadata.userId,
        templateId: metadata.templateId,
      },
    });

    return {
      success: false,
      error: {
        code,
        message: error.message,
        details: metadata,
      },
      metadata: {
        operation: metadata.operation as string,
        timestamp: new Date(),
        userId: metadata.userId as string,
        templateId: metadata.templateId as string,
      },
    };
  }

  private async recordAnalyticsSafely(event: { eventType: string; eventData: Record<string, unknown> }): Promise<void> {
    if (!this.analyticsService) return;

    try {
      this.analyticsService
        .recordEvent({
          eventType: event.eventType,
          eventData: event.eventData,
          timestamp: new Date(),
          metadata: {
            service: 'ai-content-service',
            useCase: 'ManageTemplatesUseCase',
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to record analytics (non-blocking):', { data: error.message });
        });
    } catch (error) {
      logger.warn('Failed to initiate analytics recording (non-blocking):', { data: error });
    }
  }
}
