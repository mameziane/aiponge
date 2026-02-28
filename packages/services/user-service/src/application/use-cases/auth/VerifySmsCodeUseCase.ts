/**
 * Verify SMS Code Use Case
 * Validates SMS verification code
 */

import { IAuthRepository } from '@domains/auth';
import { getLogger } from '@config/service-urls';

const logger = getLogger('verify-sms-code-use-case');

export interface VerifySmsCodeRequest {
  phoneE164: string;
  code: string;
  purpose: 'registration' | 'login' | 'phone_change';
}

export interface VerifySmsCodeResponse {
  success: boolean;
  verified: boolean;
  message?: string;
  error?: string;
  userId?: string;
}

const MAX_ATTEMPTS = 3;

export class VerifySmsCodeUseCase {
  constructor(private authRepo: IAuthRepository) {}

  async execute(request: VerifySmsCodeRequest): Promise<VerifySmsCodeResponse> {
    try {
      const { phoneE164, code, purpose } = request;

      // Validate input
      if (!phoneE164 || !code || code.length !== 6) {
        return { success: false, verified: false, error: 'Invalid verification code' };
      }

      // Find latest verification code for this phone and purpose
      const verificationCode = await this.authRepo.findLatestSmsCode(phoneE164, purpose);

      if (!verificationCode) {
        return { success: false, verified: false, error: 'No verification code found. Please request a new one.' };
      }

      // Check if already verified
      if (verificationCode.verifiedAt) {
        return { success: false, verified: false, error: 'This code has already been used' };
      }

      // Check if expired
      if (verificationCode.expiresAt < new Date()) {
        return { success: false, verified: false, error: 'Verification code expired. Please request a new one.' };
      }

      // Check max attempts
      if (verificationCode.attemptCount >= MAX_ATTEMPTS) {
        return {
          success: false,
          verified: false,
          error: 'Maximum verification attempts exceeded. Please request a new code.',
        };
      }

      // Verify code
      if (verificationCode.code !== code) {
        // Increment attempt count
        await this.authRepo.updateSmsVerificationCode(verificationCode.id, {
          attemptCount: verificationCode.attemptCount + 1,
        });

        const attemptsRemaining = MAX_ATTEMPTS - verificationCode.attemptCount - 1;
        return {
          success: false,
          verified: false,
          error: `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining.`,
        };
      }

      // Mark code as verified
      await this.authRepo.updateSmsVerificationCode(verificationCode.id, {
        verifiedAt: new Date(),
        attemptCount: verificationCode.attemptCount + 1,
      });

      // CRITICAL: Update user's phone verification status
      // If userId exists (phone change for existing user), update that user
      // Otherwise, we'll need to update the user after registration
      if (verificationCode.userId) {
        await this.authRepo.updateUser(verificationCode.userId, {
          phoneE164,
          phoneVerified: true,
          phoneNumber: phoneE164, // Store normalized version
          preferredAuthChannel: purpose === 'phone_change' ? 'phone' : undefined,
        });

        logger.info('User phone verified and updated', {
          userId: verificationCode.userId,
          phoneE164,
          purpose,
        });
      } else {
        // For pre-registration verification, just mark the code as verified
        // The registration process will handle setting phoneVerified
        logger.info('SMS code verified (pre-registration)', {
          phoneE164,
          purpose,
        });
      }

      return {
        success: true,
        verified: true,
        message: 'Phone number verified successfully',
        userId: verificationCode.userId || undefined,
      };
    } catch (error) {
      logger.error('Failed to verify SMS code', { error });
      return { success: false, verified: false, error: 'Verification failed' };
    }
  }
}
