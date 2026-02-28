/**
 * Guest Authentication Use Case
 * Provides limited-access guest tokens for anonymous exploration
 * Creates persistent guest user records to support onboarding
 *
 * Updated: Now grants 15 free credits (cost of 1 song) to enable guest song generation
 * and creates default profile to skip OnboardingProfileCompletion
 * Welcome books are now seeded globally by the seed system (welcome-books seed module)
 */

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { JWTService } from '@infrastructure/services';
import { IAuthRepository } from '@domains/auth';
import { ICreditRepository } from '@domains/credits';
import { CreatorMemberRepository } from '@infrastructure/repositories/CreatorMemberRepository';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { USER_ROLES, USER_STATUS, type UserRole } from '@aiponge/shared-contracts';
import { getLogger } from '@config/service-urls';
import { RefreshTokenUseCase } from './RefreshTokenUseCase';

const logger = getLogger('guest-auth-use-case');

const GUEST_FREE_CREDITS = 60;

const GUEST_DEFAULT_PROFILE = {};

const GUEST_DEFAULT_PREFERENCES = {
  vocalGender: 'f', // Default female vocal
  musicPreferences: '', // Empty by default - user sets their own style
  languagePreference: 'en', // English as default language
};

export interface GuestAuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  guestProfile?: {
    id: string;
    email: string;
    username: string;
    name: string;
    role: UserRole;
    isGuest: boolean;
    emailVerified: false;
    freeCredits: number;
  };
  error?: string;
}

export class GuestAuthUseCase {
  constructor(
    private jwtService: JWTService,
    private authRepository: IAuthRepository,
    private creditRepository?: ICreditRepository
  ) {}

  async execute(): Promise<GuestAuthResponse> {
    try {
      // Generate unique UUID for each guest session (ensures independent onboarding)
      const guestId = randomUUID();
      const guestEmail = `guest-${guestId.slice(0, 8)}@aiponge.com`;
      const guestUsername = `guest_${guestId.slice(0, 8)}`;
      const guestDisplayName = 'Guest User';

      // Generate a random secret and hash it for guest passwordHash
      // Guests never use password login (blocked in LoginUserUseCase), but we store
      // a valid bcrypt hash to maintain schema invariants and avoid future regressions
      const randomSecret = randomUUID();
      const passwordHash = await bcrypt.hash(randomSecret, 10);

      // Create guest user in database with profile that includes default profile data
      // Note: onboardingCompleted stays false as full onboarding hasn't run,
      // but default profile data enables song generation without profile completion form
      await this.authRepository.registerUserWithProfile({
        id: guestId,
        email: guestEmail,
        passwordHash, // Valid bcrypt hash (never used for login due to isGuest=true)
        role: USER_ROLES.USER,
        status: USER_STATUS.ACTIVE,
        profile: {
          firstName: '',
          lastName: '',
          displayName: guestDisplayName,
          onboardingCompleted: false, // Guest onboarding not complete - but song gen works with defaults
          ...GUEST_DEFAULT_PROFILE, // Include default profile data for song generation
        },
        preferences: GUEST_DEFAULT_PREFERENCES, // Set default music preferences for guest song generation
        emailVerified: false,
        isGuest: true,
      });

      logger.info('Guest user created in database with default profile', { guestId, guestEmail });

      // Grant 1 free credit for song generation trial
      // This is critical for the fast-path experience - fail the whole operation if credits can't be granted
      if (this.creditRepository) {
        await this.creditRepository.initializeCredits(guestId, GUEST_FREE_CREDITS);
        logger.info('Granted free credits to guest user', { guestId, credits: GUEST_FREE_CREDITS });
      } else {
        logger.warn('CreditRepository not available - guest will not have free credits', { guestId });
      }

      // Create creator-member self-relationship so guest can see their own books
      try {
        const creatorMemberRepo = new CreatorMemberRepository(getDatabase());
        await creatorMemberRepo.createSelfRelationship(guestId);
        logger.info('Self-relationship created for guest user', { guestId });

        const librariansFollowed = await creatorMemberRepo.autoFollowAllLibrarians(guestId);
        if (librariansFollowed > 0) {
          logger.info('Guest auto-followed librarians', { guestId, count: librariansFollowed });
        }
      } catch (relationshipError) {
        logger.error('Creator-member relationship creation failed for guest (non-blocking)', {
          guestId,
          error: relationshipError instanceof Error ? relationshipError.message : String(relationshipError),
        });
      }

      const token = this.jwtService.generateAccessToken({
        id: guestId,
        email: guestEmail,
        role: USER_ROLES.USER,
        roles: [USER_ROLES.USER],
        permissions: [],
        isGuest: true,
      });

      const refreshTokenUseCase = new RefreshTokenUseCase(this.authRepository, this.jwtService);
      const { refreshToken, sessionId } = await refreshTokenUseCase.createSession(guestId);

      logger.info('Guest session created with unique ID', { guestId });

      return {
        success: true,
        token,
        refreshToken,
        sessionId,
        guestProfile: {
          id: guestId,
          email: guestEmail,
          username: guestUsername,
          name: guestDisplayName,
          role: USER_ROLES.USER,
          isGuest: true,
          emailVerified: false,
          freeCredits: GUEST_FREE_CREDITS,
        },
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Guest auth failed', { error: errMsg });
      return {
        success: false,
        error: 'Guest authentication failed. Please try again.',
      };
    }
  }
}
