import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { JWTService } from '@infrastructure/services';
import { IAuthRepository } from '@domains/auth';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { userSessions } from '@infrastructure/database/schemas/user-schema';
import { getLogger } from '@config/service-urls';
import { USER_STATUS, type UserRole } from '@aiponge/shared-contracts';

const logger = getLogger('refresh-token-use-case');

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export interface RefreshTokenRequest {
  refreshToken: string;
  sessionId: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  error?: string;
  errorCode?: 'INVALID_TOKEN' | 'SESSION_REVOKED' | 'TOKEN_EXPIRED' | 'TOKEN_REUSE_DETECTED' | 'SERVER_ERROR';
}

export class RefreshTokenUseCase {
  constructor(
    private authRepo: IAuthRepository,
    private jwtService: JWTService
  ) {}

  async execute(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const db = getDatabase();

    try {
      const { refreshToken, sessionId } = request;

      if (!refreshToken || !sessionId) {
        return {
          success: false,
          error: 'Refresh token and session ID are required',
          errorCode: 'INVALID_TOKEN',
        };
      }

      const [session] = await db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1);

      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          errorCode: 'INVALID_TOKEN',
        };
      }

      if (session.revoked) {
        logger.warn('Attempt to use revoked session - possible token reuse attack', {
          sessionId,
          userId: session.userId,
          family: session.refreshTokenFamily,
        });

        if (session.refreshTokenFamily) {
          await db
            .update(userSessions)
            .set({ revoked: true })
            .where(eq(userSessions.refreshTokenFamily, session.refreshTokenFamily));
        }

        return {
          success: false,
          error: 'Session has been revoked. Please log in again.',
          errorCode: 'TOKEN_REUSE_DETECTED',
        };
      }

      if (session.refreshTokenExpiresAt && session.refreshTokenExpiresAt < new Date()) {
        return {
          success: false,
          error: 'Refresh token has expired. Please log in again.',
          errorCode: 'TOKEN_EXPIRED',
        };
      }

      if (
        !session.refreshTokenHash ||
        !this.jwtService.verifyRefreshTokenHash(refreshToken, session.refreshTokenHash)
      ) {
        return {
          success: false,
          error: 'Invalid refresh token',
          errorCode: 'INVALID_TOKEN',
        };
      }

      const user = await this.authRepo.findUserById(session.userId);
      if (!user || user.status !== USER_STATUS.ACTIVE) {
        return {
          success: false,
          error: 'User account is not active',
          errorCode: 'SESSION_REVOKED',
        };
      }

      await db.update(userSessions).set({ revoked: true }).where(eq(userSessions.id, sessionId));

      const newRefreshToken = this.jwtService.generateRefreshToken();
      const newRefreshTokenHash = this.jwtService.hashRefreshToken(newRefreshToken);
      const newSessionId = randomUUID();
      const now = new Date();
      const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(userSessions).values({
        id: newSessionId,
        userId: session.userId,
        refreshTokenHash: newRefreshTokenHash,
        refreshTokenFamily: session.refreshTokenFamily,
        refreshTokenExpiresAt: refreshExpiresAt,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        lastActivityAt: now,
        expiresAt: refreshExpiresAt,
        revoked: false,
      });

      const userRole = user.role as UserRole;
      const accessToken = this.jwtService.generateAccessToken({
        id: user.id,
        email: user.email,
        role: userRole,
        roles: [userRole],
        permissions: [],
        isGuest: user.isGuest,
      });

      logger.info('Token refreshed successfully', {
        userId: session.userId,
        oldSessionId: sessionId,
        newSessionId,
        family: session.refreshTokenFamily,
      });

      return {
        success: true,
        accessToken,
        refreshToken: newRefreshToken,
        sessionId: newSessionId,
      };
    } catch (error) {
      logger.error('Token refresh failed', { error });
      return {
        success: false,
        error: 'Token refresh failed. Please try again.',
        errorCode: 'SERVER_ERROR',
      };
    }
  }

  async createSession(
    userId: string,
    deviceInfo?: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ refreshToken: string; sessionId: string }> {
    const db = getDatabase();

    const refreshToken = this.jwtService.generateRefreshToken();
    const refreshTokenHash = this.jwtService.hashRefreshToken(refreshToken);
    const sessionId = randomUUID();
    const family = randomUUID();
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(userSessions).values({
      id: sessionId,
      userId,
      refreshTokenHash,
      refreshTokenFamily: family,
      refreshTokenExpiresAt: refreshExpiresAt,
      deviceInfo: deviceInfo ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      lastActivityAt: now,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    return { refreshToken, sessionId };
  }

  async revokeFamily(family: string): Promise<void> {
    const db = getDatabase();
    await db.update(userSessions).set({ revoked: true }).where(eq(userSessions.refreshTokenFamily, family));
  }
}
