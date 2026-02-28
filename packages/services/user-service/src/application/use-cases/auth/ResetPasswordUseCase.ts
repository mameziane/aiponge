/**
 * Reset Password Use Case
 * Handles password reset completion with token validation
 */

import { IAuthRepository } from '@domains/auth';
import { RequestPasswordResetUseCase } from './RequestPasswordResetUseCase';
import bcrypt from 'bcryptjs';
import { getLogger } from '@config/service-urls';
import { AuthError } from '@application/errors';
import { USER_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('reset-password-use-case');

export interface ResetPasswordDTO {
  token: string;
  newPassword: string;
  ipAddress: string;
}

export class ResetPasswordUseCase {
  constructor(
    private authRepository: IAuthRepository,
    private requestPasswordResetUseCase: RequestPasswordResetUseCase
  ) {}

  async execute(dto: ResetPasswordDTO): Promise<{ success: boolean; message: string }> {
    const tokenValidation = await this.requestPasswordResetUseCase.validateResetToken(dto.token);

    if (!tokenValidation.valid) {
      throw AuthError.invalidToken('Invalid or expired reset token');
    }

    if (!this.validatePasswordStrength(dto.newPassword)) {
      throw AuthError.passwordRequirementsNotMet(
        'Password requirements not met: must be at least 6 characters with letters and numbers'
      );
    }

    const user = await this.authRepository.findUserByEmail(tokenValidation.email!);
    if (!user) {
      throw AuthError.userNotFound();
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw AuthError.accountDisabled();
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.authRepository.updateUser(user.id, {
      passwordHash: hashedPassword,
    });

    await this.requestPasswordResetUseCase.markTokenAsUsed(dto.token);

    logger.info('Password reset completed successfully', {
      userId: user.id,
      userEmail: user.email,
      ipAddress: dto.ipAddress,
    });

    return {
      success: true,
      message: 'Password has been reset successfully.',
    };
  }

  private validatePasswordStrength(password: string): boolean {
    if (password.length < 6) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
  }
}
