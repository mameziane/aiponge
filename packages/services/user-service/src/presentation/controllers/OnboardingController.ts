/**
 * Onboarding Controller
 * Handles user onboarding initialization and status
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { InitializeUserOnboardingUseCase } from '@application/use-cases/onboarding/InitializeUserOnboardingUseCase';
import { BookRepository, ChapterRepository } from '@infrastructure/repositories';
import { BOOK_TYPE_IDS, CONTENT_VISIBILITY } from '@infrastructure/database/schemas/library-schema';
import { getDatabase, createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { CONTENT_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('onboarding-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class OnboardingController {
  private bookRepository: BookRepository | null = null;

  constructor(private readonly initializeUserOnboardingUseCase: InitializeUserOnboardingUseCase) {}

  private async getBookRepository(): Promise<BookRepository> {
    if (!this.bookRepository) {
      this.bookRepository = createDrizzleRepository(BookRepository);
    }
    return this.bookRepository;
  }

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
        const { preferences, book } = req.body;

        logger.info('Completing onboarding for user', {
          userId: authenticatedUserId,
          bookTitle: book?.title,
          preferences,
        });

        // Pre-load imports once (cached on subsequent calls)
        const [{ usrProfiles }, { users }, { eq }] = await Promise.all([
          import('../../infrastructure/database/schemas/profile-schema'),
          import('../../infrastructure/database/schemas/user-schema'),
          import('drizzle-orm'),
        ]);

        const db = getDatabase();

        // Build validated preferences in-memory (no DB needed)
        const validVocalGenders = ['f', 'm'];
        const validLanguages = ['auto', 'en', 'es', 'fr', 'de', 'pt', 'ar', 'ja'];
        const validWellnessIntentions = [
          'stress_relief',
          'self_discovery',
          'motivation',
          'sleep',
          'focus',
          'emotional_healing',
          'creative_expression',
          'mindfulness',
        ];

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
          if (preferences.wellnessIntention && validWellnessIntentions.includes(preferences.wellnessIntention)) {
            validatedPrefs.wellnessIntention = preferences.wellnessIntention;
          }
        }

        // Run profile/prefs update and book creation CONCURRENTLY (independent tasks)
        await Promise.all([
          // Task A: mark onboarding done + save preferences
          (async () => {
            // Fetch existing prefs and mark profile in parallel
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
          })(),

          // Task B: create default book + chapter (non-fatal, runs concurrently with Task A)
          book?.title
            ? (async () => {
                try {
                  const bookRepo = await this.getBookRepository();
                  const existingDefault = await bookRepo.getBySystemType(authenticatedUserId, 'default');
                  if (!existingDefault) {
                    const createdBook = await bookRepo.create({
                      typeId: BOOK_TYPE_IDS.PERSONAL,
                      userId: authenticatedUserId,
                      title: book.title,
                      description: book.description || 'Your personal book for writing and reflection',
                      systemType: 'default',
                      visibility: CONTENT_VISIBILITY.PERSONAL,
                      status: CONTENT_LIFECYCLE.ACTIVE,
                    });
                    logger.info('Created default personal book during onboarding', {
                      userId: authenticatedUserId,
                      bookId: createdBook.id,
                      title: book.title,
                    });

                    const chapterRepo = createDrizzleRepository(ChapterRepository);
                    await chapterRepo.create({
                      bookId: createdBook.id,
                      userId: authenticatedUserId,
                      title: 'My Entries',
                      description: 'Your personal entries',
                      sortOrder: 0,
                    });
                    logger.info('Default chapter created for onboarding book', {
                      userId: authenticatedUserId,
                      bookId: createdBook.id,
                    });
                  }
                } catch (bookError) {
                  logger.warn('Failed to create book during onboarding (non-fatal)', {
                    error: serializeError(bookError),
                  });
                }
              })()
            : Promise.resolve(),
        ]);

        return {
          message: 'Onboarding completed',
          userId: authenticatedUserId,
        };
      },
    });
  }
}
