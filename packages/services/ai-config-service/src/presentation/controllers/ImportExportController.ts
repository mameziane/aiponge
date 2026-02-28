/**
 * Import/Export Controller
 * REST API endpoints for bulk template operations
 * Uses handleRequest wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { TemplateService } from '../../domains/templates/application/services/TemplateService';
import { CacheService } from '../../domains/templates/application/services/CacheService';
import {
  ImportTemplatesRequest,
  ExportTemplatesRequest,
  TemplateValidationError,
} from '../../domains/templates/application/types';
import { ServiceErrors, sendSuccess } from '../utils/response-helpers';
import { createControllerHelpers } from '@aiponge/platform-core';

const { handleRequest } = createControllerHelpers('ai-config-service', (res, error, message, req) => {
  if (error instanceof TemplateValidationError) {
    ServiceErrors.badRequest(res, error.message, req, { validationErrors: error.validationErrors });
  } else {
    ServiceErrors.fromException(res, error, message, req);
  }
});

export class ImportExportController {
  constructor(
    private templateService: TemplateService,
    private cacheService: CacheService
  ) {}

  /**
   * Import templates from JSON/YAML
   * POST /api/import
   */
  async importTemplates(req: Request, res: Response): Promise<void> {
    const importRequest: ImportTemplatesRequest = {
      templates: req.body.templates || [],
      options: req.body.options || {},
    };

    if (!Array.isArray(importRequest.templates) || importRequest.templates.length === 0) {
      ServiceErrors.badRequest(res, 'Templates array is required and must not be empty', req);
      return;
    }

    for (let i = 0; i < importRequest.templates.length; i++) {
      const template = importRequest.templates[i];
      if (!template.name || !template.category || !template.content || !template.createdBy) {
        ServiceErrors.badRequest(
          res,
          `Template at index ${i} is missing required fields (name, category, content, createdBy)`,
          req
        );
        return;
      }
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Import templates failed',
      handler: async () => {
        const result = await this.templateService.importTemplates(importRequest);
        this.cacheService.clearAll();
        return result;
      },
    });
  }

  /**
   * Export templates as JSON/YAML
   * POST /api/export
   */
  async exportTemplates(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Export templates failed',
      handler: async () => {
        const exportRequest: ExportTemplatesRequest = {
          templateIds: req.body.templateIds,
          filters: req.body.filters,
          format: req.body.format || 'json',
        };
        return this.templateService.exportTemplates(exportRequest);
      },
    });
  }

  /**
   * Export all templates
   * GET /api/export/all
   * Note: Kept with manual try-catch due to custom Content-Type/download handling
   */
  async exportAllTemplates(req: Request, res: Response): Promise<void> {
    try {
      const format = (req.query.format as string) || 'json';

      const exportRequest: ExportTemplatesRequest = {
        format: format as 'json' | 'yaml',
      };

      const result = await this.templateService.exportTemplates(exportRequest);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=templates.json');
      } else if (format === 'yaml') {
        res.setHeader('Content-Type', 'application/yaml');
        res.setHeader('Content-Disposition', 'attachment; filename=templates.yaml');
      }

      const downloadData = req.query.download === 'true';
      if (downloadData) {
        if (format === 'json') {
          sendSuccess(res, result.data);
        } else {
          res.send(JSON.stringify(result.data, null, 2));
        }
      } else {
        sendSuccess(res, result);
      }
    } catch (error) {
      if (error instanceof TemplateValidationError) {
        ServiceErrors.badRequest(res, error.message, req, { validationErrors: error.validationErrors });
      } else {
        ServiceErrors.fromException(res, error, 'Export all templates failed', req);
      }
    }
  }

  /**
   * Bulk delete templates
   * POST /api/bulk-delete
   * Note: Kept with manual try-catch due to partial-failure semantics
   */
  async bulkDeleteTemplates(req: Request, res: Response): Promise<void> {
    try {
      const templateIds: string[] = req.body.templateIds || [];

      if (!Array.isArray(templateIds) || templateIds.length === 0) {
        ServiceErrors.badRequest(res, 'Template IDs array is required and must not be empty', req);
        return;
      }

      let deletedCount = 0;
      const errors: string[] = [];

      for (const templateId of templateIds) {
        try {
          const deleted = await this.templateService.deleteTemplate(templateId);
          if (deleted) {
            deletedCount++;
            this.cacheService.invalidateTemplate(templateId);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${templateId}: ${errorMessage}`);
        }
      }

      if (errors.length === 0) {
        sendSuccess(res, {
          total: templateIds.length,
          deleted: deletedCount,
          failed: 0,
          errors: [],
        });
      } else {
        ServiceErrors.badRequest(res, `Failed to delete ${errors.length} of ${templateIds.length} templates`, req, {
          total: templateIds.length,
          deleted: deletedCount,
          failed: errors.length,
          errors,
        });
      }
    } catch (error) {
      if (error instanceof TemplateValidationError) {
        ServiceErrors.badRequest(res, error.message, req, { validationErrors: error.validationErrors });
      } else {
        ServiceErrors.fromException(res, error, 'Bulk delete templates failed', req);
      }
    }
  }

  /**
   * Upload templates from file
   * POST /api/upload
   */
  async uploadTemplates(req: Request, res: Response): Promise<void> {
    if (!req.body.fileContent) {
      ServiceErrors.badRequest(res, 'File content is required', req);
      return;
    }

    let templates;
    try {
      const parsedContent =
        typeof req.body.fileContent === 'string' ? JSON.parse(req.body.fileContent) : req.body.fileContent;
      templates = parsedContent.templates || parsedContent;
      if (!Array.isArray(templates)) {
        templates = [templates];
      }
    } catch (parseError) {
      ServiceErrors.badRequest(res, 'Invalid JSON format in uploaded file', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Upload templates failed',
      handler: async () => {
        const importRequest: ImportTemplatesRequest = {
          templates,
          options: req.body.options || { skipInvalid: true },
        };
        const result = await this.templateService.importTemplates(importRequest);
        this.cacheService.clearAll();
        return result;
      },
    });
  }
}
