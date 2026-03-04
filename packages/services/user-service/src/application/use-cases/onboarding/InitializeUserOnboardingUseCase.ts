/**
 * Initialize User Onboarding Use Case
 * Marks user onboarding as initialized without preference collection
 *
 * Simplified: No longer creates life-area-based chapters/playlists
 * Users create their own books and chapters organically
 */

import { getLogger } from '@config/service-urls';
import type { IIntelligenceRepository } from '@domains/intelligence';
import type { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { ProfileError } from '@application/errors';

const logger = getLogger('initialize-user-onboarding-use-case');

export interface InitializeUserOnboardingRequest {
  userId: string;
}

export interface InitializeUserOnboardingResponse {
  success: boolean;
  message?: string;
}

export class InitializeUserOnboardingUseCase {
  constructor(
    private readonly intelligenceRepository: IIntelligenceRepository,
    private readonly db: DatabaseConnection
  ) {}

  async execute(request: InitializeUserOnboardingRequest): Promise<InitializeUserOnboardingResponse> {
    const { userId } = request;

    logger.info('Initializing user onboarding', { userId });

    const { usrProfiles } = await import('../../../infrastructure/database/schemas/profile-schema');
    const { eq, and } = await import('drizzle-orm');

    // Atomic conditional update — no read-then-write race possible.
    // Only sets onboardingInitialized if it was previously false.
    const updated = await this.db
      .update(usrProfiles)
      .set({ onboardingInitialized: true })
      .where(and(eq(usrProfiles.userId, userId), eq(usrProfiles.onboardingInitialized, false)))
      .returning({ userId: usrProfiles.userId });

    if (updated.length > 0) {
      logger.info('User onboarding initialized successfully', { userId });
      return { success: true, message: 'Onboarding completed' };
    }

    // No rows updated — either already initialized or profile doesn't exist
    const [profile] = await this.db
      .select({ onboardingInitialized: usrProfiles.onboardingInitialized })
      .from(usrProfiles)
      .where(eq(usrProfiles.userId, userId));

    if (!profile) {
      throw ProfileError.notFound('Profile', userId);
    }

    logger.info('User onboarding already initialized - returning success (idempotent)', { userId });
    return { success: true, message: 'Onboarding already completed' };
  }
}
