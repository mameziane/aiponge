/**
 * Request Password Reset Use Case
 * Generates and stores password reset tokens
 */

import { IAuthRepository } from '@domains/auth';
import crypto from 'crypto';
import { getLogger } from '@config/service-urls';
import { USER_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('request-password-reset-use-case');

export interface RequestPasswordResetDTO {
  email: string;
  ipAddress: string;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  ipAddress: string;
  used: boolean;
}

const MAX_RESET_TOKENS = 1000;

export class RequestPasswordResetUseCase {
  private resetTokens = new Map<string, PasswordResetToken>();

  constructor(private authRepository: IAuthRepository) {}

  async execute(dto: RequestPasswordResetDTO): Promise<{ token?: string; message: string }> {
    logger.info('Password reset requested', {
      email: dto.email,
      ipAddress: dto.ipAddress,
    });

    const user = await this.authRepository.findUserByEmail(dto.email);

    const securityMessage = 'If an account exists, a reset email has been sent.';

    if (!user) {
      return { message: securityMessage };
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      return { message: securityMessage };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const passwordResetToken: PasswordResetToken = {
      token: resetToken,
      userId: user.id,
      email: user.email,
      expiresAt,
      ipAddress: dto.ipAddress,
      used: false,
    };

    this.evictIfNeeded();
    this.resetTokens.set(resetToken, passwordResetToken);

    this.cleanupExpiredTokens();

    logger.info('Password reset token generated successfully', {
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      token: resetToken,
      message: securityMessage,
    };
  }

  private evictIfNeeded(): void {
    while (this.resetTokens.size >= MAX_RESET_TOKENS) {
      const oldestKey = this.resetTokens.keys().next().value;
      if (oldestKey === undefined) break;
      this.resetTokens.delete(oldestKey);
      logger.info('LRU eviction in reset tokens cache (max {})', { data0: String(MAX_RESET_TOKENS) });
    }
  }

  async validateResetToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
    const resetToken = this.resetTokens.get(token);

    if (!resetToken) {
      return { valid: false };
    }

    if (resetToken.used) {
      return { valid: false };
    }

    if (new Date() > resetToken.expiresAt) {
      this.resetTokens.delete(token);
      return { valid: false };
    }

    this.resetTokens.delete(token);
    this.resetTokens.set(token, resetToken);

    return {
      valid: true,
      userId: resetToken.userId,
      email: resetToken.email,
    };
  }

  async markTokenAsUsed(token: string): Promise<void> {
    const resetToken = this.resetTokens.get(token);
    if (resetToken) {
      resetToken.used = true;
      this.resetTokens.set(token, resetToken);
    }
  }

  private cleanupExpiredTokens(): void {
    const now = new Date();
    const entries = Array.from(this.resetTokens.entries());
    for (const [token, resetToken] of entries) {
      if (now > resetToken.expiresAt || resetToken.used) {
        this.resetTokens.delete(token);
      }
    }
  }

  getActiveTokens(): PasswordResetToken[] {
    this.cleanupExpiredTokens();
    return Array.from(this.resetTokens.values()).filter(t => !t.used);
  }
}
