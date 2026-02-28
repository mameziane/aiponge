/**
 * Template Controller - HTTP request handlers for template operations
 * Manages content templates for different generation scenarios
 */

import { Request, Response, NextFunction } from 'express';
import { ManageTemplatesUseCase } from '../../application/use-cases/ManageTemplatesUseCase';
import { ContentTemplateService, ContentTemplate } from '../../domains/services/ContentTemplateService';
import { getLogger } from '../../config/service-urls';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';
import { serializeError, createControllerHelpers, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

const logger = getLogger('ai-content-service-templatecontroller');

const { handleRequest } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export interface TemplateCreateRequest {
  name: string;
  description: string;
  contentType: 'article' | 'blog' | 'creative' | 'technical' | 'email' | 'social' | 'summary' | 'educational';
  category: string;
  systemPrompt: string;
  userPromptStructure: string;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    required: boolean;
    description: string;
    defaultValue?: string | number | boolean | unknown[];
    validation?: {
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      options?: string[];
    };
  }>;
  visibility?: ContentVisibility;
  tags?: string[];
}

export interface TemplateQueryParams {
  contentType?: string;
  category?: string;
  visibility?: ContentVisibility;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'createdAt' | 'usageCount' | 'averageRating';
  sortOrder?: 'asc' | 'desc';
}

export class TemplateController {
  constructor(
    private readonly manageTemplatesUseCase: ManageTemplatesUseCase,
    private readonly templateService: ContentTemplateService
  ) {}

  /**
   * Create new template
   * POST /api/templates
   */
  async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const templateData: TemplateCreateRequest = req.body;

    if (!templateData.name || !templateData.contentType || !templateData.systemPrompt) {
      ServiceErrors.badRequest(res, 'name, contentType, and systemPrompt are required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create template',
      successStatus: 201,
      handler: async () => {
        const template = await this.manageTemplatesUseCase.createTemplate({
          name: templateData.name,
          description: templateData.description || '',
          contentType: templateData.contentType,
          category: templateData.category || 'general',
          systemPrompt: templateData.systemPrompt,
          userPromptStructure: templateData.userPromptStructure || '',
          variables: templateData.variables || [],
          visibility: templateData.visibility ?? CONTENT_VISIBILITY.PERSONAL,
          tags: templateData.tags || [],
          createdBy: (req as Request & { user?: { id: string } }).user?.id || 'system',
        });

        return { template };
      },
    });
  }

  /**
   * Get template by ID
   * GET /api/templates/:id
   */
  async getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const template = await this.templateService.loadTemplate(id);

      if (!template) {
        ServiceErrors.notFound(res, `Template with ID ${id}`, req);
        return;
      }

      sendSuccess(res, template);
    } catch (error) {
      logger.error('Error in getTemplateById:', { error: serializeError(error) });
      next(error);
    }
  }

  /**
   * Get templates list
   * GET /api/templates
   */
  async getTemplatesList(req: Request, res: Response, next: NextFunction): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get templates list',
      handler: async () => {
        const query: TemplateQueryParams = req.query;

        let templates: ContentTemplate[];

        if (query.contentType) {
          templates = await this.templateService.loadTemplatesByType(query.contentType);
        } else if (query.category) {
          templates = await this.templateService.loadTemplatesByCategory(query.category);
        } else {
          templates = await this.templateService.loadTemplates();
        }

        if (query.visibility !== undefined) {
          templates = templates.filter(t => t.visibility === query.visibility);
        }

        if (query.isActive !== undefined) {
          templates = templates.filter(t => t.isActive === (String(query.isActive) === 'true'));
        }

        if (query.sortBy) {
          templates.sort((a, b) => {
            let aVal, bVal;

            switch (query.sortBy) {
              case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
              case 'createdAt':
                aVal = a.metadata.createdAt.getTime();
                bVal = b.metadata.createdAt.getTime();
                break;
              case 'usageCount':
                aVal = a.metadata.usageCount;
                bVal = b.metadata.usageCount;
                break;
              case 'averageRating':
                aVal = a.metadata.averageRating;
                bVal = b.metadata.averageRating;
                break;
              default:
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
            }

            if (query.sortOrder === 'desc') {
              return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            } else {
              return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
          });
        }

        const offset = typeof query.offset === 'number' ? query.offset : parseInt(String(query.offset)) || 0;
        const limit = typeof query.limit === 'number' ? query.limit : parseInt(String(query.limit)) || 50;
        const paginatedTemplates = templates.slice(offset, offset + limit);

        return {
          templates: paginatedTemplates,
          total: templates.length,
          offset,
          limit,
          filters: {
            contentType: query.contentType,
            category: query.category,
            visibility: query.visibility,
            isActive: query.isActive,
          },
        };
      },
    });
  }

  /**
   * Update template
   * PATCH /api/templates/:id
   */
  async updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updates = req.body;

      const updatedTemplate = await this.manageTemplatesUseCase.updateTemplate({
        templateId: id,
        updatedBy: (req as Request & { user?: { id: string } }).user?.id || 'system',
        ...updates,
      });

      if (!updatedTemplate) {
        ServiceErrors.notFound(res, `Template with ID ${id}`, req);
        return;
      }

      sendSuccess(res, { template: updatedTemplate });
    } catch (error) {
      logger.error('Error in updateTemplate:', { error: serializeError(error) });
      next(error);
    }
  }

  /**
   * Delete template
   * DELETE /api/templates/:id
   */
  async deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const userId = (req as Request & { user?: { id: string } }).user?.id || 'system';
      const success = await this.manageTemplatesUseCase.deleteTemplate(id, userId);

      if (!success) {
        ServiceErrors.notFound(res, `Template with ID ${id}`, req);
        return;
      }

      sendSuccess(res, { message: 'Template deleted successfully', templateId: id });
    } catch (error) {
      logger.error('Error in deleteTemplate:', { error: serializeError(error) });
      next(error);
    }
  }

  /**
   * Process template with variables
   * POST /api/templates/:id/process
   */
  async processTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { variables, options } = req.body;

      if (!variables || typeof variables !== 'object') {
        ServiceErrors.badRequest(res, 'variables object is required', req);
        return;
      }

      const result = await this.templateService.processTemplate(id, variables, options);

      if (!result) {
        ServiceErrors.notFound(res, `Template with ID ${id}`, req);
        return;
      }

      sendSuccess(res, { result });
    } catch (error) {
      logger.error('Error in processTemplate:', { error: serializeError(error) });
      next(error);
    }
  }

  /**
   * Get template categories
   * GET /api/templates/categories
   */
  async getTemplateCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get template categories',
      handler: async () => {
        const templates = await this.templateService.loadTemplates();
        const categories = [...new Set(templates.map(t => t.category))];
        return { categories, total: categories.length };
      },
    });
  }

  /**
   * Search templates
   * GET /api/templates/search
   */
  async searchTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { q, contentType, category, limit, offset } = req.query;

    if (!q || typeof q !== 'string') {
      ServiceErrors.badRequest(res, 'Search query (q) is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to search templates',
      handler: async () => {
        const searchCriteria: { contentType?: string; category?: string; query?: string } = {
          query: q as string,
        };
        if (contentType) searchCriteria.contentType = contentType as string;
        if (category) searchCriteria.category = category as string;
        const results = await this.templateService.searchTemplates(searchCriteria);

        const paginatedResults = results.slice(
          parseInt(offset as string) || 0,
          (parseInt(offset as string) || 0) + (parseInt(limit as string) || 50)
        );

        return {
          templates: paginatedResults,
          total: results.length,
          query: q,
          filters: {
            contentType: contentType as string,
            category: category as string,
          },
        };
      },
    });
  }
}
