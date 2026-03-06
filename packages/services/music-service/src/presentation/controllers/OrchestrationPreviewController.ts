/**
 * Orchestration Preview Controller
 * Handles preview track generation for orchestration flows (wellness, meditation, etc.).
 * Thin wrapper: delegates to existing TrackGenerationService via the same async pattern.
 */

import { Request, Response } from 'express';
import { getLogger } from '../../config/service-urls';
import { extractAuthContext, serializeError, getResponseHelpers } from '@aiponge/platform-core';
import type { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import { CONTENT_VISIBILITY, WellnessGenerateRequestSchema } from '@aiponge/shared-contracts';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import type {
  TrackGenerationService,
  TrackGenerationDependencies,
} from '../../application/services/TrackGenerationService';
import { GenerationSessionService } from '../../application/shared/GenerationSessionService';

const logger = getLogger('orchestration-preview-controller');
const { sendSuccess, ServiceErrors } = getResponseHelpers();

// Lazy-loaded singleton — same pattern as MusicGenerationController
let trackGenerationService: TrackGenerationService | null = null;
async function getTrackGenerationService(): Promise<TrackGenerationService | null> {
  if (!trackGenerationService) {
    try {
      const { getDatabase: getDb } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleUserTrackRepository } = await import('../../infrastructure/database/DrizzleUserTrackRepository');
      const { UnifiedAlbumRepository } = await import('../../infrastructure/database/UnifiedAlbumRepository');
      const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
      const { DrizzleMusicCatalogRepository } =
        await import('../../infrastructure/database/DrizzleMusicCatalogRepository');
      const { StorageServiceClient: StorageClient } = await import('../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../application/services/LyricsPreparationService');
      const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
      const { TrackGenerationService: TGS } = await import('../../application/services/TrackGenerationService');

      const db = getDb();
      const registry = getServiceRegistry();
      const deps: TrackGenerationDependencies = {
        lyricsRepository: new UnifiedLyricsRepository(db),
        albumRepository: new UnifiedAlbumRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        storageClient: registry.storageClient as InstanceType<typeof StorageClient>,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        db,
        musicProviderOrchestrator: createMusicOrchestrator(
          registry.providersClient as unknown as import('../../domains/ai-music/interfaces/IProviderClient').IProviderClient
        ),
      };
      trackGenerationService = new TGS(deps);
    } catch (error) {
      logger.error('Failed to initialize TrackGenerationService for orchestration', { error });
    }
  }
  return trackGenerationService;
}

export class OrchestrationPreviewController {
  /**
   * POST /api/orchestration/generate
   * Creates a preview track for a wellness flow session.
   * Returns 202 immediately; client polls GET /song-requests/:id for progress.
   */
  async generatePreview(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const parseResult = WellnessGenerateRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        ServiceErrors.badRequest(res, `Invalid request: ${parseResult.error.message}`, req);
        return;
      }

      const { sessionId, firstTrack } = parseResult.data;
      const registry = getServiceRegistry();

      const sessionService = new GenerationSessionService(registry.db, registry.storageClient as StorageServiceClient);

      // Create a song request session for progress tracking
      const session = await sessionService.create({
        userId,
        targetVisibility: CONTENT_VISIBILITY.PERSONAL,
        requestPayload: { sessionId, firstTrack } as Record<string, unknown>,
      });

      // Return 202 immediately — client polls for progress
      sendSuccess(res, { requestId: session.id, sessionId }, 202);

      // Run generation in background (non-blocking)
      setImmediate(async () => {
        try {
          const service = await getTrackGenerationService();
          if (!service) {
            await sessionService.markFailed(session.id, 'TrackGenerationService unavailable');
            return;
          }

          await sessionService.updatePhase(session.id, 'generating_lyrics', 10);

          const result = await service.generate({
            userId,
            sessionId: session.id,
            prompt: firstTrack.prompt,
            mood: firstTrack.mood,
            genre: firstTrack.genre,
            style: firstTrack.style,
            targetVisibility: CONTENT_VISIBILITY.PERSONAL,
          });

          if (result.success && result.trackId) {
            await sessionService.markCompleted(
              session.id,
              result.trackId,
              result.title || 'Preview Track',
              result.artworkUrl
            );
            logger.info('Orchestration preview track generated', {
              sessionId,
              trackId: result.trackId,
              userId,
            });
          } else {
            await sessionService.markFailed(session.id, result.error || 'Track generation failed');
            logger.error('Orchestration preview track generation failed', {
              sessionId,
              error: result.error,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          await sessionService.markFailed(session.id, errorMsg);
          logger.error('Orchestration preview generation error', { error: serializeError(error) });
        }
      });
    } catch (error) {
      logger.error('Generate preview error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to generate preview', req);
    }
  }

  /**
   * GET /api/orchestration/generate/:sessionId/status
   * Proxies to existing song-request progress endpoint.
   */
  async getPreviewStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const { DrizzleSongRequestRepository } =
        await import('../../infrastructure/database/DrizzleSongRequestRepository');
      const { db } = getServiceRegistry();
      const songRequestRepo = new DrizzleSongRequestRepository(db);
      const progress = await songRequestRepo.findById(sessionId);

      if (!progress) {
        ServiceErrors.notFound(res, 'Preview session', req);
        return;
      }

      sendSuccess(res, {
        status: progress.status === 'completed' ? 'completed' : progress.status === 'failed' ? 'failed' : 'processing',
        phase: progress.phase || null,
        percentComplete: progress.percentComplete || 0,
        previewTrack:
          progress.status === 'completed'
            ? {
                id: progress.trackId,
                title: progress.trackTitle || 'Preview Track',
                streamUrl: progress.streamingUrl || null,
                artworkUrl: progress.artworkUrl || null,
                status: 'draft',
                visibility: 'personal',
              }
            : null,
        errorMessage: progress.errorMessage || undefined,
      });
    } catch (error) {
      logger.error('Get preview status error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get preview status', req);
    }
  }

  /**
   * POST /api/orchestration/regenerate
   * Same as generatePreview but with optional feedback for refinement.
   */
  async regeneratePreview(req: Request, res: Response): Promise<void> {
    // Regenerate uses the same pipeline — feedback is incorporated into the prompt
    const feedback = req.body?.feedback;
    if (feedback && typeof feedback === 'string') {
      req.body.firstTrack = req.body.firstTrack || {};
      req.body.firstTrack.prompt = `${req.body.firstTrack.prompt}\n\nUser feedback: ${feedback}`;
    }
    return this.generatePreview(req, res);
  }
}
