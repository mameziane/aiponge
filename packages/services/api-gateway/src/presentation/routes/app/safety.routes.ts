/**
 * Safety API Routes
 * Cross-cutting safety/risk assessment endpoints for therapeutic content
 *
 * All book/reflection submissions should pass through safety screening.
 * This module provides:
 * - Risk assessment endpoint
 * - Crisis resources endpoint
 * - Audit logging for compliance
 */

import { Router } from 'express';
import {
  ServiceLocator,
  createLogger,
  signUserIdHeader,
  serializeError,
  extractAuthContext,
  getValidation,
} from '@aiponge/platform-core';
import {
  CRISIS_RESOURCES,
  getCrisisResourceByRegion,
  getAllCrisisResources,
  getEmergencyMessage,
} from '@aiponge/shared-contracts/safety';
import { RiskAssessmentRequestSchema, getCorrelationId } from '@aiponge/shared-contracts';
import { wrapAsync } from '../helpers/routeHelpers';
const { validateBody } = getValidation();
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { sendSuccess } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = createLogger('safety-routes');
const router: Router = Router();

/**
 * POST /api/app/safety/assess-risk
 * Assess content for risk indicators and crisis signals
 */
router.post(
  '/assess-risk',
  injectAuthenticatedUserId,
  validateBody(RiskAssessmentRequestSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { text, sourceType, sourceId, localAssessment, context } = req.body;
    const correlationId = getCorrelationId(req) || 'unknown';

    logger.info('Safety assessment requested', {
      userId,
      sourceType,
      sourceId,
      hasLocalAssessment: !!localAssessment,
      correlationId,
    });

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
          content: text,
          userId,
          sourceType,
          sourceId,
          skipAI: false,
        }),
      });

      if (!response.ok) {
        logger.warn('User service safety analysis failed, using local assessment', {
          status: response.status,
          userId,
          correlationId,
        });

        if (localAssessment) {
          sendSuccess(res, {
            level: localAssessment.level,
            score: localAssessment.score,
            indicators: localAssessment.indicators || [],
            recommendedActions: getRecommendedActions(localAssessment.level),
            requiresImmediateAttention: localAssessment.level === 'critical' || localAssessment.level === 'high',
            assessedAt: new Date().toISOString(),
            source: 'local_fallback',
          });
          return;
        }

        sendSuccess(res, {
          level: 'none',
          score: 0,
          indicators: [],
          recommendedActions: [],
          requiresImmediateAttention: false,
          assessedAt: new Date().toISOString(),
          source: 'fallback',
        });
        return;
      }

      const result = (await response.json()) as {
        severity?: string;
        detected?: boolean;
        flagId?: string;
        type?: string;
        description?: string;
        matchedPatterns?: string[];
        aiConfidence?: number;
      };

      logSafetyAudit({
        userId,
        correlationId,
        sourceType,
        sourceId,
        severity: result.severity ?? null,
        detected: result.detected ?? false,
        flagId: result.flagId ?? null,
        action: result.severity === 'crisis' ? 'escalate' : 'log',
      });

      if (result.severity === 'crisis' || result.severity === 'high') {
        await triggerEscalation({
          userId,
          correlationId,
          severity: result.severity ?? null,
          type: result.type ?? null,
          description: result.description ?? null,
          flagId: result.flagId ?? null,
        });
      }

      const level = mapSeverityToLevel(result.severity ?? null);
      sendSuccess(res, {
        level,
        score: calculateScore(result.severity ?? null, result.matchedPatterns?.length || 0),
        indicators:
          result.matchedPatterns?.map((pattern: string) => ({
            category: result.type || 'unknown',
            detected: true,
            confidence: result.aiConfidence || 0.7,
            matchedPatterns: [pattern],
          })) || [],
        recommendedActions: getRecommendedActions(level),
        requiresImmediateAttention: level === 'critical' || level === 'high',
        assessedAt: new Date().toISOString(),
        flagId: result.flagId,
        source: 'server',
      });
    } catch (error) {
      logger.error('Safety assessment error', {
        error: serializeError(error),
        userId,
        correlationId,
      });

      if (localAssessment) {
        sendSuccess(res, {
          level: localAssessment.level,
          score: localAssessment.score,
          indicators: localAssessment.indicators || [],
          recommendedActions: getRecommendedActions(localAssessment.level),
          requiresImmediateAttention: localAssessment.level === 'critical' || localAssessment.level === 'high',
          assessedAt: new Date().toISOString(),
          source: 'local_fallback',
        });
        return;
      }

      sendSuccess(res, {
        level: 'none',
        score: 0,
        indicators: [],
        recommendedActions: [],
        requiresImmediateAttention: false,
        assessedAt: new Date().toISOString(),
        source: 'error_fallback',
      });
    }
  })
);

/**
 * GET /api/app/safety/resources
 * Get crisis resources by region
 */
router.get(
  '/resources',
  wrapAsync(async (req, res) => {
    const region = (req.query.region as string)?.toLowerCase() || 'global';
    const resources = getCrisisResourceByRegion(region);

    sendSuccess(res, {
      primary: resources,
      global: CRISIS_RESOURCES.global,
      allRegions: Object.keys(CRISIS_RESOURCES),
    });
  })
);

/**
 * GET /api/app/safety/resources/all
 * Get all crisis resources
 */
router.get(
  '/resources/all',
  wrapAsync(async (_req, res) => {
    sendSuccess(res, getAllCrisisResources());
  })
);

function mapSeverityToLevel(severity: string | null): string {
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

function calculateScore(severity: string | null, patternCount: number): number {
  const baseScores: Record<string, number> = {
    crisis: 80,
    high: 60,
    medium: 35,
    low: 15,
  };
  const base = baseScores[severity || ''] || 0;
  return Math.min(100, base + patternCount * 5);
}

function getRecommendedActions(level: string): Array<{
  type: string;
  priority: string;
  message: string;
  resourceUrl?: string;
}> {
  const actions: Array<{
    type: string;
    priority: string;
    message: string;
    resourceUrl?: string;
  }> = [];

  if (level === 'critical') {
    actions.push({
      type: 'escalate',
      priority: 'urgent',
      message: 'If you are in immediate danger, please contact emergency services or a crisis helpline.',
      resourceUrl: CRISIS_RESOURCES.global.url,
    });
    actions.push({
      type: 'show_resources',
      priority: 'urgent',
      message: 'Crisis support is available 24/7.',
      resourceUrl: CRISIS_RESOURCES.us.url,
    });
  } else if (level === 'high') {
    actions.push({
      type: 'suggest_support',
      priority: 'high',
      message: 'It sounds like you might be going through a difficult time. Support is available.',
      resourceUrl: CRISIS_RESOURCES.global.url,
    });
  } else if (level === 'medium') {
    actions.push({
      type: 'suggest_support',
      priority: 'medium',
      message: 'If you need someone to talk to, there are resources available.',
    });
  }

  return actions;
}

function logSafetyAudit(data: {
  userId: string;
  correlationId: string;
  sourceType: string;
  sourceId?: string;
  severity?: string | null;
  detected?: boolean;
  flagId?: string | null;
  action: string;
}): void {
  logger.info('SAFETY_AUDIT', {
    type: 'safety_assessment',
    userId: data.userId,
    correlationId: data.correlationId,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    severity: data.severity,
    detected: data.detected,
    flagId: data.flagId,
    action: data.action,
    timestamp: new Date().toISOString(),
  });
}

async function triggerEscalation(data: {
  userId: string;
  correlationId: string;
  severity?: string | null;
  type?: string | null;
  description?: string | null;
  flagId?: string | null;
}): Promise<void> {
  logger.warn('SAFETY_ESCALATION', {
    type: 'escalation_triggered',
    userId: data.userId,
    correlationId: data.correlationId,
    severity: data.severity,
    riskType: data.type,
    description: data.description,
    flagId: data.flagId,
    timestamp: new Date().toISOString(),
  });

  try {
    const systemServiceUrl = ServiceLocator.getServiceUrl('system-service');

    const response = await gatewayFetch(`${systemServiceUrl}/internal/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': data.correlationId,
        'x-gateway-service': 'api-gateway',
        'x-internal-service': 'api-gateway',
      },
      body: JSON.stringify({
        type: 'safety_escalation',
        severity: data.severity === 'crisis' ? 'critical' : 'high',
        title: `Safety Alert: ${data.severity} risk detected`,
        message: data.description || 'Risk indicators detected in user content',
        metadata: {
          userId: data.userId,
          riskType: data.type,
          flagId: data.flagId,
        },
      }),
    });

    if (!response.ok) {
      logger.error('Escalation alert returned non-OK status', {
        status: response.status,
        userId: data.userId,
        correlationId: data.correlationId,
        flagId: data.flagId,
      });
    }
  } catch (error) {
    logger.error('Failed to send escalation alert - will retry via scheduled job', {
      error: serializeError(error),
      userId: data.userId,
      correlationId: data.correlationId,
      flagId: data.flagId,
    });
  }
}

export default router;
