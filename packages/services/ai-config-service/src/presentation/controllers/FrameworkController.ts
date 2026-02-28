/**
 * Framework Controller - HTTP request handlers for psychological frameworks
 * Uses controller-helpers wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { DrizzleFrameworkRepository } from '../../infrastructure/frameworks/repositories/DrizzleFrameworkRepository';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import { FrameworkCategory } from '../../domains/frameworks/domain/entities/PsychologicalFramework';
import { createControllerHelpers, errorMessage } from '@aiponge/platform-core';
import { ServiceErrors } from '../utils/response-helpers';

const logger = getLogger('framework-controller');

const frameworkErrorHandler = (res: Response, error: unknown, message: string, req?: Request) => {
  logger.error(message, { error: errorMessage(error) });
  ServiceErrors.internal(res, message, error, req);
};

const { executeSimple } = createControllerHelpers('ai-config-service', frameworkErrorHandler);

export class FrameworkController {
  private static repository: DrizzleFrameworkRepository | null = null;

  private static getRepository(): DrizzleFrameworkRepository {
    if (!this.repository) {
      const db = getDatabase();
      this.repository = new DrizzleFrameworkRepository(db);
    }
    return this.repository;
  }

  static async getAllFrameworks(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to retrieve psychological frameworks',
      execute: async () => {
        const repository = FrameworkController.getRepository();
        const { category, enabled } = req.query;

        const filter: { category?: FrameworkCategory; isEnabled?: boolean } = {};
        if (category && typeof category === 'string') {
          filter.category = category as FrameworkCategory;
        }
        if (enabled !== undefined) {
          filter.isEnabled = enabled === 'true';
        }

        const frameworks = await repository.findAll(filter);

        return {
          success: true,
          data: frameworks,
          count: frameworks.length,
        };
      },
      skipSuccessCheck: true,
    });
  }

  static async getEnabledFrameworks(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to retrieve enabled frameworks',
      execute: async () => {
        const repository = FrameworkController.getRepository();
        const frameworks = await repository.findEnabled();

        return {
          success: true,
          data: frameworks,
          count: frameworks.length,
        };
      },
      skipSuccessCheck: true,
    });
  }

  static async getFrameworkById(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to retrieve framework',
      errorStatus: 404,
      execute: async () => {
        const repository = FrameworkController.getRepository();
        const id = req.params.id as string;

        const framework = await repository.findById(id);

        if (!framework) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Framework not found' } };
        }

        return {
          success: true,
          data: framework,
        };
      },
    });
  }

  static async getFrameworksByCategory(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to retrieve frameworks by category',
      execute: async () => {
        const repository = FrameworkController.getRepository();
        const category = req.params.category as string;

        const frameworks = await repository.findByCategory(category);

        return {
          success: true,
          data: frameworks,
          count: frameworks.length,
        };
      },
      skipSuccessCheck: true,
    });
  }
}
