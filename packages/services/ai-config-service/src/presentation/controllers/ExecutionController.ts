/**
 * Execution Controller
 * REST API endpoints for template execution
 * Uses handleRequest wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { ExecutionService } from '../../domains/templates/application/services/ExecutionService';
import { CacheService } from '../../domains/templates/application/services/CacheService';
import {
  ExecuteTemplateRequest,
  BatchExecuteRequest,
  TemplateExecutionError,
  TemplateNotFoundError,
} from '../../domains/templates/application/types';
import { ServiceErrors } from '../utils/response-helpers';
import { createControllerHelpers } from '@aiponge/platform-core';

const { handleRequest } = createControllerHelpers('ai-config-service', (res, error, message, req) => {
  if (error instanceof TemplateNotFoundError) {
    ServiceErrors.notFound(res, error.message, req);
  } else if (error instanceof TemplateExecutionError) {
    ServiceErrors.badRequest(res, error.message, req, { templateId: error.templateId });
  } else {
    ServiceErrors.fromException(res, error, message, req);
  }
});

export class ExecutionController {
  constructor(
    private executionService: ExecutionService,
    private cacheService: CacheService
  ) {}

  /**
   * Execute a single template
   * POST /api/execute
   */
  async executeTemplate(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Template execution failed',
      handler: async () => {
        const executeRequest: ExecuteTemplateRequest = {
          templateId: req.body.templateId,
          variables: req.body.variables || {},
          options: req.body.options,
        };

        const enableCache = req.body.enableCache !== false;
        let result;

        if (enableCache) {
          const cacheKey = this.cacheService.generateExecutionKey(executeRequest.templateId, executeRequest.variables);
          result = this.cacheService.getExecution(cacheKey);

          if (!result) {
            result = await this.executionService.executeTemplate(executeRequest);
            this.cacheService.cacheExecution(cacheKey, result);
          }
        } else {
          result = await this.executionService.executeTemplate(executeRequest);
        }

        return result;
      },
    });
  }

  /**
   * Execute multiple templates in batch
   * POST /api/batch-execute
   */
  async batchExecute(req: Request, res: Response): Promise<void> {
    const batchRequest: BatchExecuteRequest = {
      executions: req.body.executions || [],
      options: req.body.options,
    };

    if (!Array.isArray(batchRequest.executions) || batchRequest.executions.length === 0) {
      ServiceErrors.badRequest(res, 'Executions array is required and must not be empty', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Batch execution failed',
      handler: async () => this.executionService.batchExecute(batchRequest),
    });
  }

  /**
   * Preview template execution without actually executing
   * POST /api/preview
   */
  async previewTemplate(req: Request, res: Response): Promise<void> {
    const templateId = req.body.templateId;

    if (!templateId) {
      ServiceErrors.badRequest(res, 'Template ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Template preview failed',
      handler: async () => this.executionService.previewTemplate(templateId, req.body.variables || {}),
    });
  }

  /**
   * Clear execution cache
   * POST /api/cache/clear
   */
  async clearCache(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to clear cache',
      handler: async () => {
        const templateId = req.body.templateId;
        if (templateId) {
          this.cacheService.invalidateTemplate(templateId);
        } else {
          this.cacheService.clearAll();
        }
        return { message: templateId ? `Cache cleared for template ${templateId}` : 'All cache cleared' };
      },
    });
  }

  /**
   * Get cache statistics
   * GET /api/cache/stats
   */
  async getCacheStats(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get cache stats',
      handler: async () => this.cacheService.getStats(),
    });
  }
}
