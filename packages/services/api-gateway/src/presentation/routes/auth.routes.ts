/**
 * Authentication Routes
 * Public routes for user authentication - proxied to user-service
 *
 * Security: Uses http-proxy-middleware to preserve headers, handle all status codes,
 * and forward client IP for audit trails. Rate limiting applied at mount point in app.ts.
 */

import express from 'express';
import type { Request } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { getLogger } from '../../config/service-urls';

const router = express.Router();
const logger = getLogger('api-gateway-auth');

// Direct target URL — immune to service discovery state changes (static/dynamic transitions).
// Auth is critical-path; never route through ServiceLocator which can be momentarily empty.
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || `http://localhost:${process.env.USER_SERVICE_PORT || '3003'}`;

/**
 * Create proxy middleware for auth endpoints - SINGLE INSTANCE
 * Reused across all auth routes for better performance
 *
 * Uses a fixed target so it never fails during service discovery transitions.
 */
const authProxy = createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: path => {
    const rewrittenPath = `/api/auth${path}`;
    logger.debug(`📝 Proxying auth: ${path} → ${rewrittenPath}`);
    return rewrittenPath;
  },
  // CRITICAL FIX: Re-serialize body if express.json() already parsed it
  on: {
    proxyReq: (proxyReq, req: import('http').IncomingMessage & { body?: unknown }, res) => {
      // If express.json() already parsed the body, re-serialize it
      // This handles both empty objects {} and objects with data
      if (req.body !== undefined) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
        proxyReq.end(); // CRITICAL: Must call end() to complete the request
      }
    },
    error: (err, req, res) => {
      logger.warn('Auth proxy error — user-service unreachable', {
        error: err.message,
        path: (req as Request).path,
      });
      // res can be ServerResponse (HTTP) or Socket (WebSocket upgrade) — guard before using HTTP methods
      if ('writeHead' in res && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'Authentication service temporarily unavailable. Please try again.',
          })
        );
      }
    },
  },
});

/**
 * POST /auth/register
 * User registration endpoint
 */
router.post('/register', authProxy);

/**
 * POST /auth/login
 * User login endpoint
 */
router.post('/login', authProxy);

/**
 * POST /auth/guest
 * Guest session creation endpoint
 */
router.post('/guest', authProxy);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token (rotation)
 */
router.post('/refresh', authProxy);

/**
 * POST /auth/authenticate
 * JWT token authentication
 */
router.post('/authenticate', authProxy);

/**
 * POST /auth/logout
 * User logout endpoint
 */
router.post('/logout', authProxy);

/**
 * GET /auth/me
 * Get current authenticated user
 * Note: Unauthenticated at gateway, Authorization header forwarded to service for validation
 */
router.get('/me', authProxy);

/**
 * POST /auth/sms/send-code
 * Send SMS verification code
 */
router.post('/sms/send-code', authProxy);

/**
 * POST /auth/sms/verify-code
 * Verify SMS code
 */
router.post('/sms/verify-code', authProxy);

/**
 * POST /auth/password/request-reset
 * Request password reset (token-based)
 */
router.post('/password/request-reset', authProxy);

/**
 * POST /auth/password/reset
 * Reset password with token (token-based)
 */
router.post('/password/reset', authProxy);

/**
 * POST /auth/password/request-code
 * Request password reset code (mobile-friendly 6-digit code)
 */
router.post('/password/request-code', authProxy);

/**
 * POST /auth/password/verify-code
 * Verify password reset code
 */
router.post('/password/verify-code', authProxy);

/**
 * POST /auth/password/reset-with-token
 * Reset password using verified token
 */
router.post('/password/reset-with-token', authProxy);

/**
 * DELETE /auth/delete-account
 * Delete user account and all associated data
 * Requires valid authentication token
 */
router.delete('/delete-account', authProxy);

export { router as authRoutes };
