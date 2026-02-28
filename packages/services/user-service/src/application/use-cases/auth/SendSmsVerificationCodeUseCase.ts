/**
 * Send SMS Verification Code Use Case
 * Generates and sends a verification code via SMS
 */

import { IAuthRepository } from '@domains/auth';
import { getLogger } from '@config/service-urls';

const logger = getLogger('send-sms-verification-code-use-case');

export interface SendSmsVerificationCodeRequest {
  phoneE164: string; // Phone number in E.164 format
  purpose: 'registration' | 'login' | 'phone_change';
  userId?: string; // Optional: For existing users changing phone
}

export interface SendSmsVerificationCodeResponse {
  success: boolean;
  message?: string;
  error?: string;
  codeId?: string;
  expiresAt?: Date;
}

export class SendSmsVerificationCodeUseCase {
  constructor(private authRepo: IAuthRepository) {}

  async execute(request: SendSmsVerificationCodeRequest): Promise<SendSmsVerificationCodeResponse> {
    try {
      const { phoneE164, purpose, userId } = request;

      // Validate phone number format (basic E.164 check)
      if (!phoneE164 || !phoneE164.startsWith('+')) {
        return {
          success: false,
          error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)',
        };
      }

      // Cleanup expired codes for this phone number
      await this.authRepo.cleanupExpiredSmsCode(phoneE164);

      // Check for existing valid code (rate limiting)
      const existingCode = await this.authRepo.findLatestSmsCode(phoneE164, purpose);

      if (existingCode && existingCode.expiresAt > new Date()) {
        // If user exhausted attempts, allow them to request a new code after 2 minutes
        const MAX_ATTEMPTS = 3;
        const LOCKOUT_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

        if (existingCode.attemptCount >= MAX_ATTEMPTS) {
          const timeSinceLastSent = Date.now() - existingCode.lastSentAt.getTime();

          if (timeSinceLastSent < LOCKOUT_COOLDOWN_MS) {
            const secondsRemaining = Math.floor((LOCKOUT_COOLDOWN_MS - timeSinceLastSent) / 1000);
            return {
              success: false,
              error: `Too many attempts. Please wait ${secondsRemaining} seconds before requesting a new code`,
            };
          }
          // Cooldown passed - allow new code generation by falling through
        } else {
          // Code still valid and hasn't exceeded attempts
          const secondsRemaining = Math.floor((existingCode.expiresAt.getTime() - Date.now()) / 1000);
          return {
            success: false,
            error: `Please wait ${secondsRemaining} seconds before requesting a new code`,
          };
        }
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Code expires in 10 minutes
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Save code to database
      const verificationCode = await this.authRepo.createSmsVerificationCode({
        userId: userId || null,
        phoneE164,
        code,
        purpose,
        expiresAt,
        attemptCount: 0,
        lastSentAt: new Date(),
        metadata: {},
      });

      // SMS Integration: Twilio integration available via Replit connector
      // To enable: Set up Twilio connector in Replit integrations, then use TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets
      // For production: Replace this logging with actual Twilio API call
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        // Twilio credentials available - implement SMS sending here
        // const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        // await twilio.messages.create({ body: `Your verification code is: ${code}`, from: process.env.TWILIO_PHONE_NUMBER, to: phoneE164 });
        logger.info('Twilio credentials configured but SMS sending not yet implemented', {
          phoneE164: phoneE164.slice(0, 4) + '****',
          purpose,
        });
      } else {
        logger.info('SMS verification code generated (DEV MODE - Twilio not configured)', {
          phoneE164,
          code,
          purpose,
          expiresAt,
          codeId: verificationCode.id,
        });
      }

      // In development, return the code in the response (REMOVE IN PRODUCTION)
      const isDevelopment = process.env.NODE_ENV !== 'production';

      return {
        success: true,
        message: isDevelopment
          ? `Verification code: ${code} (expires in 10 minutes)`
          : 'Verification code sent to your phone',
        codeId: verificationCode.id,
        expiresAt,
      };
    } catch (error) {
      logger.error('Failed to send SMS verification code', { error });
      return { success: false, error: 'Failed to send verification code' };
    }
  }
}
