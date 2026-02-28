/**
 * Music Service Providers Routes
 * Simple, clean endpoint for admin aggregation
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();

const logger = getLogger('providers-routes');

const router = Router();

/**
 * GET /api/providers
 * Returns available music generation providers for admin dashboard
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Return standardized provider information for admin aggregation
    const providers = [
      {
        id: 'musicapi-ai',
        name: 'MusicAPI.ai',
        type: 'music-generation',
        status: 'active',
        description: 'Cultural and wellbeing-focused music generation',
        capabilities: ['cultural-styles', 'mood-based', 'therapeutic'],
        metadata: {
          apiVersion: 'v2',
          maxDuration: 180,
          supportedStyles: ['meditation', 'cultural', 'healing', 'ambient'],
        },
      },
      {
        id: 'elevenlabs-music',
        name: 'ElevenLabs Music',
        type: 'music-generation',
        status: 'active',
        description: 'Offers cutting-edge AI-driven music generation',
        capabilities: ['ai-composed', 'genre-diverse', 'high-fidelity'],
        metadata: {
          apiVersion: 'v1',
          maxDuration: 300,
          supportedStyles: ['classical', 'jazz', 'rock', 'pop'],
        },
      },
    ];

    sendSuccess(res, providers);
  } catch (error) {
    logger.error('Error fetching music providers', {
      module: 'providers_routes',
      operation: 'getProviders',
      endpoint: '/providers',
      error: serializeError(error),
      phase: 'providers_fetch_failed',
    });
    ServiceErrors.fromException(res, error, 'Failed to retrieve music providers', req);
    return;
  }
});

export default router;
