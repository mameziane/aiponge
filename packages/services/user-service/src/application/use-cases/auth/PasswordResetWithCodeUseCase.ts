import { IAuthRepository } from '@domains/auth';
import { emailService } from '@infrastructure/services';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getLogger } from '@config/service-urls';
import { v4 as uuidv4 } from 'uuid';
import { serializeError } from '@aiponge/platform-core';
import { USER_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('password-reset-with-code-use-case');

export interface RequestPasswordResetCodeDTO {
  email: string;
  ipAddress?: string;
}

export interface VerifyPasswordResetCodeDTO {
  email: string;
  code: string;
}

export interface ResetPasswordWithTokenDTO {
  token: string;
  newPassword: string;
}

export class PasswordResetWithCodeUseCase {
  private readonly CODE_EXPIRY_MINUTES = 15;
  private readonly TOKEN_EXPIRY_MINUTES = 10;

  constructor(private authRepository: IAuthRepository) {}

  async requestResetCode(
    dto: RequestPasswordResetCodeDTO
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const securityMessage = 'If an account exists with this email, a reset code has been sent.';

    try {
      logger.info('Password reset code requested', { email: dto.email });

      const user = await this.authRepository.findUserByEmail(dto.email);

      if (!user) {
        return { success: true, message: securityMessage };
      }

      if (user.status !== USER_STATUS.ACTIVE) {
        return { success: true, message: securityMessage };
      }

      if (user.isGuest) {
        return { success: true, message: securityMessage };
      }

      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

      await this.authRepository.cleanupExpiredPasswordResetTokens();

      await this.authRepository.createPasswordResetToken({
        id: uuidv4(),
        userId: user.id,
        email: user.email.toLowerCase(),
        code,
        expiresAt,
        verified: false,
      });

      const emailResult = await emailService.sendPasswordResetCode(user.email, code, this.CODE_EXPIRY_MINUTES);

      if (!emailResult.success) {
        logger.error('Failed to send password reset email', { email: dto.email, error: emailResult.error });
        return {
          success: false,
          message: 'Failed to send reset code. Please try again.',
          error: emailResult.error,
        };
      }

      logger.info('Password reset code sent successfully', {
        email: dto.email,
        expiresAt: expiresAt.toISOString(),
      });

      return { success: true, message: securityMessage };
    } catch (error) {
      logger.error('Error requesting password reset code', {
        email: dto.email,
        error: serializeError(error),
      });
      return {
        success: false,
        message: 'An error occurred. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyCode(dto: VerifyPasswordResetCodeDTO): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const storedCode = await this.authRepository.findPasswordResetTokenByEmail(dto.email.toLowerCase());

      if (!storedCode) {
        logger.warn('No reset code found for email', { email: dto.email });
        return { success: false, error: 'Invalid or expired code' };
      }

      if (new Date() > storedCode.expiresAt) {
        await this.authRepository.deletePasswordResetToken(storedCode.id);
        return {
          success: false,
          error: 'Code has expired. Please request a new one.',
        };
      }

      if (storedCode.code !== dto.code) {
        logger.warn('Invalid reset code attempt', { email: dto.email });
        return {
          success: false,
          error: 'Invalid code. Please check and try again.',
        };
      }

      if (storedCode.usedAt) {
        return { success: false, error: 'This code has already been used.' };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await this.authRepository.updatePasswordResetToken(storedCode.id, {
        verified: true,
        token: resetToken,
        expiresAt: tokenExpiresAt,
      });

      logger.info('Password reset code verified', { email: dto.email });

      return { success: true, token: resetToken };
    } catch (error) {
      logger.error('Error verifying password reset code', {
        email: dto.email,
        error: serializeError(error),
      });
      return { success: false, error: 'Verification failed. Please try again.' };
    }
  }

  async resetPassword(dto: ResetPasswordWithTokenDTO): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const tokenData = await this.authRepository.findPasswordResetTokenByToken(dto.token);

      if (!tokenData) {
        return { success: false, error: 'Invalid or expired reset token' };
      }

      if (new Date() > tokenData.expiresAt) {
        await this.authRepository.deletePasswordResetToken(tokenData.id);
        return {
          success: false,
          error: 'Reset token has expired. Please start over.',
        };
      }

      if (!tokenData.verified) {
        return { success: false, error: 'Reset code was not verified' };
      }

      if (tokenData.usedAt) {
        return {
          success: false,
          error: 'This reset token has already been used.',
        };
      }

      if (!this.validatePasswordStrength(dto.newPassword)) {
        return {
          success: false,
          error: 'Password must be at least 8 characters with letters and numbers',
        };
      }

      const user = await this.authRepository.findUserByEmail(tokenData.email);
      if (!user) {
        return { success: false, error: 'User account not found' };
      }

      if (user.status !== USER_STATUS.ACTIVE) {
        return { success: false, error: 'Account has been disabled' };
      }

      const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

      await this.authRepository.updateUser(user.id, {
        passwordHash: hashedPassword,
      });

      await this.authRepository.updatePasswordResetToken(tokenData.id, {
        usedAt: new Date(),
      });

      await emailService.sendPasswordResetConfirmation(user.email);

      logger.info('Password reset completed successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
      };
    } catch (error) {
      logger.error('Error resetting password', {
        error: serializeError(error),
      });
      return { success: false, error: 'Password reset failed. Please try again.' };
    }
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private validatePasswordStrength(password: string): boolean {
    if (password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
  }
}
