import { Request, Response } from 'express';
import { z } from 'zod';
import { ContentVisibilitySchema, CONTENT_VISIBILITY, isPrivilegedRole, normalizeRole } from '@aiponge/shared-contracts';
import { DrizzleAlbumRequestRepository } from '../../infrastructure/database/DrizzleAlbumRequestRepository';
import { ProcessAudioUseCase } from '../../application/use-cases/music/ProcessAudioUseCase';

const SUPPORTED_LANGUAGES = ['en-US', 'es-ES', 'de-DE', 'fr-FR', 'pt-BR', 'ar', 'ja-JP'] as const;
import { getLogger } from '../../config/service-urls';
import { serializeError, createControllerHelpers, extractAuthContext, isFeatureEnabled, getResponseHelpers } from '@aiponge/platform-core';
import { FEATURE_FLAGS } from '@aiponge/shared-contracts/common';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { createAlbum } from '../../application/helpers/AlbumCreator';
import type {
  DrizzleSongRequestRepository,
  SongRequestPhase,
} from '../../infrastructure/database/DrizzleSongRequestRepository';
import { ErrorClassifier, PipelineErrorCode } from '../../application/errors';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { sql } from 'drizzle-orm';
import { asyncJobExecutor, type JobProgressUpdate } from '../../application/services/AsyncJobExecutor';
import { v4 as uuidv4 } from 'uuid';
import {
  enqueueGenerationJob,
} from '../../application/services/GenerationQueueProcessor';
import {
  TrackGenerationService,
  type TrackGenerationDependencies,
} from '../../application/services/TrackGenerationService';
import {
  AlbumGenerationService,
  type AlbumGenerationServiceDependencies,
} from '../../application/services/AlbumGenerationService';
import type { ProgressUpdate } from '../../application/services/AlbumGenerationPipeline';
import { GenerationSessionService } from '../../application/shared/GenerationSessionService';
import {
  userGenerateSchema,
  userAlbumGenerateSchema,
  type UserGenerateInput,
  type UserGenerationRequest,
  MAX_TOTAL_TRACKS_PER_USER_ALBUM,
} from '../../schema/generation-schemas';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import { UserServiceClient } from '../../infrastructure/clients/UserServiceClient';

const logger = getLogger('music-service-musicgenerationcontroller');

const { handleRequest } = createControllerHelpers('music-service', (res, error, msg, req) =>
  ServiceErrors.fromException(res, error, msg, req)
);

const generateMusicSchema = z.object({
  userId: z.string().min(1),
  entryId: z.string().optional(),
  lyricsId: z.string().optional(),
  musicType: z.enum(['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop']),
  prompt: z.string().min(1).max(5000),
  style: z.string().optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  tempo: z.number().min(40).max(200).optional(),
  key: z.string().optional(),
  duration: z.number().min(5).max(600).optional(),
  culturalStyle: z.string().optional(),
  instrumentType: z.string().optional(),
  wellbeingPurpose: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  parameters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const processAudioSchema = z.object({
  audioUrl: z.string().url(),
  processingType: z.enum(['normalize', 'master', 'effects', 'convert', 'enhance']),
  outputFormat: z.enum(['mp3', 'wav', 'flac', 'aac', 'ogg']).optional(),
  bitrate: z.number().optional(),
  sampleRate: z.number().optional(),
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
  effects: z
    .array(
      z.object({
        type: z.enum(['reverb', 'delay', 'chorus', 'compressor', 'equalizer', 'limiter', 'distortion']),
        parameters: z.record(z.unknown()),
        intensity: z.number().min(0).max(1),
      })
    )
    .optional(),
});

const entryContentSchema = z
  .object({
    content: z.string().min(1),
    updatedAt: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const generateFromEntrySchema = z.object({
  userId: z.string().min(1),
  entryId: z.string().nullable().optional(),
  lyricsId: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  entryContent: entryContentSchema,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  musicType: z.enum(['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop']).default('song'),
  style: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  culturalStyle: z.string().nullable().optional(),
  instrumentType: z.string().nullable().optional(),
  negativeTags: z.string().nullable().optional(),
  styleWeight: z.number().nullable().optional(),
  vocalGender: z.enum(['f', 'm']).nullable().optional(),
});

const generateAlbumFromChapterSchema = z.object({
  userId: z.string().min(1),
  chapterId: z.string().min(1),
  chapterTitle: z.string().min(1),
  bookId: z.string().min(1),
  bookTitle: z.string().min(1),
  bookType: z.string().nullable().optional(),
  bookDescription: z.string().nullable().optional(),
  bookCategory: z.string().nullable().optional(),
  bookTags: z.array(z.string()).nullable().optional(),
  bookThemes: z.array(z.string()).nullable().optional(),
  entries: z
    .array(
      z.object({
        entryId: z.string().min(1),
        content: z.string(),
        order: z.number(),
      })
    )
    .min(1)
    .max(20),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  style: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  culturalLanguages: z.array(z.string()).nullable().optional(),
  languageMode: z.enum(['single', 'all']).optional(),
  targetLanguages: z.array(z.enum(['en-US', 'es-ES', 'de-DE', 'fr-FR', 'pt-BR', 'ar', 'ja-JP'])).optional(),
  culturalStyle: z.string().nullable().optional(),
  instrumentType: z.string().nullable().optional(),
  negativeTags: z.string().nullable().optional(),
  vocalGender: z.enum(['f', 'm']).nullable().optional(),
  preCreatedAlbumId: z.string().uuid().optional(),
});

const userServiceClient = getServiceRegistry().userClient as UserServiceClient;

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
      const { StorageServiceClient } = await import('../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../application/services/LyricsPreparationService');

      const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
      const db = getDb();
      const registry = getServiceRegistry();
      const deps: TrackGenerationDependencies = {
        lyricsRepository: new UnifiedLyricsRepository(db),
        albumRepository: new UnifiedAlbumRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        storageClient: registry.storageClient as import('../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        db,
        musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
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
      const { StorageServiceClient } = await import('../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../application/services/LyricsPreparationService');
      const { getDatabase: getDb } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleMusicCatalogRepository } =
        await import('../../infrastructure/database/DrizzleMusicCatalogRepository');
      const { DrizzleUserTrackRepository } = await import('../../infrastructure/database/DrizzleUserTrackRepository');
      const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');

      const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
      const db = getDb();
      const registry = getServiceRegistry();
      const deps: AlbumGenerationServiceDependencies = {
        storageClient: registry.storageClient as import('../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        lyricsRepository: new UnifiedLyricsRepository(db),
        musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
      };
      albumGenerationService = new AlbumGenerationService(deps);
    } catch (error) {
      logger.error('Failed to initialize AlbumGenerationService', { error });
    }
  }
  return albumGenerationService;
}

let albumRequestRepository: DrizzleAlbumRequestRepository | null = null;
async function getAlbumRequestRepository(): Promise<DrizzleAlbumRequestRepository | null> {
  if (!albumRequestRepository) {
    try {
      const { getDatabase: getDb } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDb();
      albumRequestRepository = new DrizzleAlbumRequestRepository(db);
    } catch (error) {
      logger.error('Failed to initialize AlbumRequestRepository', { error });
    }
  }
  return albumRequestRepository;
}

export { generateMusicSchema };

export class MusicGenerationController {
  private controllerAlbumRequestRepository?: DrizzleAlbumRequestRepository;
  private songRequestRepository?: DrizzleSongRequestRepository;

  constructor(private readonly processAudioUseCase: ProcessAudioUseCase) {}

  setAlbumRequestRepository(repository: DrizzleAlbumRequestRepository): void {
    this.controllerAlbumRequestRepository = repository;
  }

  setSongRequestRepository(repository: DrizzleSongRequestRepository): void {
    this.songRequestRepository = repository;
  }

  async getAlbumProgress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const { userId } = extractAuthContext(req);

      if (!id) {
        ServiceErrors.badRequest(res, 'Album request ID is required', req);
        return;
      }

      if (!this.controllerAlbumRequestRepository) {
        ServiceErrors.internal(res, 'Album request repository not configured', undefined, req);
        return;
      }

      const progress = await this.controllerAlbumRequestRepository.getProgress(id);

      if (!progress) {
        ServiceErrors.notFound(res, 'Album request', req);
        return;
      }

      if (progress.userId !== userId) {
        ServiceErrors.forbidden(res, 'Not authorized to view this album request', req);
        return;
      }

      sendSuccess(res, progress);
    } catch (error) {
      logger.error('Get album progress error:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
    }
  }

  async getSongProgress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const { userId } = extractAuthContext(req);

      if (!id) {
        ServiceErrors.badRequest(res, 'Song request ID is required', req);
        return;
      }

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!this.songRequestRepository) {
        ServiceErrors.internal(res, 'Song request repository not configured', undefined, req);
        return;
      }

      const progress = await this.songRequestRepository.getProgress(id);

      if (!progress) {
        ServiceErrors.notFound(res, 'Song request', req);
        return;
      }

      if (progress.userId !== userId) {
        ServiceErrors.forbidden(res, 'Not authorized to view this song request', req);
        return;
      }

      sendSuccess(res, progress);
    } catch (error) {
      logger.error('Get song progress error:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get song progress', req);
    }
  }

  async getActiveSongRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      if (!this.songRequestRepository) {
        ServiceErrors.internal(res, 'Song request repository not configured', undefined, req);
        return;
      }

      const songRequest = await this.songRequestRepository.findActiveByUserId(userId);

      if (!songRequest) {
        sendSuccess(res, null);
        return;
      }

      const progress = await this.songRequestRepository.getProgress(songRequest.id);

      sendSuccess(res, progress);
    } catch (error) {
      logger.error('Get active song request error:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get active song request', req);
    }
  }

  async getActiveAlbumRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      if (!this.controllerAlbumRequestRepository) {
        ServiceErrors.internal(res, 'Album request repository not configured', undefined, req);
        return;
      }

      const albumRequest = await this.controllerAlbumRequestRepository.findActiveByUserId(userId);

      if (!albumRequest) {
        sendSuccess(res, null);
        return;
      }

      const progress = await this.controllerAlbumRequestRepository.getProgress(albumRequest.id);

      sendSuccess(res, progress);
    } catch (error) {
      logger.error('Get active album request error:', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
    }
  }

  async getAllActiveAlbumRequests(req: Request, res: Response): Promise<void> {
    const { userId } = extractAuthContext(req);

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    if (!this.controllerAlbumRequestRepository) {
      ServiceErrors.internal(res, 'Album request repository not configured', undefined, req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get all active album requests',
      handler: async () => {
        const activeRequests = await this.controllerAlbumRequestRepository!.findAllActiveByUserId(userId);

        const progressList = await Promise.all(
          activeRequests.map(request => this.controllerAlbumRequestRepository!.getProgress(request.id))
        );

        return progressList.filter(Boolean);
      },
    });
  }

  async generateTrack(req: Request, res: Response): Promise<void> {
    try {
      const { userId, role: userRole } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const parseResult = userGenerateSchema.safeParse(req.body);
      if (!parseResult.success) {
        ServiceErrors.badRequest(res, 'Invalid request body', req, {
          fields: parseResult.error.format(),
        });
        return;
      }

      const normalizedRole = normalizeRole(userRole);
      const hasPrivilegedAccess = isPrivilegedRole(normalizedRole);

      if (!hasPrivilegedAccess) {
        const quotaResult = await userServiceClient.checkQuota(userId, 'songs', normalizedRole);

        if (!quotaResult.success || !quotaResult.allowed) {
          const code = quotaResult.code || 'QUOTA_EXCEEDED';
          const reason = quotaResult.reason || 'Unable to generate music at this time';
          logger.info('Quota check denied for track generation', {
            userId,
            code,
            subscription: quotaResult.subscription,
            credits: quotaResult.credits,
          });
          ServiceErrors.forbidden(res, reason, req, {
            code,
            subscription: quotaResult.subscription,
            credits: quotaResult.credits,
            shouldUpgrade: quotaResult.shouldUpgrade,
            upgradeMessage: quotaResult.upgradeMessage,
          });
          return;
        }

        logger.info('Quota check passed for track generation', {
          userId,
          tier: quotaResult.subscription?.tier,
          creditsAvailable: quotaResult.credits?.currentBalance,
        });
      }

      const service = await getTrackGenerationService();
      if (!service) {
        ServiceErrors.serviceUnavailable(res, 'User track generation service unavailable', req);
        return;
      }

      logger.info('/generate-track called', {
        genres: parseResult.data.genres,
        genre: parseResult.data.genre,
        vocalGender: parseResult.data.vocalGender,
        instrumentType: parseResult.data.instrumentType,
        style: parseResult.data.style,
        mood: parseResult.data.mood,
      });

      logger.info('Processing user track generation request (async)', {
        userId,
        hasPrompt: !!parseResult.data.prompt,
        albumId: parseResult.data.albumId,
        hasArtworkUrl: !!parseResult.data.artworkUrl,
        artworkUrlValue: parseResult.data.artworkUrl?.substring?.(0, 80),
        hasPictureContext: !!parseResult.data.pictureContext,
        hasEntryId: !!parseResult.data.entryId,
        hasEntryContent: !!parseResult.data.entryContent,
        rawBodyKeys: Object.keys(req.body || {}),
        rawHasArtworkUrl: !!req.body?.artworkUrl,
      });

      const validatedData = parseResult.data;
      const cleanedData: Partial<UserGenerateInput> = {};
      for (const [key, value] of Object.entries(validatedData)) {
        if (value !== null && value !== undefined) {
          (cleanedData as Record<string, unknown>)[key] = value;
        }
      }

      const { getDatabase: getDb } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDb();
      const sessionService = new GenerationSessionService(db, getServiceRegistry().storageClient as import('../../infrastructure/clients/StorageServiceClient').StorageServiceClient);

      const session = await sessionService.create({
        userId,
        targetVisibility: CONTENT_VISIBILITY.PERSONAL,
        entryId: cleanedData.entryId ?? undefined,
        requestPayload: cleanedData as Record<string, unknown>,
      });

      logger.info('Song request created for async processing', {
        songRequestId: session.id,
        userId,
        entryId: cleanedData.entryId,
      });

      sendSuccess(res, {
        songRequestId: session.id,
        message: 'Generation started. Poll /api/app/music/song-requests/{id} for progress.',
      }, 202);

      if (isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
        const jobId = await enqueueGenerationJob({
          jobId: session.id,
          userId,
          requestId: session.id,
          musicType: 'track',
          prompt: parseResult.data.prompt || '',
          style: parseResult.data.style as string | undefined,
          mood: parseResult.data.mood as string | undefined,
          genre: (parseResult.data.genre as string) || (parseResult.data.genres?.[0] as string | undefined),
          parameters: {
            existingLyrics: parseResult.data.existingLyrics,
            artworkPrompt: parseResult.data.artworkPrompt,
            albumId: parseResult.data.albumId,
            language: parseResult.data.language,
            playOnDate: parseResult.data.playOnDate,
          },
        });

        if (jobId) {
          return;
        }
        logger.warn('Failed to enqueue generation job, falling back to inline', { sessionId: session.id });
      }

      setImmediate(async () => {
        try {
          await sessionService.updatePhase(session.id, 'generating_lyrics', 10);

          const generationRequest: UserGenerationRequest = {
            ...cleanedData,
            userId,
            playOnDate: typeof cleanedData.playOnDate === 'string' ? new Date(cleanedData.playOnDate) : undefined,
            sessionId: session.id,
          };

          const result = await service.generate(generationRequest);

          if (result.success && result.trackId && result.title) {
            logger.info('Background generation completed', {
              songRequestId: session.id,
              trackId: result.trackId,
              hasArtwork: !!result.artworkUrl,
            });

            if (!hasPrivilegedAccess) {
              const usageResult = await userServiceClient.incrementUsage(userId, 'songs');
              if (!usageResult.success) {
                logger.error('Failed to increment usage after track generation', {
                  userId,
                  songRequestId: session.id,
                  error: usageResult.error,
                });
              }
            }
          } else {
            await sessionService.markFailed(session.id, result.error || 'Generation failed');
            logger.error('Background generation failed', {
              songRequestId: session.id,
              error: result.error,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          await sessionService.markFailed(session.id, errorMsg);
          logger.error('Background generation exception', {
            songRequestId: session.id,
            error: errorMsg,
          });
        }
      });
    } catch (error) {
      logger.error('User generate endpoint error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate user track', req);
    }
  }

  async generateAlbum(req: Request, res: Response): Promise<void> {
    try {
      const { userId, role: userRole } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const parseResult = userAlbumGenerateSchema.safeParse(req.body);
      if (!parseResult.success) {
        logger.error('Album generation validation failed', {
          userId,
          errors: parseResult.error.format(),
          receivedBody: JSON.stringify(req.body).substring(0, 500),
        });
        ServiceErrors.badRequest(res, 'Invalid request body', req, {
          fields: parseResult.error.format(),
        });
        return;
      }

      const service = await getAlbumGenerationService();
      if (!service) {
        ServiceErrors.serviceUnavailable(res, 'User album generation service unavailable', req);
        return;
      }

      const data = parseResult.data;

      const normalizedRole = normalizeRole(userRole);
      const hasPrivilegedAccess = isPrivilegedRole(normalizedRole);

      if (data.entries.length === 0) {
        ServiceErrors.badRequest(res, 'No entries provided for album generation', req, { code: 'NO_ENTRIES' });
        return;
      }

      if (data.entries.length > 20) {
        ServiceErrors.badRequest(res, 'Maximum 20 tracks per album allowed', req, { code: 'TOO_MANY_TRACKS' });
        return;
      }

      if (data.languageMode === 'all' && !hasPrivilegedAccess) {
        ServiceErrors.forbidden(res, 'Multi-language album generation is only available to librarians', req);
        return;
      }

      const SUPPORTED_LANGUAGES_COUNT = 7;
      const languageCount = data.languageMode === 'all' ? SUPPORTED_LANGUAGES_COUNT : 1;
      const totalTracks = data.entries.length * languageCount;

      if (totalTracks > MAX_TOTAL_TRACKS_PER_USER_ALBUM) {
        ServiceErrors.badRequest(
          res,
          `Too many tracks: ${totalTracks} exceeds maximum of ${MAX_TOTAL_TRACKS_PER_USER_ALBUM}. Reduce entries or use single language mode.`,
          req,
          {
            entryCount: data.entries.length,
            languageCount,
            totalTracks,
            maxTracks: MAX_TOTAL_TRACKS_PER_USER_ALBUM,
          }
        );
        return;
      }

      let creditCost = totalTracks;
      let reservationId: string | undefined;

      if (!hasPrivilegedAccess) {
        const quotaResult = await userServiceClient.checkQuota(userId, 'songs', normalizedRole, totalTracks);

        if (!quotaResult.success || !quotaResult.allowed) {
          const code = quotaResult.code || 'QUOTA_EXCEEDED';
          const reason = quotaResult.reason || 'Insufficient credits for album generation';
          logger.info('Quota check denied for album generation', {
            userId,
            code,
            totalTracks,
            credits: quotaResult.credits,
          });
          ServiceErrors.forbidden(res, reason, req, {
            code,
            credits: quotaResult.credits,
            shouldUpgrade: quotaResult.shouldUpgrade,
            upgradeMessage: quotaResult.upgradeMessage,
          });
          return;
        }

        creditCost = quotaResult.credits?.required ?? totalTracks;

        if (creditCost > 0) {
          const creditDescription =
            data.languageMode === 'all'
              ? `Multi-language album (${data.entries.length} entries × ${languageCount} languages = ${totalTracks} tracks)`
              : `Album generation (${data.entries.length} tracks)`;

          const reserveResult = await userServiceClient.reserveCredits(userId, creditCost, creditDescription, {
            albumGeneration: true,
            trackCount: data.entries.length,
            languageMode: data.languageMode,
            languageCount,
            totalTracks,
          });

          if (!reserveResult.success || !reserveResult.reservationId) {
            logger.error('Credit reservation failed for album', {
              userId,
              creditCost,
              error: reserveResult.error,
            });
            ServiceErrors.paymentRequired(
              res,
              reserveResult.error || 'Unable to reserve credits for album generation',
              req,
              { code: 'CREDIT_RESERVATION_FAILED' }
            );
            return;
          }

          reservationId = reserveResult.reservationId;
          logger.info('Credits reserved for album', { userId, amount: creditCost, reservationId });
        }
      } else {
        creditCost = 0;
      }

      const albumTitle = data.chapterTitle;
      const albumRequestId = uuidv4();

      logger.info('Processing user album generation request (async)', {
        userId,
        albumRequestId,
        chapterId: data.chapterId,
        entryCount: data.entries.length,
        languageMode: data.languageMode || 'single',
        totalTracks,
      });

      const reqRepo = await getAlbumRequestRepository();
      if (reqRepo) {
        try {
          await reqRepo.create({
            id: albumRequestId,
            userId,
            chapterId: data.chapterId,
            chapterTitle: data.chapterTitle,
            bookId: data.bookId,
            bookTitle: data.bookTitle,
            status: 'processing',
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
            visibility: CONTENT_VISIBILITY.PERSONAL,
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
        status: 'processing',
      }, 202);

      if (isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
        const jobId = await enqueueGenerationJob({
          jobId: albumRequestId,
          userId,
          requestId: albumRequestId,
          musicType: 'album',
          prompt: data.chapterTitle || '',
          style: data.style ?? undefined,
          genre: data.genre ?? undefined,
          mood: data.mood ?? undefined,
          culturalStyle: data.culturalStyle ?? undefined,
          instrumentType: data.instrumentType ?? undefined,
          parameters: {
            chapterId: data.chapterId,
            chapterTitle: data.chapterTitle,
            bookId: data.bookId,
            bookTitle: data.bookTitle,
            entries: data.entries,
            languageMode: data.languageMode,
            targetLanguages: data.targetLanguages,
          },
        });

        if (jobId) {
          return;
        }
        logger.warn('Failed to enqueue album generation job, falling back to inline', { albumRequestId });
      }

      setImmediate(async () => {
        try {
          const perRequestProgressCallback = reqRepo
            ? async (progress: ProgressUpdate) => {
                try {
                  await reqRepo.updateProgress(albumRequestId, {
                    status: progress.status || 'processing',
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
              userId,
              targetVisibility: CONTENT_VISIBILITY.PERSONAL,
              chapterId: data.chapterId ?? undefined,
              chapterTitle: data.chapterTitle ?? undefined,
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
              styleWeight: data.styleWeight ?? undefined,
              preCreatedAlbumId: data.preCreatedAlbumId ?? undefined,
              displayName: data.displayName ?? undefined,
            },
            perRequestProgressCallback
          );

          if (reqRepo) {
            try {
              const updateData: Record<string, unknown> = {
                status: result.success ? 'completed' : 'failed',
                phase: result.success ? 'completed' : 'failed',
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

          const successfulTracks = result.successfulTracks || 0;

          if (result.success) {
            logger.info('Background album generation completed', {
              albumRequestId,
              userId,
              albumId: result.albumId,
              successfulTracks,
              failedTracks: result.failedTracks,
            });
          } else {
            logger.error('Background album generation failed', {
              albumRequestId,
              userId,
              error: result.error,
            });
          }

          if (!hasPrivilegedAccess && reservationId) {
            const actualCost = successfulTracks > 0
              ? Math.min(creditCost, Math.max(successfulTracks, Math.round((creditCost * successfulTracks) / data.entries.length)))
              : 0;

            if (actualCost > 0) {
              const settleResult = await userServiceClient.settleReservation(reservationId, userId, actualCost, {
                successfulTracks,
                failedTracks: data.entries.length - successfulTracks,
                trackCount: data.entries.length,
              });
              if (!settleResult.success) {
                logger.error('Credit settlement failed for album - attempting cancellation', {
                  albumRequestId,
                  reservationId,
                  actualCost,
                  error: settleResult.error,
                });
                await userServiceClient.cancelReservation(reservationId, userId, `Settlement failed: ${settleResult.error}`);
              } else {
                logger.info('Credits settled for album', {
                  albumRequestId,
                  reservationId,
                  settledAmount: settleResult.settledAmount,
                  refundedAmount: settleResult.refundedAmount,
                });
              }
            } else {
              await userServiceClient.cancelReservation(reservationId, userId, 'No successful tracks generated');
              logger.info('Credits cancelled for album - no successful tracks', { albumRequestId, reservationId });
            }
          }

          if (!hasPrivilegedAccess && successfulTracks > 0) {
            for (let i = 0; i < successfulTracks; i++) {
              const usageResult = await userServiceClient.incrementUsage(userId, 'songs');
              if (!usageResult.success) {
                logger.error('Failed to increment usage for album track', {
                  userId,
                  albumRequestId,
                  trackIndex: i,
                  error: usageResult.error,
                });
                break;
              }
            }
          }
        } catch (error) {
          if (!hasPrivilegedAccess && reservationId) {
            await userServiceClient.cancelReservation(reservationId, userId, `Album generation exception: ${error instanceof Error ? error.message : 'Unknown'}`).catch(cancelErr => {
              logger.error('Failed to cancel reservation after album error', {
                albumRequestId,
                reservationId,
                error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
              });
            });
          }

          if (reqRepo) {
            try {
              await reqRepo.updateProgress(albumRequestId, {
                status: 'failed',
                phase: 'failed',
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

          logger.error('Background album generation exception', {
            albumRequestId,
            userId,
            error: serializeError(error),
          });
        }
      });
    } catch (error) {
      logger.error('User album generate endpoint error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate user album', req);
    }
  }

  async processAudio(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = processAudioSchema.parse(req.body);

      logger.info('Processing audio: {}', { data0: validatedData.processingType });

      const result = await this.processAudioUseCase.execute(validatedData);

      if (result.success) {
        sendSuccess(
          res,
          {
            jobId: result.jobId,
            estimatedDuration: result.estimatedDuration,
            status: result.status,
            processingType: validatedData.processingType,
          },
          202
        );
      } else {
        ServiceErrors.internal(res, result.error || 'Audio processing failed', undefined, req);
      }
    } catch (error) {
      logger.error('Process audio error:', { error: serializeError(error) });

      if (error instanceof z.ZodError) {
        ServiceErrors.badRequest(res, 'Invalid request data', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Process audio error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Internal server error', req);
        return;
      }
    }
  }

  async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const databaseHealthy = await this.checkDatabaseHealth();

      const status = databaseHealthy ? 'healthy' : 'unhealthy';

      res.status(databaseHealthy ? 200 : 503).json({
        status,
        service: 'music-service',
        version: '1.0.0',
        capabilities: [
          'music-generation',
          'audio-processing',
          'multi-format-support',
          'quality-validation',
          'workflow-orchestration',
        ],
        components: {
          database: databaseHealthy ? 'healthy' : 'unhealthy',
          musicGeneration: 'operational',
          audioProcessing: 'operational',
        },
        supportedFormats: {
          input: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
          output: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
        },
        supportedMusicTypes: ['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop'],
        limits: {
          maxDuration: 600,
          maxPromptLength: 5000,
          maxFileSize: 100 * 1024 * 1024,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Health check error:', { error: serializeError(error) });
      res.status(503).json({
        status: 'unhealthy',
        service: 'music-service',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      const db = getDatabase();
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}
