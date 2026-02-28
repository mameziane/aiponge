/**
 * Safety Screening Middleware
 * Cross-cutting middleware for safety/risk assessment of therapeutic content
 *
 * This middleware:
 * 1. Intercepts content submissions (entries, books, reflections)
 * 2. Screens content for risk indicators
 * 3. Attaches risk assessment results to the request
 * 4. On crisis/high risk, can block content or require acknowledgment
 */

import { Request, Response, NextFunction, Router } from 'express';
import {
  ServiceLocator,
  createLogger,
  signUserIdHeader,
  serializeError,
  extractAuthContext,
} from '@aiponge/platform-core';
import { CRISIS_RESOURCES, getEmergencyMessage } from '@aiponge/shared-contracts/safety';
import { getCorrelationId } from '@aiponge/shared-contracts';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = createLogger('safety-screening-middleware');

export interface SafetyScreeningResult {
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  detected: boolean;
  flagId?: string;
  requiresAcknowledgment: boolean;
}

interface SafetyAnalysisResponse {
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: boolean;
  flagId?: string;
}

declare global {
  namespace Express {
    interface Request {
      safetyScreening?: SafetyScreeningResult;
    }
  }
}

const CONTENT_FIELDS = ['content', 'entryContent', 'bookEntry', 'text', 'message'];

function extractContent(body: Record<string, unknown>): string | null {
  for (const field of CONTENT_FIELDS) {
    if (body[field] && typeof body[field] === 'string') {
      return body[field] as string;
    }
  }
  return null;
}

export function safetyScreeningMiddleware(
  options: {
    blockOnCrisis?: boolean;
    requireAcknowledgmentOnHigh?: boolean;
  } = {}
) {
  const { blockOnCrisis = false, requireAcknowledgmentOnHigh = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const content = extractContent(req.body);

    if (!content || content.length < 10) {
      next();
      return;
    }

    const { userId } = extractAuthContext(req);
    const correlationId = getCorrelationId(req) || 'unknown';

    if (!userId) {
      next();
      return;
    }

    try {
      const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
      const signedHeaders = signUserIdHeader(userId);

      const response = await gatewayFetch(`${userServiceUrl}/internal/safety/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
          'x-gateway-service': 'api-gateway',
          'x-internal-service': 'api-gateway',
          ...signedHeaders,
        },
        body: JSON.stringify({
          content,
          userId,
          sourceType: determineSourceType(req.path),
          sourceId: req.params.id || `submission_${Date.now()}`,
          skipAI: false,
        }),
      });

      if (!response.ok) {
        logger.warn('Safety screening service unavailable, proceeding', {
          userId,
          correlationId,
          status: response.status,
        });
        next();
        return;
      }

      const result = (await response.json()) as SafetyAnalysisResponse;
      const level = mapSeverityToLevel(result.severity);

      req.safetyScreening = {
        level,
        detected: result.detected,
        flagId: result.flagId,
        requiresAcknowledgment: level === 'high' && requireAcknowledgmentOnHigh,
      };

      logger.info('SAFETY_SCREENING', {
        type: 'content_screening',
        userId,
        correlationId,
        path: req.path,
        method: req.method,
        level,
        detected: result.detected,
        flagId: result.flagId,
        timestamp: new Date().toISOString(),
      });

      if (level === 'critical' && blockOnCrisis) {
        logger.warn('SAFETY_BLOCK', {
          type: 'crisis_content_blocked',
          userId,
          correlationId,
          path: req.path,
          flagId: result.flagId,
        });

        res.status(200).json({
          success: true,
          blocked: true,
          message: 'Your message has been received. If you are in crisis, please reach out for support.',
          safetyIntervention: true,
          crisisResources: {
            message: getEmergencyMessage('critical'),
            resources: [CRISIS_RESOURCES.us, CRISIS_RESOURCES.global],
          },
        });
        return;
      }

      if (level === 'high' && requireAcknowledgmentOnHigh) {
        const acknowledged = req.body.safetyAcknowledged === true;

        if (!acknowledged) {
          res.status(200).json({
            success: false,
            requiresAcknowledgment: true,
            message: 'We noticed your message contains some concerning content. Are you okay?',
            safetyCheck: true,
            options: [
              { id: 'ok', label: "I'm okay, just venting" },
              { id: 'support', label: 'I could use some support' },
              { id: 'crisis', label: 'I need help right now' },
            ],
          });
          return;
        }
      }

      next();
    } catch (error) {
      logger.error('Safety screening error, proceeding with submission', {
        error: serializeError(error),
        userId,
        correlationId,
        path: req.path,
      });
      next();
    }
  };
}

function determineSourceType(path: string): string {
  if (path.includes('/entries')) return 'entry';
  if (path.includes('/books')) return 'book';
  if (path.includes('/reflections')) return 'reflection';
  if (path.includes('/chat')) return 'chat';
  return 'entry';
}

function mapSeverityToLevel(severity: string | null): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  switch (severity) {
    case 'crisis':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

export const SAFETY_SCREENING_URL_PATTERNS = [
  /\/api\/app\/entries$/,
  /\/api\/app\/entries\/[^\/]+$/,
  /\/api\/app\/books$/,
  /\/api\/app\/books\/[^\/]+$/,
  /\/api\/app\/reflections$/,
  /\/api\/app\/reflections\/[^\/]+$/,
  /\/api\/app\/chat$/,
  /\/api\/app\/chat\/[^\/]+$/,
];

function shouldScreenUrl(originalUrl: string): boolean {
  const urlWithoutQuery = originalUrl.split('?')[0];
  return SAFETY_SCREENING_URL_PATTERNS.some(pattern => pattern.test(urlWithoutQuery));
}

export function createSafetyScreeningRouter(options?: {
  blockOnCrisis?: boolean;
  requireAcknowledgmentOnHigh?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  const middleware = safetyScreeningMiddleware(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const isContentMethod = req.method === 'POST' || req.method === 'PATCH';
    const matchesPattern = shouldScreenUrl(req.originalUrl);

    if (isContentMethod && matchesPattern) {
      logger.debug('Safety screening triggered', {
        method: req.method,
        originalUrl: req.originalUrl,
      });
      middleware(req, res, next);
    } else {
      next();
    }
  };
}

export function attachSafetyScreeningToRoutes(
  router: Router,
  options?: {
    blockOnCrisis?: boolean;
    requireAcknowledgmentOnHigh?: boolean;
  }
): void {
  const middleware = safetyScreeningMiddleware(options);

  const contentRoutes = [
    { method: 'post', path: '/entries' },
    { method: 'patch', path: '/entries/:id' },
    { method: 'post', path: '/books' },
    { method: 'patch', path: '/books/:id' },
    { method: 'post', path: '/reflections' },
    { method: 'patch', path: '/reflections/:id' },
  ];

  for (const route of contentRoutes) {
    const originalHandler = (router as { stack: Array<{ route?: { path: string; methods?: Record<string, boolean>; stack: Array<{ handle: unknown }> } }> }).stack.find(
      (layer: { route?: { path: string; methods?: Record<string, boolean> } }) => layer.route?.path === route.path && layer.route?.methods?.[route.method]
    );

    if (originalHandler) {
      const existingHandlers = originalHandler.route!.stack.map((s: { handle: unknown }) => s.handle);
      originalHandler.route!.stack = [];

      (router as unknown as Record<string, (...args: unknown[]) => void>)[route.method](route.path, middleware, ...existingHandlers);

      logger.debug('Safety screening attached to route', {
        method: route.method.toUpperCase(),
        path: route.path,
      });
    }
  }

  logger.info('Safety screening middleware attached to content routes', {
    routes: contentRoutes.map(r => `${r.method.toUpperCase()} ${r.path}`),
  });
}
