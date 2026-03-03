/**
 * Onboarding Controller
 * Handles user onboarding initialization and status
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { InitializeUserOnboardingUseCase } from '@application/use-cases/onboarding/InitializeUserOnboardingUseCase';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('onboarding-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class OnboardingController {
  constructor(private readonly initializeUserOnboardingUseCase: InitializeUserOnboardingUseCase) {}

  async getOnboardingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId: authenticatedUserId } = extractAuthContext(req);

      if (!authenticatedUserId) {
        ServiceErrors.unauthorized(res, 'Unauthorized. Authentication required.', req);
        return;
      }

      const { getDatabase } = await import('@infrastructure/database/DatabaseConnectionFactory');
      const { usrProfiles } = await import('@infrastructure/database/schemas/profile-schema');
      const { eq } = await import('drizzle-orm');

      const db = getDatabase();
      const [profile] = await db
        .select({ onboardingInitialized: usrProfiles.onboardingInitialized })
        .from(usrProfiles)
        .where(eq(usrProfiles.userId, authenticatedUserId));

      if (!profile) {
        ServiceErrors.notFound(res, 'Profile', req);
        return;
      }

      sendSuccess(res, {
        onboardingCompleted: profile.onboardingInitialized || false,
        userId: authenticatedUserId,
      });
    } catch (error: unknown) {
      logger.error('Get onboarding status error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get onboarding status', req);
      return;
    }
  }

  async initializeUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId: authenticatedUserId } = extractAuthContext(req);

      if (!authenticatedUserId) {
        ServiceErrors.unauthorized(res, 'Unauthorized. Authentication required.', req);
        return;
      }

      const result = await this.initializeUserOnboardingUseCase.execute({
        userId: authenticatedUserId,
      });

      sendCreated(res, result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('already been initialized') || errorMessage.includes('duplicate')) {
        ServiceErrors.conflict(res, 'User onboarding has already been initialized.', req);
        return;
      }

      logger.error('Initialize user onboarding error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to initialize user onboarding', req);
      return;
    }
  }

  async completeOnboarding(req: Request, res: Response): Promise<void> {
    const { userId: authenticatedUserId } = extractAuthContext(req);

    if (!authenticatedUserId) {
      ServiceErrors.unauthorized(res, 'Unauthorized. Authentication required.', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to complete onboarding',
      handler: async () => {
        const { preferences } = req.body;

        logger.info('Completing onboarding for user', {
          userId: authenticatedUserId,
          preferences,
        });

        const [{ usrProfiles }, { users }, { eq }] = await Promise.all([
          import('../../infrastructure/database/schemas/profile-schema'),
          import('../../infrastructure/database/schemas/user-schema'),
          import('drizzle-orm'),
        ]);

        const db = getDatabase();

        const validVocalGenders = ['f', 'm'];
        const validLanguages = ['auto', 'en', 'es', 'fr', 'de', 'pt', 'ar', 'ja'];

        const validatedPrefs: Record<string, string> = {};
        if (preferences && typeof preferences === 'object') {
          if (preferences.vocalGender && validVocalGenders.includes(preferences.vocalGender)) {
            validatedPrefs.vocalGender = preferences.vocalGender;
          }
          if (preferences.languagePreference && validLanguages.includes(preferences.languagePreference)) {
            validatedPrefs.languagePreference = preferences.languagePreference;
          }
          if (preferences.musicPreferences && typeof preferences.musicPreferences === 'string') {
            const sanitized = preferences.musicPreferences.trim().slice(0, 500);
            if (sanitized.length > 0) validatedPrefs.musicPreferences = sanitized;
          }
          if (preferences.genre && typeof preferences.genre === 'string') {
            const sanitizedGenre = preferences.genre.trim().slice(0, 100);
            if (sanitizedGenre.length > 0) validatedPrefs.musicGenre = sanitizedGenre;
          }
        }

        // Mark onboarding done + save preferences
        const [, [existingUser]] = await Promise.all([
          db
            .update(usrProfiles)
            .set({ onboardingInitialized: true, lastUpdated: new Date() })
            .where(eq(usrProfiles.userId, authenticatedUserId)),
          Object.keys(validatedPrefs).length > 0
            ? db.select({ preferences: users.preferences }).from(users).where(eq(users.id, authenticatedUserId))
            : Promise.resolve([] as { preferences: unknown }[]),
        ]);

        if (Object.keys(validatedPrefs).length > 0) {
          let existingPrefs: Record<string, unknown> = {};
          try {
            existingPrefs = existingUser?.preferences
              ? typeof existingUser.preferences === 'string'
                ? JSON.parse(existingUser.preferences as string)
                : (existingUser.preferences as Record<string, unknown>)
              : {};
          } catch {
            logger.warn('Failed to parse existing preferences, using empty object', {
              userId: authenticatedUserId,
            });
          }

          const mergedPreferences = { ...existingPrefs, ...validatedPrefs };
          await db.update(users).set({ preferences: mergedPreferences }).where(eq(users.id, authenticatedUserId));
          logger.info('Saved user preferences during onboarding', {
            userId: authenticatedUserId,
            savedPreferences: mergedPreferences,
          });
        }

        return {
          message: 'Onboarding completed',
          userId: authenticatedUserId,
        };
      },
    });
  }
}
