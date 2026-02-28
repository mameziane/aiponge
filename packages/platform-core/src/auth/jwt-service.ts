/**
 * JWT Service
 *
 * Standardized JWT token handling for microservices
 */

import jwt from 'jsonwebtoken';
import { DomainError } from '../error-handling';

export interface JwtPayload {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

function validateJwtPayload(decoded: unknown): JwtPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new DomainError('Invalid token payload: not an object', 401);
  }
  const obj = decoded as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id) {
    throw new DomainError('Invalid token payload: missing or invalid id', 401);
  }
  if (typeof obj.email !== 'string') {
    throw new DomainError('Invalid token payload: missing or invalid email', 401);
  }

  const roles = Array.isArray(obj.roles) ? obj.roles.filter((r): r is string => typeof r === 'string') : [];
  const permissions = Array.isArray(obj.permissions)
    ? obj.permissions.filter((p): p is string => typeof p === 'string')
    : [];

  return { id: obj.id, email: obj.email, roles, permissions };
}

export class StandardJWTService {
  private secret: string;

  constructor(secret?: string) {
    const resolved = secret || process.env.JWT_SECRET;
    if (!resolved) {
      throw new Error(
        'JWT_SECRET is required. Set the JWT_SECRET environment variable or pass a secret to the constructor.'
      );
    }
    this.secret = resolved;
  }

  verify(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: 'aiponge',
        audience: 'aiponge-api',
      });
      return validateJwtPayload(decoded);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('Invalid or expired token', 401, error instanceof Error ? error : undefined);
    }
  }

  sign(payload: string | Buffer | object, options?: jwt.SignOptions): string {
    return jwt.sign(payload, this.secret, {
      algorithm: 'HS256' as jwt.Algorithm,
      issuer: 'aiponge',
      audience: 'aiponge-api',
      expiresIn: '15m',
      ...options,
    });
  }
}
