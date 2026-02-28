/**
 * JWT Service
 * Handles JWT token generation and validation
 * Uses dependency injection for the secret to ensure proper configuration
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getLogger } from '../../config/service-urls';
import type { UserRole } from '@aiponge/shared-contracts';
import { AuthError } from '../../application/errors/errors';

const logger = getLogger('jwt-service');

const MIN_SECRET_LENGTH = 32;

export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  permissions: string[];
  isGuest?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface JWTServiceConfig {
  secret: string;
  isProduction?: boolean;
}

export class JWTService {
  private readonly secret: string;
  private static instance: JWTService | null = null;

  constructor(config: JWTServiceConfig) {
    this.secret = config.secret;
    const isProduction = config.isProduction ?? process.env.NODE_ENV === 'production';

    this.validateSecret(this.secret, isProduction);
  }

  private validateSecret(secret: string, isProduction: boolean): void {
    if (!secret) {
      const error = 'JWT secret is required but not provided';
      logger.error(error);
      throw AuthError.invalidToken(error);
    }

    if (secret.includes('aiponge-dev-secret-1759653153')) {
      const error =
        "FATAL: You are using the compromised JWT_SECRET. Generate a new one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"";
      logger.error(error);
      throw AuthError.internalError(error);
    }

    const isWeakSecret = secret === 'dev-secret' || secret.length < MIN_SECRET_LENGTH;

    if (isProduction && isWeakSecret) {
      const error = `JWT secret must be at least ${MIN_SECRET_LENGTH} characters in production and cannot be "dev-secret"`;
      logger.error(error);
      throw AuthError.internalError(error);
    }

    if (isWeakSecret) {
      logger.warn('Using weak JWT secret - NOT suitable for production!');
    }
  }

  static getInstance(): JWTService {
    if (!JWTService.instance) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw AuthError.internalError('JWT_SECRET environment variable is required');
      }
      JWTService.instance = new JWTService({ secret });
    }
    return JWTService.instance;
  }

  static createWithSecret(secret: string, isProduction?: boolean): JWTService {
    return new JWTService({ secret, isProduction });
  }

  generateToken(payload: JWTPayload, expiresIn: string | number = '7d'): string {
    const jti = crypto.randomUUID();
    return jwt.sign({ ...payload, jti }, this.secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
      issuer: 'aiponge',
      audience: 'aiponge-api',
    });
  }

  generateAccessToken(payload: JWTPayload): string {
    return this.generateToken(payload, '15m');
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyRefreshTokenHash(token: string, hash: string): boolean {
    return this.hashRefreshToken(token) === hash;
  }

  extractJti(token: string): string | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload | null;
      return decoded?.jti || null;
    } catch {
      return null;
    }
  }

  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload | null;
      if (decoded?.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch {
      return null;
    }
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: 'aiponge',
        audience: 'aiponge-api',
      }) as JWTPayload;
    } catch (error) {
      const isExpired = error instanceof jwt.TokenExpiredError;
      if (isExpired) {
        logger.debug('Token expired, refresh required', { expiredAt: (error as jwt.TokenExpiredError).expiredAt });
      } else {
        logger.error('Token verification failed', { error });
      }
      throw AuthError.invalidToken();
    }
  }

  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }
}
