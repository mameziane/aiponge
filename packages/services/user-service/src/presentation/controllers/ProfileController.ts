/**
 * Profile Controller
 * Handles user profile operations
 */

import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { ProfileNameUpdateHelper } from '@application/services/ProfileNameUpdateHelper';
import { PROFILE_VISIBILITY } from '@aiponge/shared-contracts';
import { createControllerHelpers, serializeError } from '@aiponge/platform-core';
import { createDrizzleRepository, DatabaseConnectionFactory } from '@infrastructure/database/DatabaseConnectionFactory';
import { eq, sql } from 'drizzle-orm';
import { usrProfiles } from '@infrastructure/database/schemas/profile-schema';

const logger = getLogger('profile-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class ProfileController {
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const useCase = ServiceFactory.createGetUserProfileUseCase();
      const profileData = await useCase.execute({ userId });

      if (!profileData) {
        ServiceErrors.notFound(res, 'Profile', req);
        return;
      }

      const { AuthRepository } = await import('@infrastructure/repositories');
      const authRepo = createDrizzleRepository(AuthRepository);
      const user = await authRepo.findUserById(userId);

      let userPreferences: Record<string, unknown> = {};
      if (user?.preferences) {
        if (typeof user.preferences === 'string') {
          try {
            userPreferences = JSON.parse(user.preferences);
          } catch {
            userPreferences = {};
          }
        } else {
          userPreferences = user.preferences as Record<string, unknown>;
        }
      }

      let userProfile: Record<string, unknown> = {};
      if (user?.profile) {
        if (typeof user.profile === 'string') {
          try {
            userProfile = JSON.parse(user.profile);
          } catch {
            userProfile = {};
          }
        } else {
          userProfile = user.profile as Record<string, unknown>;
        }
      }

      const transformedData = {
        id: profileData.userId,
        email: user?.email || `user-${profileData.userId}@aiponge.app`,
        profile: {
          name: userProfile.name || userProfile.displayName || profileData.basicProfile?.displayName,
          displayName: userProfile.displayName || profileData.basicProfile?.displayName,
          birthdate: userProfile.birthdate,
          bio: userProfile.bio || profileData.basicProfile?.bio,
          avatar: userProfile.avatar || profileData.basicProfile?.avatar,
        },
        preferences: {
          notifications:
            userPreferences.notifications ?? profileData.basicProfile?.contactPreferences?.marketingEmails ?? false,
          visibility:
            userPreferences.visibility ||
            profileData.basicProfile?.visibilitySettings?.profileVisibility ||
            PROFILE_VISIBILITY.PUBLIC,
          theme: userPreferences.theme || 'auto',
          musicPreferences: userPreferences.musicPreferences,
          musicGenre: userPreferences.musicGenre,
          wellnessIntention: userPreferences.wellnessIntention,
          musicInstruments: userPreferences.musicInstruments,
          languagePreference: userPreferences.languagePreference,
          languagePreferences: userPreferences.languagePreferences,
          currentMood: userPreferences.currentMood,
          vocalGender: userPreferences.vocalGender,
          styleWeight: userPreferences.styleWeight,
          negativeTags: userPreferences.negativeTags,
        },
        stats: {
          totalEntries: profileData.analytics?.totalEntries || 0,
          totalInsights: profileData.analytics?.totalInsights || 0,
          totalReflections: profileData.analytics?.totalReflections || 0,
        },
      };

      sendSuccess(res, transformedData);
    } catch (error) {
      logger.error('Get profile error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get profile', req);
      return;
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update profile',
      handler: async () => {
        const userId = req.params.userId as string;
        const { name, birthdate, displayName, avatar, ...otherFields } = req.body;

        if (name || birthdate || displayName || avatar) {
          const { AuthRepository } = await import('../../infrastructure/repositories/AuthRepository');
          const authRepo = createDrizzleRepository(AuthRepository);
          const user = await authRepo.findUserById(userId);

          if (user) {
            let existingProfile: Record<string, string | undefined> & Record<string, unknown> = {};
            try {
              existingProfile = typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile || {};
            } catch {
              existingProfile = {};
            }

            const updatedProfile = {
              ...existingProfile,
              ...(name && { name, displayName: name }),
              ...(displayName && { displayName }),
              ...(birthdate && { birthdate }),
              ...(avatar && { avatar }),
            };

            await authRepo.updateUser(userId, { profile: updatedProfile });
            logger.info('User profile JSON updated', {
              userId,
              fields: { name, birthdate, displayName, avatar: avatar ? '[set]' : undefined },
            });

            const newDisplayName = displayName || name;
            if (newDisplayName) {
              await ProfileNameUpdateHelper.updateAndSync({
                userId,
                displayName: newDisplayName,
                currentDisplayName: existingProfile.displayName,
              });
            }
          }
        }

        if (Object.keys(otherFields).length > 0) {
          const useCase = ServiceFactory.createUpdateProfileUseCase();
          const result = await useCase.execute({ userId, ...otherFields });

          if (!result.success) {
            logger.warn('Profile table update had issues', { userId, error: result.error });
          }
        }

        logger.info('Profile updated successfully', { userId });

        return { name, birthdate, displayName, avatar, ...otherFields };
      },
    });
  }

  async getFullProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get full profile',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createGetUserProfileUseCase();
        return useCase.execute({ userId });
      },
    });
  }

  async updateFullProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update full profile',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createUpdateUserProfileUseCase();
        return useCase.execute({ userId, ...req.body });
      },
    });
  }

  async getProfileSummary(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get profile summary',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createGetUserProfileSummaryUseCase();
        return useCase.execute({
          userId,
          scope: {
            includeBasicMetrics: true,
            includeEntryAnalysis: true,
            includeInsightSummary: true,
            includePatternAnalysis: true,
            includeGrowthMetrics: true,
            includePersonalityInsights: true,
            includeWellnessOverview: true,
            includePredictions: true,
            summaryDepth: 'standard',
          },
        });
      },
    });
  }

  async exportProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to export profile',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createExportUserProfileUseCase();
        return useCase.execute({
          userId,
          format: {
            type: 'json',
          },
          scope: {
            includeBasicProfile: true,
            includeEntries: true,
            includeInsights: true,
            includePatterns: true,
            includeAnalytics: true,
            includePersona: true,
            includeWellnessData: true,
          },
        });
      },
    });
  }

  async importProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to import profile',
      successStatus: 201,
      handler: async () => {
        const useCase = ServiceFactory.createImportUserProfileUseCase();
        return useCase.execute(req.body);
      },
    });
  }
}
