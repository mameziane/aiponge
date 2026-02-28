/**
 * Member Quote Routes
 * AI-generated personalized quote endpoints
 */

import { Router } from 'express';
import { ServiceLocator, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { ServiceErrors } from '../../utils/response-helpers';
import { sendStructuredError, createStructuredError } from '@aiponge/shared-contracts';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-quote.routes');

const router: Router = Router();

/**
 * POST /api/app/quote/generate
 * Generate a personalized quote for the user
 */
router.post(
  '/generate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');
    const requestId = (req.headers['x-request-id'] as string) || `quote-${Date.now()}`;

    logger.info('[QUOTE] Generating personalized quote', { userId, requestId });

    const AI_TIMEOUT_MS = 120000; // 2 minutes for AI content generation

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const response = await gatewayFetch(`${aiContentServiceUrl}/api/ai/quote/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          userId,
          userEntries: req.body.userEntries,
          emotionalState: req.body.emotionalState,
          userProfile: req.body.userProfile,
          theme: req.body.theme,
          language: req.body.language || req.headers['accept-language']?.split(',')[0] || 'en',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await parseErrorBody(response, '[QUOTE GENERATE]') as Record<string, unknown>;
        logger.warn('[QUOTE] AI service returned error', {
          userId,
          requestId,
          status: response.status,
          error: errorData.message,
        });

        res.status(response.status).json({
          success: false,
          message: errorData.message || 'Failed to generate quote',
          timestamp: new Date().toISOString(),
          requestId,
        });
        return;
      }

      const data = await response.json();
      logger.info('[QUOTE] Quote generated successfully', { userId, requestId });
      res.status(200).json(data);
    } catch (error) {
      clearTimeout(timeoutId);
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      logger.error('[QUOTE] Quote generation failed', {
        userId,
        requestId,
        errorType: isTimeout ? 'TIMEOUT' : 'EXCEPTION',
        error: serializeError(error),
        timeoutMs: AI_TIMEOUT_MS,
      });

      if (isTimeout) {
        sendStructuredError(
          res,
          504,
          createStructuredError('TIMEOUT', 'TimeoutError', 'AI service request timed out', {
            service: 'api-gateway',
            correlationId: requestId,
          })
        );
        return;
      }

      ServiceErrors.fromException(res, error, 'Failed to generate quote', req);
      return;
    }
  })
);

/**
 * GET /api/app/quote/generate
 * Generate a personalized quote for the user (GET variant for simpler calls)
 * Fetches a random user entry to personalize the quote
 */
router.get(
  '/generate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || `quote-${Date.now()}`;

    logger.info('[QUOTE] Generating personalized quote (GET)', { userId, requestId });

    const AI_TIMEOUT_MS = 120000; // 2 minutes for AI content generation
    const INTERNAL_TIMEOUT_MS = 10000; // 10s for internal service calls

    try {
      // Fetch recent entries from user to personalize the quote
      // Prioritize recent entries (last 10) for more relevant personalization
      let recentEntriesSummary: string | undefined;
      try {
        // Add timeout for internal entry fetch
        const entryController = new AbortController();
        const entryTimeoutId = setTimeout(() => entryController.abort(), INTERNAL_TIMEOUT_MS);

        const entriesResponse = await gatewayFetch(`${userServiceUrl}/api/entries/${userId}?limit=10&offset=0`, {
          headers: {
            'x-user-id': userId,
            'x-request-id': requestId,
          },
          signal: entryController.signal,
        });

        clearTimeout(entryTimeoutId);

        if (entriesResponse.ok) {
          const entriesData = (await entriesResponse.json()) as Record<string, unknown>;
          const entries = (entriesData.data as Record<string, unknown>)?.entries || entriesData.entries || entriesData.data || [];

          if (Array.isArray(entries) && entries.length > 0) {
            // Use the most recent entry primarily, with context from others
            const recentEntries = entries
              .slice(0, 5)
              .map((t: Record<string, unknown>) => t.content || t.text || t.body)
              .filter(Boolean);

            if (recentEntries.length > 0) {
              // Combine recent entries for richer context
              recentEntriesSummary =
                recentEntries.length === 1 ? String(recentEntries[0]) : `Recent reflections: ${recentEntries.join(' | ')}`;

              logger.debug('[QUOTE] Using recent entries for personalization', {
                userId,
                entryCount: recentEntries.length,
                totalEntries: entries.length,
              });
            }
          }
        }
      } catch (entryError) {
        logger.debug('[QUOTE] Could not fetch entries, using default', { userId });
      }

      // Add timeout for AI service call
      const aiController = new AbortController();
      const aiTimeoutId = setTimeout(() => aiController.abort(), AI_TIMEOUT_MS);

      const response = await gatewayFetch(`${aiContentServiceUrl}/api/ai/quote/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          userId,
          userEntries: recentEntriesSummary,
          theme: req.query.theme as string,
          language: (req.query.language as string) || req.headers['accept-language']?.split(',')[0] || 'en',
        }),
        signal: aiController.signal,
      });

      clearTimeout(aiTimeoutId);

      if (!response.ok) {
        const errorData = await parseErrorBody(response, '[QUOTE GENERATE GET]') as Record<string, unknown>;
        logger.warn('[QUOTE] AI service returned error', {
          userId,
          requestId,
          status: response.status,
          error: errorData.message,
        });

        res.status(response.status).json({
          success: false,
          message: errorData.message || 'Failed to generate quote',
          timestamp: new Date().toISOString(),
          requestId,
        });
        return;
      }

      const data = await response.json();
      logger.info('[QUOTE] Quote generated successfully (GET)', { userId, requestId });
      res.status(200).json(data);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      logger.error('[QUOTE] Quote generation failed (GET)', {
        userId,
        requestId,
        errorType: isTimeout ? 'TIMEOUT' : 'EXCEPTION',
        error: serializeError(error),
      });

      if (isTimeout) {
        sendStructuredError(
          res,
          504,
          createStructuredError('TIMEOUT', 'TimeoutError', 'AI service request timed out', {
            service: 'api-gateway',
            correlationId: requestId,
          })
        );
        return;
      }

      ServiceErrors.fromException(res, error, 'Failed to generate quote', req);
      return;
    }
  })
);

export default router;
