/**
 * Library Generation Routes - Track and album generation endpoints
 * Split from library-routes.ts for maintainability
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../../config/service-urls';
import { serviceAuthMiddleware, extractAuthContext, serializeError, isFeatureEnabled, getResponseHelpers } from '@aiponge/platform-core';
import { contextIsPrivileged, CONTENT_VISIBILITY, GENERATION_STATUS } from '@aiponge/shared-contracts';
import { FEATURE_FLAGS } from '@aiponge/shared-contracts/common';
import { enqueueGenerationJob } from '../../../application/services/GenerationQueueProcessor.js';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import {
  TrackGenerationService,
  type TrackGenerationDependencies,
} from '../../../application/services/TrackGenerationService';
import {
  AlbumGenerationService,
  type AlbumGenerationServiceDependencies,
} from '../../../application/services/AlbumGenerationService';
import type { ProgressUpdate } from '../../../application/services/AlbumGenerationPipeline';
import { GenerationSessionService } from '../../../application/shared/GenerationSessionService';
import { DrizzleAlbumRequestRepository } from '../../../infrastructure/database/DrizzleAlbumRequestRepository';
import { getServiceRegistry } from '../../../infrastructure/ServiceFactory';
import {
  libraryGenerateSchema,
  libraryAlbumGenerateSchema,
  type LibraryGenerateInput,
  MAX_TRACKS_PER_ALBUM,
} from '../../../schema/generation-schemas';

const logger = getLogger('music-service-library-generation-routes');

const inflightTasks = new Map<string, AbortController>();

function trackBackgroundTask(taskId: string): AbortController {
  ensureShutdownHandlers();
  const controller = new AbortController();
  inflightTasks.set(taskId, controller);
  logger.debug('Background task registered', { taskId, inflightCount: inflightTasks.size });
  return controller;
}

function untrackBackgroundTask(taskId: string): void {
  inflightTasks.delete(taskId);
  logger.debug('Background task completed', { taskId, inflightCount: inflightTasks.size });
}

function abortAllInflightTasks(): void {
  if (inflightTasks.size === 0) return;
  const taskIds = [...inflightTasks.keys()];
  logger.warn('Aborting inflight background tasks on shutdown', { count: taskIds.length, taskIds });
  for (const [taskId, controller] of inflightTasks) {
    controller.abort();
    logger.info('Aborted background task', { taskId });
  }
  inflightTasks.clear();
}

let shutdownHandlersRegistered = false;
function ensureShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;
  const handler = () => abortAllInflightTasks();
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}

const router = express.Router();

let albumRequestRepository: DrizzleAlbumRequestRepository | null = null;
async function getAlbumRequestRepository(): Promise<DrizzleAlbumRequestRepository | null> {
  if (!albumRequestRepository) {
    try {
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDatabase();
      albumRequestRepository = new DrizzleAlbumRequestRepository(db);
    } catch (error) {
      logger.error('Failed to initialize AlbumRequestRepository', { error });
    }
  }
  return albumRequestRepository;
}

let trackGenerationService: TrackGenerationService | null = null;
async function getTrackGenerationService(): Promise<TrackGenerationService | null> {
  if (!trackGenerationService) {
    try {
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleMusicCatalogRepository } =
        await import('../../../infrastructure/database/DrizzleMusicCatalogRepository');
      const { UnifiedAlbumRepository } = await import('../../../infrastructure/database/UnifiedAlbumRepository');
      const { UnifiedLyricsRepository } = await import('../../../infrastructure/database/UnifiedLyricsRepository');
      const { DrizzleUserTrackRepository } =
        await import('../../../infrastructure/database/DrizzleUserTrackRepository');
      const { StorageServiceClient } = await import('../../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../../application/services/LyricsPreparationService');

      const { createMusicOrchestrator } = await import('../../../domains/ai-music/providers');
      const db = getDatabase();
      const registry = getServiceRegistry();
      const deps: TrackGenerationDependencies = {
        lyricsRepository: new UnifiedLyricsRepository(db),
        albumRepository: new UnifiedAlbumRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        storageClient: registry.storageClient as import('../../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        db,
        musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
      };
      trackGenerationService = new TrackGenerationService(deps);
    } catch (error) {
      logger.error('Failed to initialize TrackGenerationService', { error });
    }
  }
  return trackGenerationService;
}

let albumGenerationService: AlbumGenerationService | null = null;
async function getAlbumGenerationService(): Promise<AlbumGenerationService | null> {
  if (!albumGenerationService) {
    try {
      const { StorageServiceClient } = await import('../../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../../application/services/LyricsPreparationService');
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleMusicCatalogRepository } =
        await import('../../../infrastructure/database/DrizzleMusicCatalogRepository');
      const { DrizzleUserTrackRepository } =
        await import('../../../infrastructure/database/DrizzleUserTrackRepository');
      const { UnifiedLyricsRepository } = await import('../../../infrastructure/database/UnifiedLyricsRepository');

      const { createMusicOrchestrator } = await import('../../../domains/ai-music/providers');
      const db = getDatabase();
      const registry = getServiceRegistry();
      const deps: AlbumGenerationServiceDependencies = {
        storageClient: registry.storageClient as import('../../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        lyricsRepository: new UnifiedLyricsRepository(db),
        musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
      };
      albumGenerationService = new AlbumGenerationService(deps);
    } catch (error) {
      logger.error('Failed to initialize AlbumGenerationService', { error });
    }
  }
  return albumGenerationService;
}

const internalAuthMiddleware = serviceAuthMiddleware({
  required: !!process.env.INTERNAL_SERVICE_SECRET,
  trustGateway: true,
});

router.post('/generate-track', internalAuthMiddleware, async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    const librarianUserId = authContext.userId;

    if (!authContext.isAuthenticated) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    if (!contextIsPrivileged(authContext)) {
      logger.warn('Unauthorized library generation attempt', { userId: librarianUserId, role: authContext.role });
      ServiceErrors.forbidden(res, 'Librarian role required for shared library generation', req);
      return;
    }

    const parseResult = libraryGenerateSchema.safeParse(req.body);
    if (!parseResult.success) {
      ServiceErrors.badRequest(res, 'Invalid request body', req, {
        fields: parseResult.error.format(),
      });
      return;
    }

    const service = await getTrackGenerationService();
    if (!service) {
      ServiceErrors.serviceUnavailable(res, 'Library generation service unavailable', req);
      return;
    }

    logger.info('Processing library generation request (async)', {
      librarianUserId,
      hasPrompt: !!parseResult.data.prompt,
      albumId: parseResult.data.albumId,
    });

    const validatedData = parseResult.data;
    const cleanedData: Partial<LibraryGenerateInput> = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== null && value !== undefined) {
        (cleanedData as Record<string, unknown>)[key] = value;
      }
    }

    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const sessionService = new GenerationSessionService(db, getServiceRegistry().storageClient as import('../../../infrastructure/clients/StorageServiceClient').StorageServiceClient);

    const session = await sessionService.create({
      userId: librarianUserId,
      targetVisibility: CONTENT_VISIBILITY.SHARED,
      entryId: cleanedData.entryId ?? undefined,
      requestPayload: cleanedData as Record<string, unknown>,
    });

    logger.info('Song request created for async library processing', {
      songRequestId: session.id,
      librarianUserId,
      entryId: cleanedData.entryId,
    });

    sendSuccess(res, {
      songRequestId: session.id,
      message: 'Generation started. Poll /api/app/music/song-requests/{id} for progress.',
    }, 202);

    if (isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
      const jobId = await enqueueGenerationJob({
        jobId: session.id,
        userId: librarianUserId,
        requestId: session.id,
        musicType: 'track',
        prompt: cleanedData.prompt || '',
        style: cleanedData.style as string | undefined,
        genre: cleanedData.genre as string | undefined,
        mood: cleanedData.mood as string | undefined,
        duration: (cleanedData as Record<string, unknown>).duration as number | undefined,
        culturalStyle: cleanedData.culturalStyle as string | undefined,
        instrumentType: cleanedData.instrumentType as string | undefined,
        entryId: cleanedData.entryId as string | undefined,
        lyricsId: cleanedData.lyricsId as string | undefined,
      });

      if (jobId) {
        return; // Already sent 202 response above, queue handles the rest
      }
      // If enqueue fails, fall through to setImmediate
      logger.warn('Failed to enqueue generation job, falling back to inline', { sessionId: session.id });
    }

    const taskController = trackBackgroundTask(session.id);

    setImmediate(async () => {
      try {
        if (taskController.signal.aborted) {
          await sessionService.markFailed(session.id, 'Generation aborted (server shutdown)').catch((err: unknown) => {
            logger.error('Failed to mark session as failed after abort; client may poll indefinitely', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
          });
          return;
        }
        await sessionService.updatePhase(session.id, 'generating_lyrics', 10);

        if (taskController.signal.aborted) {
          await sessionService.markFailed(session.id, 'Generation aborted (server shutdown)').catch((err: unknown) => {
            logger.error('Failed to mark session as failed after abort; client may poll indefinitely', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
          });
          return;
        }

        const result = await service.generate({
          ...cleanedData,
          userId: librarianUserId,
          targetVisibility: CONTENT_VISIBILITY.SHARED,
          sessionId: session.id,
        });

        if (taskController.signal.aborted) {
          logger.warn('Background task aborted after generation completed', { songRequestId: session.id });
          await sessionService.markFailed(session.id, 'Generation aborted (server shutdown)').catch((err: unknown) => {
            logger.error('Failed to mark session as failed after abort; client may poll indefinitely', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
          });
          return;
        }

        if (result.success && result.trackId && result.title) {
          logger.info('Background library generation completed', {
            songRequestId: session.id,
            trackId: result.trackId,
            hasArtwork: !!result.artworkUrl,
          });
        } else {
          await sessionService.markFailed(session.id, result.error || 'Generation failed');
          logger.error('Background library generation failed', {
            songRequestId: session.id,
            error: result.error,
          });
        }
      } catch (error) {
        const errorMsg = taskController.signal.aborted
          ? 'Generation aborted (server shutdown)'
          : (error instanceof Error ? error.message : 'Unknown error');
        await sessionService.markFailed(session.id, errorMsg).catch((err: unknown) => {
          logger.error('Failed to mark session as failed after exception; client may poll indefinitely', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
        });
        if (taskController.signal.aborted) {
          logger.info('Background task aborted during execution', { songRequestId: session.id });
        } else {
          logger.error('Background library generation exception', {
            songRequestId: session.id,
            error: errorMsg,
          });
        }
      } finally {
        untrackBackgroundTask(session.id);
      }
    });
  } catch (error) {
    logger.error('Library generate endpoint error', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to generate library track', req);
  }
});

router.post('/generate-album', internalAuthMiddleware, async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    const librarianUserId = authContext.userId;

    if (!authContext.isAuthenticated) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    if (!contextIsPrivileged(authContext)) {
      logger.warn('Unauthorized library album generation attempt', { userId: librarianUserId, role: authContext.role });
      ServiceErrors.forbidden(res, 'Librarian role required for shared library album generation', req);
      return;
    }

    logger.info('[ALBUM DEBUG] Received album generation request', {
      bodyKeys: Object.keys(req.body || {}),
      style: req.body?.style,
      styleType: typeof req.body?.style,
      vocalGender: req.body?.vocalGender,
      vocalGenderType: typeof req.body?.vocalGender,
    });

    const parseResult = libraryAlbumGenerateSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.error('[ALBUM DEBUG] Validation failed', {
        errors: parseResult.error.format(),
        rawBody: JSON.stringify(req.body).substring(0, 1000),
      });
      ServiceErrors.badRequest(res, 'Invalid request body', req, {
        fields: parseResult.error.format(),
      });
      return;
    }

    const service = await getAlbumGenerationService();
    if (!service) {
      ServiceErrors.serviceUnavailable(res, 'Library album generation service unavailable', req);
      return;
    }

    const data = parseResult.data;

    const SUPPORTED_LANGUAGES_COUNT = 7;
    const languageCount = data.languageMode === 'all' ? SUPPORTED_LANGUAGES_COUNT : 1;
    const totalTracks = data.entries.length * languageCount;

    if (totalTracks > MAX_TRACKS_PER_ALBUM) {
      ServiceErrors.badRequest(
        res,
        `Too many tracks: ${totalTracks} exceeds maximum of ${MAX_TRACKS_PER_ALBUM}. Reduce entries or use single language mode.`,
        req,
        {
          entryCount: data.entries.length,
          languageCount,
          totalTracks,
          maxTracks: MAX_TRACKS_PER_ALBUM,
        }
      );
      return;
    }

    const albumTitle = data.bookTitle;
    const albumRequestId = uuidv4();

    logger.info('Processing library album generation request (async)', {
      librarianUserId,
      albumRequestId,
      bookId: data.bookId,
      entryCount: data.entries.length,
      languageMode: data.languageMode || 'single',
      totalTracks,
    });

    const reqRepo = await getAlbumRequestRepository();
    if (reqRepo) {
      try {
        await reqRepo.create({
          id: albumRequestId,
          userId: librarianUserId,
          chapterId: data.chapterId || null,
          chapterTitle: data.chapterTitle || null,
          bookId: data.bookId,
          bookTitle: data.bookTitle,
          status: GENERATION_STATUS.PROCESSING,
          phase: 'queued',
          totalTracks: data.entries.length,
          currentTrack: 0,
          successfulTracks: 0,
          failedTracks: 0,
          percentComplete: 0,
          languageMode: data.languageMode || 'single',
          targetLanguages: data.targetLanguages || [],
          generatedLanguages: [],
          failedLanguages: [],
          trackResults: [],
          visibility: CONTENT_VISIBILITY.SHARED,
          requestPayload: req.body,
        });
      } catch (createErr) {
        logger.error('Failed to create album request record', {
          albumRequestId,
          error: serializeError(createErr),
        });
      }
    }

    sendSuccess(res, {
      albumRequestId,
      albumTitle,
      totalTracks: data.entries.length,
      status: GENERATION_STATUS.PROCESSING,
    }, 202);

    if (isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
      const jobId = await enqueueGenerationJob({
        jobId: albumRequestId,
        userId: librarianUserId,
        requestId: albumRequestId,
        musicType: 'album',
        prompt: data.bookTitle || '',
        style: data.style ?? undefined,
        genre: data.genre ?? undefined,
        mood: data.mood ?? undefined,
        culturalStyle: data.culturalStyle ?? undefined,
        instrumentType: data.instrumentType ?? undefined,
        parameters: {
          chapterId: data.chapterId || null,
          chapterTitle: data.chapterTitle || null,
          bookId: data.bookId,
          bookTitle: data.bookTitle,
          entries: data.entries,
          languageMode: data.languageMode,
          targetLanguages: data.targetLanguages,
        },
      });

      if (jobId) {
        return; // Already sent 202 response above, queue handles the rest
      }
      logger.warn('Failed to enqueue album generation job, falling back to inline', { albumRequestId });
    }

    const albumTaskController = trackBackgroundTask(albumRequestId);

    const markAlbumAborted = async () => {
      if (reqRepo) {
        await reqRepo.updateProgress(albumRequestId, {
          status: GENERATION_STATUS.FAILED,
          phase: GENERATION_STATUS.FAILED,
          errorMessage: 'Generation aborted (server shutdown)',
          completedAt: new Date(),
        }).catch(() => {});
      }
    };

    setImmediate(async () => {
      try {
        if (albumTaskController.signal.aborted) {
          await markAlbumAborted();
          return;
        }

        const perRequestProgressCallback = reqRepo
          ? async (progress: ProgressUpdate) => {
              if (albumTaskController.signal.aborted) return;
              try {
                await reqRepo.updateProgress(albumRequestId, {
                  status: progress.status || GENERATION_STATUS.PROCESSING,
                  phase: progress.phase || 'generating_track',
                  subPhase: progress.subPhase || null,
                  currentTrack: progress.currentTrack,
                  percentComplete: progress.percentComplete,
                  successfulTracks:
                    progress.successfulTracks ?? progress.trackResults?.filter((t) => t.success).length ?? 0,
                  failedTracks:
                    progress.failedTracks ?? progress.trackResults?.filter((t) => !t.success).length ?? 0,
                  trackResults: progress.trackResults || [],
                  trackCardDetails: progress.trackCardDetails || [],
                  albumArtworkUrl: progress.albumArtworkUrl,
                  albumTitle: progress.albumTitle || undefined,
                  startedAt: new Date(),
                });
              } catch (progressErr) {
                logger.warn('Failed to update progress', {
                  albumRequestId,
                  error: serializeError(progressErr),
                });
              }
            }
          : undefined;

        const result = await service.generate(
          {
            userId: librarianUserId,
            targetVisibility: CONTENT_VISIBILITY.SHARED,
            chapterId: data.chapterId || undefined,
            chapterTitle: data.chapterTitle || undefined,
            bookId: data.bookId,
            bookTitle: data.bookTitle,
            bookType: data.bookType ?? undefined,
            bookDescription: data.bookDescription ?? undefined,
            bookCategory: data.bookCategory ?? undefined,
            bookTags: data.bookTags ?? undefined,
            bookThemes: data.bookThemes ?? undefined,
            entries: data.entries,
            style: data.style ?? undefined,
            genre: data.genre ?? undefined,
            mood: data.mood ?? undefined,
            language: data.language ?? undefined,
            culturalLanguages: data.culturalLanguages ?? undefined,
            languageMode: data.languageMode ?? undefined,
            targetLanguages: data.targetLanguages ?? undefined,
            culturalStyle: data.culturalStyle ?? undefined,
            instrumentType: data.instrumentType ?? undefined,
            negativeTags: data.negativeTags ?? undefined,
            vocalGender: data.vocalGender ?? undefined,
            preCreatedAlbumId: data.preCreatedAlbumId ?? undefined,
            displayName: data.displayName ?? undefined,
          },
          perRequestProgressCallback
        );

        if (albumTaskController.signal.aborted) {
          logger.warn('Album background task aborted after generation completed', { albumRequestId });
          await markAlbumAborted();
          return;
        }

        if (reqRepo) {
          try {
            const updateData: Record<string, unknown> = {
              status: result.success ? GENERATION_STATUS.COMPLETED : GENERATION_STATUS.FAILED,
              phase: result.success ? GENERATION_STATUS.COMPLETED : GENERATION_STATUS.FAILED,
              successfulTracks: result.successfulTracks || 0,
              failedTracks: result.failedTracks || 0,
              percentComplete: 100,
              trackResults: result.tracks || [],
              errorMessage: result.error || null,
              completedAt: new Date(),
            };
            if (result.albumId) {
              updateData.albumId = result.albumId;
            }
            if (result.generatedLanguages && result.generatedLanguages.length > 0) {
              updateData.generatedLanguages = result.generatedLanguages;
            }
            if (result.failedLanguages && result.failedLanguages.length > 0) {
              updateData.failedLanguages = result.failedLanguages;
            }
            await reqRepo.updateProgress(albumRequestId, updateData);
          } catch (updateErr) {
            logger.error('Failed to update album request record', {
              albumRequestId,
              error: serializeError(updateErr),
            });
          }
        }

        if (result.success) {
          logger.info('Background library album generation completed', {
            albumRequestId,
            librarianUserId,
            albumId: result.albumId,
            successfulTracks: result.successfulTracks,
            failedTracks: result.failedTracks,
          });
        } else {
          logger.error('Background library album generation failed', {
            albumRequestId,
            librarianUserId,
            error: result.error,
          });
        }
      } catch (error) {
        if (albumTaskController.signal.aborted) {
          logger.info('Album background task aborted during execution', { albumRequestId });
          await markAlbumAborted();
          return;
        }
        if (reqRepo) {
          try {
            await reqRepo.updateProgress(albumRequestId, {
              status: GENERATION_STATUS.FAILED,
              phase: GENERATION_STATUS.FAILED,
              errorMessage: error instanceof Error ? error.message : String(error),
              completedAt: new Date(),
            });
          } catch (updateErr) {
            logger.error('Failed to update album request record on error', {
              albumRequestId,
              error: serializeError(updateErr),
            });
          }
        }

        logger.error('Background library album generation exception', {
          albumRequestId,
          librarianUserId,
          error: serializeError(error),
        });
      } finally {
        untrackBackgroundTask(albumRequestId);
      }
    });
  } catch (error) {
    logger.error('Library album generate endpoint error', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to generate library album', req);
  }
});

export default router;
