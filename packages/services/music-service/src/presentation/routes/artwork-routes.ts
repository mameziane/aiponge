/**
 * Artwork Generation Routes
 * Dedicated endpoint for generating artwork from lyrics
 */

import { Router } from 'express';
import { GenerateArtworkUseCase } from '../../application/use-cases/music/GenerateArtworkUseCase';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();

const router = Router();
const logger = getLogger('artwork-routes');

/**
 * Generate artwork from lyrics
 * POST /api/music/artwork
 * Body: { lyrics, title, style?, genre?, mood?, culturalStyle? }
 */
router.post('/artwork', async (req, res) => {
  try {
    const { lyrics, title, style, genre, mood, culturalStyle } = req.body;

    if (!lyrics || !title) {
      ServiceErrors.badRequest(res, 'Lyrics and title are required', req);
      return;
    }

    logger.info('🎨 Artwork generation request received', {
      title,
      lyricsLength: lyrics.length,
      style,
      genre,
      mood,
    });

    const useCase = new GenerateArtworkUseCase();
    const result = await useCase.execute({
      lyrics,
      title,
      style,
      genre,
      mood,
      culturalStyle,
    });

    if (result.success) {
      logger.info('✅ Artwork generated successfully', {
        title,
        artworkUrl: result.artworkUrl,
        processingTimeMs: result.processingTimeMs,
      });

      return sendSuccess(res, {
        artworkUrl: result.artworkUrl,
        revisedPrompt: result.revisedPrompt,
        processingTimeMs: result.processingTimeMs,
      });
    } else {
      logger.error('❌ Artwork generation failed', {
        title,
        error: result.error,
      });

      ServiceErrors.internal(res, result.error || 'Failed to generate artwork', undefined, req);
      return;
    }
  } catch (error) {
    logger.error('Artwork generation exception', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to generate artwork', req);
    return;
  }
});

export default router;
