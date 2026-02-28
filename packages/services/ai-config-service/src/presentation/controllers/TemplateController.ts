/**
 * Template Controller
 * REST API endpoints for template CRUD operations
 * Uses handleRequest wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { TemplateService } from '../../domains/templates/application/services/TemplateService';
import { CacheService } from '../../domains/templates/application/services/CacheService';
import {
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateSearchFilters,
  TemplateNotFoundError,
  TemplateValidationError,
} from '../../domains/templates/application/types';
import { ServiceErrors } from '../utils/response-helpers';
import { createControllerHelpers } from '@aiponge/platform-core';

const { handleRequest } = createControllerHelpers('ai-config-service', (res, error, message, req) => {
  if (error instanceof TemplateNotFoundError) {
    ServiceErrors.notFound(res, error.message, req);
  } else if (error instanceof TemplateValidationError) {
    ServiceErrors.badRequest(res, error.message, req, { validationErrors: error.validationErrors });
  } else {
    ServiceErrors.fromException(res, error, message, req);
  }
});

export class TemplateController {
  private templateService: TemplateService;
  private cacheService: CacheService;

  constructor(templateService: TemplateService, cacheService: CacheService) {
    this.templateService = templateService;
    this.cacheService = cacheService;
  }

  /**
   * Create a new template
   * POST /api/templates
   */
  async createTemplate(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      successStatus: 201,
      errorMessage: 'Failed to create template',
      handler: async () => {
        const createRequest: CreateTemplateRequest = {
          name: req.body.name,
          description: req.body.description,
          category: req.body.category,
          content: req.body.content,
          variables: req.body.variables || [],
          tags: req.body.tags || [],
          createdBy: req.body.createdBy || 'unknown',
        };

        const template = await this.templateService.createTemplate(createRequest);
        this.cacheService.cacheTemplate(template);
        return template;
      },
    });
  }

  /**
   * Get template by ID
   * GET /api/templates/:id
   */
  async getTemplate(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get template',
      handler: async () => {
        const templateId = req.params.id as string;
        let template = this.cacheService.getTemplate(templateId);

        if (!template) {
          template = await this.templateService.getTemplate(templateId);
          this.cacheService.cacheTemplate(template);
        }

        return template;
      },
    });
  }

  /**
   * Update template
   * PUT /api/templates/:id
   */
  async updateTemplate(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update template',
      handler: async () => {
        const templateId = req.params.id as string;
        const updateRequest: UpdateTemplateRequest = req.body;
        const template = await this.templateService.updateTemplate(templateId, updateRequest);
        this.cacheService.cacheTemplate(template);
        return template;
      },
    });
  }

  /**
   * Delete template
   * DELETE /api/templates/:id
   */
  async deleteTemplate(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to delete template',
      handler: async () => {
        const templateId = req.params.id as string;
        const deleted = await this.templateService.deleteTemplate(templateId);
        if (deleted) {
          this.cacheService.invalidateTemplate(templateId);
        }
        return { deleted };
      },
    });
  }

  /**
   * List templates with filtering
   * GET /api/templates
   */
  async listTemplates(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to list templates',
      handler: async () => {
        const filters: TemplateSearchFilters = {
          query: req.query.query as string,
          category: req.query.category as string,
          tags: req.query.tags ? String(req.query.tags).split(',') : undefined,
          isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
          createdBy: req.query.createdBy as string,
          limit: req.query.limit ? parseInt(String(req.query.limit)) : undefined,
          offset: req.query.offset ? parseInt(String(req.query.offset)) : undefined,
        };
        return this.templateService.listTemplates(filters);
      },
    });
  }

  /**
   * Get template categories
   * GET /api/templates/categories
   */
  async getCategories(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get categories',
      handler: async () => {
        const categories = await this.templateService.getCategories();
        return { categories };
      },
    });
  }

  /**
   * Get service statistics
   * GET /api/templates/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get stats',
      handler: async () => {
        const templateStats = await this.templateService.getStats();
        const cacheStats = this.cacheService.getStats();
        return {
          templates: templateStats,
          cache: cacheStats,
        };
      },
    });
  }
}
