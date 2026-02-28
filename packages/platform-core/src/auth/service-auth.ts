/**
 * Internal Service Authentication
 *
 * Provides HMAC signing and verification for internal service-to-service
 * communication to prevent x-user-id header spoofing attacks.
 *
 * When the API Gateway forwards requests to backend services, it includes
 * an x-user-id header with the authenticated user's ID. Without signing,
 * a malicious client could potentially spoof this header.
 *
 * This module provides:
 * - signUserIdHeader(): Signs the x-user-id header with HMAC-SHA256
 * - verifyUserIdHeader(): Verifies the signature on receiving service
 * - serviceAuthMiddleware(): Express middleware for automatic verification
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../logging';
import { sendErrorResponse } from '../error-handling/errors.js';

const logger = getLogger('service-auth');

// Header names
const USER_ID_HEADER = 'x-user-id';
const USER_ROLE_HEADER = 'x-user-role';
const SIGNATURE_HEADER = 'x-user-id-signature';
const TIMESTAMP_HEADER = 'x-user-id-timestamp';
const GATEWAY_HEADER = 'x-gateway-service';

// Signature validity window (5 minutes)
const SIGNATURE_TTL_MS = 5 * 60 * 1000;

// Get the shared secret from environment
function getServiceSecret(): string | null {
  return process.env.INTERNAL_SERVICE_SECRET || null;
}

/**
 * Sign a user ID header for internal service communication
 *
 * @param userId - The user ID to sign
 * @param userRole - Optional user role to include in signature (prevents role spoofing)
 * @returns Object with headers to add to the request
 */
export function signUserIdHeader(userId: string, userRole?: string): Record<string, string> {
  const secret = getServiceSecret();

  const headers: Record<string, string> = {
    [USER_ID_HEADER]: userId,
  };

  if (userRole) {
    headers[USER_ROLE_HEADER] = userRole;
  }

  if (!secret) {
    // In development without a secret, return unsigned headers
    logger.debug('INTERNAL_SERVICE_SECRET not set, skipping signature');
    return headers;
  }

  const timestamp = Date.now().toString();
  // Include role in signature to prevent role spoofing attacks
  const message = userRole ? `${userId}:${userRole}:${timestamp}` : `${userId}:${timestamp}`;

  const signature = crypto.createHmac('sha256', secret).update(message).digest('base64');

  return {
    ...headers,
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp,
  };
}

/**
 * Verify a signed user ID header
 *
 * @param userId - The user ID from the header
 * @param signature - The signature from the header
 * @param timestamp - The timestamp from the header
 * @param userRole - Optional user role that was included in signature
 * @returns True if signature is valid and not expired
 */
export function verifyUserIdSignature(
  userId: string,
  signature: string,
  timestamp: string,
  userRole?: string
): { valid: boolean; reason?: string } {
  const secret = getServiceSecret();

  if (!secret) {
    // Development mode: accept unsigned headers from gateway
    return { valid: true, reason: 'signature_disabled' };
  }

  if (!signature || !timestamp) {
    return { valid: false, reason: 'missing_signature' };
  }

  // Check timestamp freshness
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  const now = Date.now();
  if (Math.abs(now - ts) > SIGNATURE_TTL_MS) {
    return { valid: false, reason: 'expired_signature' };
  }

  // Verify signature (include role if present to prevent role spoofing)
  const message = userRole ? `${userId}:${userRole}:${timestamp}` : `${userId}:${timestamp}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('base64');

  // Use timing-safe comparison
  const sigBuffer = Buffer.from(signature, 'base64');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64');

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'invalid_signature' };
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  return { valid: true };
}

/**
 * Express middleware to verify internal service authentication
 *
 * Only enforces signature verification when:
 * 1. INTERNAL_SERVICE_SECRET is set (production mode)
 * 2. Request includes x-user-id header
 *
 * Use this on internal service endpoints that receive x-user-id from gateway.
 * When role is included in headers, it's also verified as part of the signature.
 */
export function serviceAuthMiddleware(
  options: {
    required?: boolean;
    trustGateway?: boolean;
    requireRole?: boolean;
  } = {}
) {
  const { required = false, trustGateway = true, requireRole: _requireRole = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers[USER_ID_HEADER] as string | undefined;
    const userRole = req.headers[USER_ROLE_HEADER] as string | undefined;

    // No user ID header - allow if not required
    if (!userId) {
      if (required) {
        sendErrorResponse(res, 401, 'Missing user identification', { code: 'MISSING_USER_ID' });
        return;
      }
      return next();
    }

    const secret = getServiceSecret();

    // Development mode: trust gateway header without signature
    if (!secret) {
      // Still set userId and role in res.locals for downstream use
      res.locals.userId = userId;
      res.locals.userRole = userRole;
      return next();
    }

    // Check if request is from trusted gateway
    const gatewayService = req.headers[GATEWAY_HEADER] as string | undefined;

    if (trustGateway && gatewayService === 'api-gateway') {
      // Verify signature from gateway (includes role if present)
      const signature = req.headers[SIGNATURE_HEADER] as string | undefined;
      const timestamp = req.headers[TIMESTAMP_HEADER] as string | undefined;

      if (!signature || !timestamp) {
        logger.warn('Gateway request missing signature', {
          path: req.path,
          hasUserId: !!userId,
        });
        sendErrorResponse(res, 401, 'Invalid internal authentication', { code: 'MISSING_SERVICE_AUTH' });
        return;
      }

      // Include role in verification if present (prevents role spoofing)
      const verification = verifyUserIdSignature(userId, signature, timestamp, userRole);

      if (!verification.valid) {
        logger.warn('Gateway request signature verification failed', {
          path: req.path,
          reason: verification.reason,
          hasRole: !!userRole,
        });
        sendErrorResponse(res, 401, 'Invalid internal authentication', { code: 'INVALID_SERVICE_AUTH' });
        return;
      }
    } else if (required) {
      // Request not from gateway but user ID is required - reject
      sendErrorResponse(res, 401, 'Direct access not allowed', { code: 'GATEWAY_REQUIRED' });
      return;
    }

    // Set verified userId and role in res.locals
    res.locals.userId = userId;
    res.locals.userRole = userRole;
    next();
  };
}

/**
 * Get user ID from request (assumes serviceAuthMiddleware has run)
 */
export function getVerifiedUserId(res: Response): string | undefined {
  return res.locals.userId;
}

/**
 * Get verified user role from request (assumes serviceAuthMiddleware has run)
 */
export function getVerifiedUserRole(res: Response): string | undefined {
  return res.locals.userRole;
}

/**
 * Check if service authentication is enabled
 */
export function isServiceAuthEnabled(): boolean {
  return !!getServiceSecret();
}
