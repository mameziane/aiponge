/**
 * Token Blacklist Service
 * Manages JWT token revocation for logout/security purposes
 */

import { eq, lt, and } from 'drizzle-orm';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { tokenBlacklist, TokenRevocationReason } from '../database/schemas/user-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('token-blacklist-service');

export class TokenBlacklistService {
  private db = getDatabase();
  private static instance: TokenBlacklistService | null = null;

  static getInstance(): TokenBlacklistService {
    if (!TokenBlacklistService.instance) {
      TokenBlacklistService.instance = new TokenBlacklistService();
    }
    return TokenBlacklistService.instance;
  }

  async revokeToken(tokenJti: string, userId: string, expiresAt: Date, reason: TokenRevocationReason): Promise<void> {
    try {
      await this.db
        .insert(tokenBlacklist)
        .values({
          tokenJti,
          userId,
          expiresAt,
          reason,
        })
        .onConflictDoNothing();

      logger.info('Token revoked', { tokenJti: tokenJti.substring(0, 8) + '...', userId, reason });
    } catch (error) {
      logger.error('Failed to revoke token', { error, userId });
      throw error;
    }
  }

  async revokeAllUserTokens(userId: string, reason: TokenRevocationReason): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const allSessionsJti = `all_sessions_${userId}_${Date.now()}`;

    try {
      await this.db.insert(tokenBlacklist).values({
        tokenJti: allSessionsJti,
        userId,
        expiresAt,
        reason: 'all_sessions',
      });

      logger.info('All user tokens revoked', { userId, reason });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', { error, userId });
      throw error;
    }
  }

  async isTokenRevoked(tokenJti: string): Promise<boolean> {
    try {
      const [entry] = await this.db.select().from(tokenBlacklist).where(eq(tokenBlacklist.tokenJti, tokenJti)).limit(1);

      return !!entry;
    } catch (error) {
      logger.error('Failed to check token revocation', { error });
      return false;
    }
  }

  async areAllUserTokensRevoked(userId: string, tokenIssuedAt: Date): Promise<boolean> {
    try {
      const [entry] = await this.db
        .select()
        .from(tokenBlacklist)
        .where(and(eq(tokenBlacklist.userId, userId), eq(tokenBlacklist.reason, 'all_sessions')))
        .orderBy(tokenBlacklist.createdAt)
        .limit(1);

      if (!entry) return false;

      return entry.createdAt > tokenIssuedAt;
    } catch (error) {
      logger.error('Failed to check all sessions revocation', { error, userId });
      return false;
    }
  }

  async cleanupExpiredEntries(): Promise<number> {
    try {
      const result = await this.db.delete(tokenBlacklist).where(lt(tokenBlacklist.expiresAt, new Date()));

      logger.debug('Cleaned up expired blacklist entries');
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup expired blacklist entries', { error });
      return 0;
    }
  }
}

export const tokenBlacklistService = TokenBlacklistService.getInstance();
