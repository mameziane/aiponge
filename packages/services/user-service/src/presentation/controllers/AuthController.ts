/**
 * Auth Controller
 * Handles authentication, registration, and user management
 */

import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { normalizeRole, RefreshTokenSchema, getCorrelationId } from '@aiponge/shared-contracts';

import { serializeError, getAuditService, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('auth-controller');

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createRegisterUserUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success || !result.user || !result.token) {
        ServiceErrors.badRequest(res, result.error || 'Registration failed', req);
        return;
      }

      getAuditService().log({
        userId: result.user.id,
        targetType: 'user',
        targetId: result.user.id,
        action: 'create',
        metadata: { method: 'register' },
        serviceName: 'user-service',
        correlationId: getCorrelationId(req),
      });

      sendCreated(res, {
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });
    } catch (error) {
      logger.error('Register error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Registration failed. Please try again.', req);
      return;
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createLoginUserUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success || !result.user || !result.token) {
        ServiceErrors.unauthorized(res, result.error || 'Login failed', req);
        return;
      }

      getAuditService().log({
        userId: result.user.id,
        targetType: 'user',
        targetId: result.user.id,
        action: 'login',
        metadata: { method: 'password' },
        serviceName: 'user-service',
        correlationId: getCorrelationId(req),
      });

      sendSuccess(res, {
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });
    } catch (error) {
      logger.error('Login error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Login failed. Please try again.', req);
      return;
    }
  }

  async guestAuth(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createGuestAuthUseCase();
      const result = await useCase.execute();

      if (!result.success || !result.token || !result.guestProfile) {
        const debugError = result.error || 'Failed to create guest session';
        logger.error('Guest auth use case returned failure', { error: debugError });
        ServiceErrors.internal(res, debugError, undefined, req);
        return;
      }

      sendSuccess(res, {
        token: result.token,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        user: result.guestProfile,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Guest auth error', { error: serializeError(error) });
      ServiceErrors.internal(res, `Failed to create guest session: ${errMsg}`, undefined, req);
      return;
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const parsed = RefreshTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        ServiceErrors.badRequest(res, 'Invalid request body', req);
        return;
      }

      const useCase = ServiceFactory.createRefreshTokenUseCase();
      const result = await useCase.execute({
        refreshToken: parsed.data.refreshToken,
        sessionId: parsed.data.sessionId,
      });

      if (!result.success) {
        const statusCode = result.errorCode === 'TOKEN_REUSE_DETECTED' ? 403 : 401;
        if (statusCode === 403) {
          ServiceErrors.forbidden(res, result.error || 'Token reuse detected', req);
        } else {
          ServiceErrors.unauthorized(res, result.error || 'Token refresh failed', req);
        }
        return;
      }

      sendSuccess(res, {
        token: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });
    } catch (error) {
      logger.error('Refresh token error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Token refresh failed', req);
      return;
    }
  }

  async registerUser(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createRegisterUserUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'User registration failed', req);
        return;
      }

      sendCreated(res, result);
    } catch (error) {
      logger.error('Register user error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'User registration failed', req);
      return;
    }
  }

  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createRequestPasswordResetUseCase();
      const result = await useCase.execute(req.body);

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Request password reset error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Password reset request failed', req);
      return;
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createResetPasswordUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success) {
        ServiceErrors.badRequest(res, (result.message as string) || 'Password reset failed', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Reset password error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Password reset failed', req);
      return;
    }
  }

  async requestPasswordResetCode(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        ServiceErrors.badRequest(res, 'Email is required', req);
        return;
      }

      const useCase = ServiceFactory.createPasswordResetWithCodeUseCase();
      const result = await useCase.requestResetCode({
        email,
        ipAddress: req.ip || 'unknown',
      });

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Request password reset code error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to send reset code', req);
      return;
    }
  }

  async verifyPasswordResetCode(req: Request, res: Response): Promise<void> {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        ServiceErrors.badRequest(res, 'Email and code are required', req);
        return;
      }

      const useCase = ServiceFactory.createPasswordResetWithCodeUseCase();
      const result = await useCase.verifyCode({ email, code });

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Verification failed', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Verify password reset code error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Verification failed', req);
      return;
    }
  }

  async resetPasswordWithToken(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        ServiceErrors.badRequest(res, 'Token and new password are required', req);
        return;
      }

      const useCase = ServiceFactory.createPasswordResetWithCodeUseCase();
      const result = await useCase.resetPassword({ token, newPassword });

      if (!result.success) {
        ServiceErrors.badRequest(res, (result.message as string) || 'Password reset failed', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Reset password with token error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Password reset failed', req);
      return;
    }
  }

  async authenticate(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createAuthenticateUserUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success) {
        ServiceErrors.unauthorized(res, result.error || 'Authentication failed', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Authenticate error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Authentication failed', req);
      return;
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const useCase = ServiceFactory.createGetUserProfileUseCase();
      const result = await useCase.execute({ userId });

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Get user error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get user', req);
      return;
    }
  }

  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ServiceErrors.unauthorized(res, 'No authorization token provided', req);
        return;
      }

      const token = authHeader.substring(7);

      const jwtService = ServiceFactory.createJWTService();
      let payload;
      try {
        payload = jwtService.verifyToken(token);
      } catch (error) {
        ServiceErrors.unauthorized(res, 'Invalid or expired token', req);
        return;
      }

      const authRepo = ServiceFactory.createAuthRepository();
      const userId = payload.id;
      const user = await authRepo.getUserById(userId);

      if (!user) {
        ServiceErrors.notFound(res, 'User', req);
        return;
      }

      const username = user.email.split('@')[0];

      let profileData: { displayName?: string; birthdate?: string; avatarUrl?: string } = {};
      try {
        const userProfile = typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile || {};

        profileData = {
          displayName: userProfile.name || userProfile.displayName,
          birthdate: userProfile.birthdate,
          avatarUrl: userProfile.avatar || userProfile.avatarUrl,
        };
      } catch (profileError) {
        logger.debug('Profile parse failed for getCurrentUser', { userId: user.id, error: profileError });
      }

      sendSuccess(res, {
        user: {
          id: user.id,
          email: user.email,
          username: username,
          name: profileData.displayName || username,
          birthdate: profileData.birthdate,
          avatarUrl: profileData.avatarUrl,
          role: user.role,
          isGuest: user.isGuest ?? false,
          isSystemAccount: user.isSystemAccount ?? false,
        },
      });
    } catch (error) {
      logger.error('Get current user error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get current user', req);
      return;
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendSuccess(res, { message: 'Logged out successfully' });
        return;
      }

      const token = authHeader.substring(7);
      const jwtService = ServiceFactory.createJWTService();

      try {
        const payload = jwtService.verifyToken(token);
        const jti = jwtService.extractJti(token);
        const expiresAt = jwtService.getTokenExpiration(token);

        if (jti && payload.id && expiresAt) {
          const { tokenBlacklistService } = await import('../../infrastructure/services/TokenBlacklistService');
          await tokenBlacklistService.revokeToken(jti, payload.id, expiresAt, 'logout');
          logger.info('Token revoked on logout', { userId: payload.id });

          this.triggerPersonaRefreshAsync(payload.id);
        }
      } catch (verifyError) {
        logger.debug('Token verification failed on logout - already expired or invalid');
      }

      const { sessionId } = req.body ?? {};
      if (sessionId) {
        try {
          const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
          const { userSessions } = await import('../../infrastructure/database/schemas/user-schema');
          const { eq } = await import('drizzle-orm');
          const db = getDatabase();
          await db.update(userSessions).set({ revoked: true }).where(eq(userSessions.id, sessionId));
          logger.info('Session revoked on logout', { sessionId });
        } catch (sessionError) {
          logger.warn('Failed to revoke session on logout', { sessionId, error: serializeError(sessionError) });
        }
      }

      sendSuccess(res, { message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Logout failed', req);
      return;
    }
  }

  private triggerPersonaRefreshAsync(userId: string): void {
    setImmediate(async () => {
      try {
        const generatePersonaUseCase = ServiceFactory.createGenerateUserPersonaUseCase();
        await generatePersonaUseCase.execute({
          userId,
          personalizationDepth: 'detailed',
        });
        logger.info('Persona refreshed on logout for user: {}', { data0: userId });
      } catch (error) {
        logger.warn('Failed to refresh persona on logout: {}', {
          data0: serializeError(error),
          userId,
        });
      }
    });
  }

  async logoutAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ServiceErrors.unauthorized(res, 'No authorization token provided', req);
        return;
      }

      const token = authHeader.substring(7);
      const jwtService = ServiceFactory.createJWTService();

      let payload;
      try {
        payload = jwtService.verifyToken(token);
      } catch (error) {
        ServiceErrors.unauthorized(res, 'Invalid or expired token', req);
        return;
      }

      const { tokenBlacklistService } = await import('../../infrastructure/services/TokenBlacklistService');
      await tokenBlacklistService.revokeAllUserTokens(payload.id, 'all_sessions');

      try {
        const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
        const { userSessions } = await import('../../infrastructure/database/schemas/user-schema');
        const { eq } = await import('drizzle-orm');
        const db = getDatabase();
        await db.update(userSessions).set({ revoked: true }).where(eq(userSessions.userId, payload.id));
        logger.info('All refresh sessions revoked', { userId: payload.id });
      } catch (sessionError) {
        logger.warn('Failed to revoke all sessions', { userId: payload.id, error: serializeError(sessionError) });
      }

      logger.info('All sessions revoked', { userId: payload.id });
      sendSuccess(res, { message: 'All sessions logged out successfully' });
    } catch (error) {
      logger.error('Logout all sessions error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to logout all sessions', req);
      return;
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const useCase = ServiceFactory.createUpdateUserUseCase();
      const result = await useCase.execute({ userId, ...req.body });

      getAuditService().log({
        userId,
        targetType: 'user',
        targetId: userId,
        action: 'update',
        metadata: { fields: Object.keys(req.body) },
        serviceName: 'user-service',
        correlationId: getCorrelationId(req),
      });

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Update user error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update user', req);
      return;
    }
  }

  async sendSmsVerificationCode(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createSendSmsVerificationCodeUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to send SMS code', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Send SMS verification code error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to send verification code', req);
      return;
    }
  }

  async verifySmsCode(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createVerifySmsCodeUseCase();
      const result = await useCase.execute(req.body);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Verification failed', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Verify SMS code error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Verification failed', req);
      return;
    }
  }

  async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ServiceErrors.unauthorized(res, 'No authorization token provided', req);
        return;
      }

      const token = authHeader.substring(7);

      const jwtService = ServiceFactory.createJWTService();
      let payload;
      try {
        payload = jwtService.verifyToken(token);
      } catch (error) {
        ServiceErrors.unauthorized(res, 'Invalid or expired token', req);
        return;
      }

      const userId = payload.id;
      const { role } = extractAuthContext(req);

      const useCase = ServiceFactory.createDeleteUserDataUseCase();
      const result = await useCase.execute({
        userId,
        requestingUserId: userId,
        requestingUserRole: normalizeRole(role),
      });

      if (!result.success) {
        ServiceErrors.badRequest(res, 'Failed to delete account', req);
        return;
      }

      getAuditService().log({
        userId,
        targetType: 'user',
        targetId: userId,
        action: 'delete',
        serviceName: 'user-service',
        correlationId: getCorrelationId(req),
      });

      logger.info('Account deleted successfully', { userId });

      sendSuccess(res, {
        message: 'Account deleted successfully',
        deletedUserId: result.deletedUserId,
      });
    } catch (error) {
      logger.error('Delete account error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete account. Please try again.', req);
      return;
    }
  }
}
