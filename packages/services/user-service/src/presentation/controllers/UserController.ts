/**
 * User Controller
 * Handles general user management operations
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { CreateUserUseCase } from '@application/use-cases/user/CreateUserUseCase';
import { GetUserProfileUseCase } from '@application/use-cases/profile/GetUserProfileUseCase';
import { UpdateUserUseCase, UpdateUserSettingsUseCase } from '@application/use-cases/user/UpdateUserUseCase';
import { DeleteUserDataUseCase } from '@application/use-cases/user/DeleteUserDataUseCase';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { normalizeRole } from '@aiponge/shared-contracts';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('user-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly getUserProfileUseCase: GetUserProfileUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserDataUseCase: DeleteUserDataUseCase,
    private readonly updateUserSettingsUseCase: UpdateUserSettingsUseCase
  ) {}

  async createUser(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create user',
      successStatus: 201,
      handler: async () => this.createUserUseCase.execute(req.body),
    });
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { AuthRepository } = await import('@infrastructure/repositories');
      const authRepo = createDrizzleRepository(AuthRepository);
      const user = await authRepo.findUserById(id);

      if (!user) {
        ServiceErrors.notFound(res, 'User', req);
        return;
      }

      const rawPreferences =
        typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences || {};

      const preferences = {
        ...rawPreferences,
        languagePreference: rawPreferences.languagePreference || rawPreferences.contentLanguage || 'English',
      };

      const { getDatabase } = await import('@infrastructure/database/DatabaseConnectionFactory');
      const { usrInsights, usrReflections } = await import('@infrastructure/database/schemas/profile-schema');
      const { libBooks, libEntries } = await import('@infrastructure/database/schemas/library-schema');
      const { eq, count, inArray } = await import('drizzle-orm');

      const db = getDatabase();

      const userBooks = await db.select({ id: libBooks.id }).from(libBooks).where(eq(libBooks.userId, id));
      const bookIds = userBooks.map(b => b.id);

      const [entriesCount, insightsCount, reflectionsCount] = await Promise.all([
        bookIds.length > 0
          ? db.select({ count: count() }).from(libEntries).where(inArray(libEntries.bookId, bookIds))
          : Promise.resolve([{ count: 0 }]),
        db.select({ count: count() }).from(usrInsights).where(eq(usrInsights.userId, id)),
        db.select({ count: count() }).from(usrReflections).where(eq(usrReflections.userId, id)),
      ]);

      sendSuccess(res, {
        id: user.id,
        email: user.email,
        preferences,
        stats: {
          totalEntries: entriesCount[0]?.count || 0,
          totalInsights: insightsCount[0]?.count || 0,
          totalReflections: reflectionsCount[0]?.count || 0,
        },
      });
    } catch (error) {
      logger.error('Get user error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get user', req);
      return;
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update user',
      handler: async () => {
        const { id } = req.params;
        return this.updateUserUseCase.execute({ userId: id, ...req.body });
      },
    });
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to delete user',
      handler: async () => {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { role } = extractAuthContext(req);
        return this.deleteUserDataUseCase.execute({
          userId: id,
          requestingUserId: req.body.requestingUserId || id,
          requestingUserRole: normalizeRole(role),
        });
      },
    });
  }

  async updateUserPreferences(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      logger.info('⏱️ [updateUserPreferences] START', {
        userId: id,
        elapsed: 0,
        startTime,
      });

      logger.info('🎵 [updateUserPreferences] Request received', {
        userId: id,
        bodyKeys: Object.keys(req.body || {}),
      });

      const { preferences } = req.body;
      const settingsPayload = preferences && typeof preferences === 'object' ? preferences : req.body;

      if (!settingsPayload || typeof settingsPayload !== 'object' || Object.keys(settingsPayload).length === 0) {
        logger.warn('🎵 [updateUserPreferences] Invalid or empty preferences', {
          settingsPayload,
          hadNestedPreferences: !!preferences,
        });
        ServiceErrors.badRequest(res, 'Preferences must be a valid non-empty object', req);
        return;
      }

      logger.info('🎵 [updateUserPreferences] Resolved settings payload', {
        userId: id,
        settingsPayload,
        settingsKeys: Object.keys(settingsPayload),
        wasNested: !!preferences,
        elapsed: Date.now() - startTime,
      });

      logger.info('⏱️ [updateUserPreferences] Before use case', {
        settingsPayload,
        elapsed: Date.now() - startTime,
      });
      const result = await this.updateUserSettingsUseCase.execute(id, settingsPayload);
      logger.info('⏱️ [updateUserPreferences] After use case', { elapsed: Date.now() - startTime });

      logger.info('🎵 [updateUserPreferences] Result from use case', {
        success: result.success,
        hasUser: !!result.user,
        hasPreferences: !!result.user?.preferences,
        savedPreferences: result.user?.preferences,
        error: result.error,
        elapsed: Date.now() - startTime,
      });

      logger.info('⏱️ [updateUserPreferences] Before sending response', { elapsed: Date.now() - startTime });

      if (result.success && result.user) {
        const responsePayload = {
          success: true,
          data: {
            preferences: result.user.preferences,
          },
          timestamp: new Date().toISOString(),
        };

        logger.info('🎵 [updateUserPreferences] Sending SUCCESS response', {
          responsePayload,
          elapsed: Date.now() - startTime,
        });

        sendSuccess(res, { preferences: result.user.preferences });
      } else {
        const errorMessage = result.error || 'Failed to update preferences';
        logger.error('🎵 [updateUserPreferences] Sending FAILURE response', {
          error: errorMessage,
          resultSuccess: result.success,
          hasUser: !!result.user,
          elapsed: Date.now() - startTime,
        });

        ServiceErrors.badRequest(res, errorMessage, req);
      }

      logger.info('⏱️ [updateUserPreferences] COMPLETE', { elapsed: Date.now() - startTime });
    } catch (error) {
      logger.error('Update user preferences error - EXCEPTION', {
        error: serializeError(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        elapsed: Date.now() - startTime,
      });
      ServiceErrors.fromException(res, error, 'Failed to update user preferences', req);
      return;
    }
  }
}
