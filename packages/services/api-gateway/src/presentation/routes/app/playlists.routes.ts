/**
 * Member Playlists Routes
 * Playlist management and operations
 */

import { Router } from 'express';
import { ServiceLocator, extractAuthContext, getValidation } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { createPolicyRoute, wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { ServiceErrors } from '../../utils/response-helpers';
const { validateBody } = getValidation();
import { AddToPlaylistSchema, GeneratePlaylistArtworkSchema } from '@aiponge/shared-contracts/api/input-schemas';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-playlists.routes');

const router: Router = Router();

/**
 * GET /api/app/playlists/user/:userId
 * Get user's playlists
 */
router.get(
  '/user/:userId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/user/${req.params.userId}`,
    logPrefix: '[PLAYLISTS]',
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * GET /api/app/playlists/smart/:userId
 * Get smart playlists for a user
 */
router.get(
  '/smart/:userId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/smart/${req.params.userId}`,
    logPrefix: '[SMART PLAYLISTS]',
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * GET /api/app/playlists/smart/:userId/:smartKey/tracks
 * Get tracks for a smart playlist
 */
router.get(
  '/smart/:userId/:smartKey/tracks',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/smart/${req.params.userId}/${req.params.smartKey}/tracks`,
    logPrefix: '[SMART PLAYLIST TRACKS]',
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * POST /api/app/playlists/:playlistId/generate-artwork
 * Generate AI artwork for a playlist
 */
router.post(
  '/:playlistId/generate-artwork',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/${req.params.playlistId}/generate-artwork`,
    logPrefix: '[GENERATE ARTWORK]',
    middleware: [validateBody(GeneratePlaylistArtworkSchema)],
    transformResponse: (data: unknown) => {
      const d = data as Record<string, unknown>;
      const nested = d.data as Record<string, unknown> | undefined;
      return {
        success: true,
        data: {
          artworkUrl: nested?.artworkUrl || d.artworkUrl,
          revisedPrompt: nested?.revisedPrompt || d.revisedPrompt,
          processingTimeMs: nested?.processingTimeMs || d.processingTimeMs,
        },
      };
    },
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * GET /api/app/playlists/:playlistId/tracks
 * Get tracks in a playlist
 */
router.get(
  '/:playlistId/tracks',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/${req.params.playlistId}/tracks`,
    logPrefix: '[PLAYLIST TRACKS]',
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * POST /api/app/playlists/:playlistId/tracks
 * Add track to playlist
 */
router.post(
  '/:playlistId/tracks',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/playlists/${req.params.playlistId}/tracks`,
    logPrefix: '[ADD PLAYLIST TRACK]',
    middleware: [validateBody(AddToPlaylistSchema)],
    policies: {
      auth: { required: true, injectUserId: true },
    },
  })
);

/**
 * Generic proxy for other playlist routes
 * Handles GET, POST, PATCH, DELETE for /api/app/playlists/*
 */
router.all(
  '/*',
  wrapAsync(async (req, res) => {
    const path = req.path;
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');
    const targetUrl = `${musicServiceUrl}/api/playlists${path}`;

    const { userId } = extractAuthContext(req);

    logger.debug('Proxying playlist request', {
      method: req.method,
      path,
      targetUrl,
      userId: userId || 'none',
    });

    const options: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      options.body = JSON.stringify(req.body);
    }

    try {
      const response = await gatewayFetch(targetUrl, options);

      if (!response.ok) {
        const errorData = await parseErrorBody(response, '[PLAYLISTS PROXY]') as Record<string, unknown>;
        logger.error('Playlist proxy request failed', {
          targetUrl,
          status: response.status,
          errorData,
        });
        res.status(response.status).json({
          success: false,
          message: errorData.error || errorData.message || 'Playlist request failed',
        });
        return;
      }

      const data = (await response.json()) as Record<string, unknown>;
      res.json(data);
    } catch (fetchError) {
      logger.error('Playlist proxy fetch error', {
        targetUrl,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
      ServiceErrors.fromException(res, fetchError, 'Failed to connect to music service', req);
      return;
    }
  })
);

export default router;
