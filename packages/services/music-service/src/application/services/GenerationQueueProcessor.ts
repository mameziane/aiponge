import { randomUUID } from 'crypto';
import { QueueManager, type JobProcessor, createLogger } from '@aiponge/platform-core';
import { isFeatureEnabled, createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';
import { MusicEventPublisher } from '../../infrastructure/events/MusicEventPublisher';
import { FEATURE_FLAGS, type ContentVisibility } from '@aiponge/shared-contracts/common';
import type { Job } from 'bullmq';
import { MusicError } from '../errors/errors';
import type { TrackGenerationService, TrackGenerationRequest } from './TrackGenerationService';
import type { ProgressUpdate } from './AlbumGenerationPipeline';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';

const logger = createLogger('music-generation-queue');

const QUEUE_NAME = 'music-generation';

const MUSIC_QUEUE_CONCURRENCY = parseInt(process.env.MUSIC_QUEUE_CONCURRENCY || '4');

const STALE_REQUEST_THRESHOLD_MS = 30 * 60 * 1000;
const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface GenerationJobPayload {
  jobId: string;
  userId: string;
  requestId: string;
  musicType: string;
  prompt: string;
  style?: string;
  genre?: string;
  mood?: string;
  tempo?: number;
  key?: string;
  duration?: number;
  culturalStyle?: string;
  instrumentType?: string;
  wellbeingPurpose?: string;
  priority?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  entryId?: string;
  lyricsId?: string;
}

export interface GenerationJobResult {
  jobId: string;
  status: 'completed' | 'failed';
  trackId?: string;
  error?: string;
}

const jobStatusStore = new Map<
  string,
  {
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress?: number;
    trackId?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
  }
>();

const MAX_STATUS_ENTRIES = 5000;

function pruneStatusStore(): void {
  if (jobStatusStore.size <= MAX_STATUS_ENTRIES) return;
  const entries = Array.from(jobStatusStore.entries()).sort(
    (a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime()
  );
  const toRemove = entries.length - MAX_STATUS_ENTRIES;
  for (let i = 0; i < toRemove; i++) {
    jobStatusStore.delete(entries[i][0]);
  }
}

let albumRequestRepo: InstanceType<typeof import('../../infrastructure/database/DrizzleAlbumRequestRepository').DrizzleAlbumRequestRepository> | null = null;
async function getAlbumRequestRepository() {
  if (!albumRequestRepo) {
    try {
      const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleAlbumRequestRepository } =
        await import('../../infrastructure/database/DrizzleAlbumRequestRepository');
      const db = getDatabase();
      albumRequestRepo = new DrizzleAlbumRequestRepository(db);
    } catch (error) {
      logger.error('Failed to initialize AlbumRequestRepository for queue processor', { error });
    }
  }
  return albumRequestRepo;
}

async function updateAlbumRequestStatus(
  requestId: string,
  status: 'processing' | 'completed' | 'failed',
  extras?: {
    errorMessage?: string;
    albumId?: string;
    successfulTracks?: number;
    failedTracks?: number;
    percentComplete?: number;
    phase?: string;
  }
): Promise<void> {
  try {
    const repo = await getAlbumRequestRepository();
    if (!repo) return;

    const updateData: Record<string, unknown> = {
      status,
      phase: extras?.phase || status,
    };

    if (status === 'failed') {
      updateData.errorMessage = extras?.errorMessage || 'Job failed after exhausting retries';
      updateData.completedAt = new Date();
    }

    if (status === 'completed') {
      updateData.percentComplete = 100;
      updateData.completedAt = new Date();
    }

    if (extras?.albumId) updateData.albumId = extras.albumId;
    if (extras?.successfulTracks !== undefined) updateData.successfulTracks = extras.successfulTracks;
    if (extras?.failedTracks !== undefined) updateData.failedTracks = extras.failedTracks;
    if (extras?.percentComplete !== undefined) updateData.percentComplete = extras.percentComplete;

    await repo.updateProgress(requestId, updateData);
    logger.info('Album request status updated from queue processor', { requestId, status });
  } catch (error) {
    logger.error('Failed to update album request status', {
      requestId,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let trackGenerationService: TrackGenerationService | null = null;
async function getTrackGenerationService() {
  if (!trackGenerationService) {
    try {
      const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const { DrizzleMusicCatalogRepository } =
        await import('../../infrastructure/database/DrizzleMusicCatalogRepository');
      const { UnifiedAlbumRepository } = await import('../../infrastructure/database/UnifiedAlbumRepository');
      const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
      const { DrizzleUserTrackRepository } = await import('../../infrastructure/database/DrizzleUserTrackRepository');
      const { StorageServiceClient } = await import('../../infrastructure/clients/StorageServiceClient');
      const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
      const { lyricsPreparationService } = await import('../../application/services/LyricsPreparationService');
      const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
      const { ProvidersServiceClient } = await import('../../infrastructure/clients/ProvidersServiceClient');
      const { TrackGenerationService } = await import('./TrackGenerationService');
      const db = getDatabase();
      const registry = getServiceRegistry();
      trackGenerationService = new TrackGenerationService({
        lyricsRepository: new UnifiedLyricsRepository(db),
        albumRepository: new UnifiedAlbumRepository(db),
        userTrackRepository: new DrizzleUserTrackRepository(db),
        catalogRepository: new DrizzleMusicCatalogRepository(db),
        storageClient: registry.storageClient as import('../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
        artworkUseCase: new GenerateArtworkUseCase(),
        lyricsPreparationService,
        db,
        musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
      });
    } catch (error) {
      logger.error('Failed to initialize TrackGenerationService for queue processor', { error });
    }
  }
  return trackGenerationService;
}

async function createAlbumGenerationService() {
  try {
    const { StorageServiceClient } = await import('../../infrastructure/clients/StorageServiceClient');
    const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
    const { getLyricsPreparationService } = await import('../../application/services/LyricsPreparationService');
    const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
    const { DrizzleMusicCatalogRepository } =
      await import('../../infrastructure/database/DrizzleMusicCatalogRepository');
    const { DrizzleUserTrackRepository } = await import('../../infrastructure/database/DrizzleUserTrackRepository');
    const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
    const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
    const { ProvidersServiceClient } = await import('../../infrastructure/clients/ProvidersServiceClient');
    const { AlbumGenerationService } = await import('./AlbumGenerationService');
    const db = getDatabase();
    const registry = getServiceRegistry();
    return new AlbumGenerationService({
      storageClient: registry.storageClient as import('../../infrastructure/clients/StorageServiceClient').StorageServiceClient,
      artworkUseCase: new GenerateArtworkUseCase(),
      lyricsPreparationService: await getLyricsPreparationService(),
      catalogRepository: new DrizzleMusicCatalogRepository(db),
      userTrackRepository: new DrizzleUserTrackRepository(db),
      lyricsRepository: new UnifiedLyricsRepository(db),
      musicProviderOrchestrator: createMusicOrchestrator(registry.providersClient as unknown as import('../../domains/ai-music/interfaces/IProviderClient').IProviderClient),
    });
  } catch (error) {
    logger.error('Failed to create AlbumGenerationService for queue processor', { error });
    return null;
  }
}

const generationProcessor: JobProcessor<GenerationJobPayload> = async (job: Job<GenerationJobPayload>) => {
  const { jobId, userId, requestId } = job.data;

  logger.info('Processing music generation job', { jobId, userId, requestId, attempt: job.attemptsMade + 1 });

  const existingStatus = jobStatusStore.get(jobId);
  jobStatusStore.set(jobId, {
    status: 'processing',
    progress: 0,
    createdAt: existingStatus?.createdAt || new Date(),
    updatedAt: new Date(),
  });

  let albumRequestStatusHandled = false;

  if (job.data.musicType === 'album') {
    await updateAlbumRequestStatus(requestId, 'processing', { phase: 'processing', percentComplete: 5 });
  }

  try {
    jobStatusStore.set(jobId, {
      status: 'processing',
      progress: 25,
      createdAt: existingStatus?.createdAt || new Date(),
      updatedAt: new Date(),
    });

    let result: { success: boolean; error?: string; trackId?: string; fileUrl?: string; albumId?: string; albumRequestId?: string; successfulTracks?: number; failedTracks?: number };

    if (job.data.musicType === 'album') {
      const albumService = await createAlbumGenerationService();
      if (!albumService) {
        throw MusicError.serviceUnavailable('AlbumGenerationService unavailable');
      }

      const params = job.data.parameters || {};
      const jobStartedAt = new Date();

      const repo = await getAlbumRequestRepository();
      if (repo) {
        albumService.setProgressCallback(async (progress: ProgressUpdate) => {
          try {
            await repo.updateProgress(requestId, {
              status: progress.status || 'processing',
              phase: progress.phase || 'generating_track',
              subPhase: progress.subPhase || null,
              currentTrack: progress.currentTrack,
              percentComplete: progress.percentComplete,
              successfulTracks:
                progress.successfulTracks ?? progress.trackResults?.filter((t: { success: boolean }) => t.success).length ?? 0,
              failedTracks: progress.failedTracks ?? progress.trackResults?.filter((t: { success: boolean }) => !t.success).length ?? 0,
              trackResults: progress.trackResults || [],
              albumArtworkUrl: progress.albumArtworkUrl,
              albumTitle: progress.albumTitle || undefined,
              startedAt: jobStartedAt,
            });
          } catch (progressErr) {
            logger.warn('Failed to update progress from queue processor', {
              requestId,
              error: progressErr instanceof Error ? progressErr.message : String(progressErr),
            });
          }
        });
      }

      result = await albumService.generate({
        userId: job.data.userId,
        targetVisibility: ((job.data as GenerationJobPayload & { targetVisibility?: string }).targetVisibility || 'PERSONAL') as ContentVisibility,
        chapterId: params.chapterId as string,
        chapterTitle: (params.chapterTitle as string) || job.data.prompt,
        bookId: params.bookId as string,
        bookTitle: params.bookTitle as string,
        entries: params.entries as Array<{ entryId: string; content: string; order: number }>,
        style: job.data.style,
        genre: job.data.genre,
        mood: job.data.mood,
        culturalStyle: job.data.culturalStyle,
        instrumentType: job.data.instrumentType,
        languageMode: params.languageMode as 'single' | 'all' | undefined,
        targetLanguages: params.targetLanguages as string[],
      });

      if (!result.success) {
        albumRequestStatusHandled = true;
        await updateAlbumRequestStatus(requestId, 'failed', {
          albumId: result.albumId,
          successfulTracks: result.successfulTracks || 0,
          failedTracks: result.failedTracks || 0,
          percentComplete: 100,
          errorMessage: result.error,
          phase: 'failed',
        });
        throw MusicError.internalError(result.error || 'Album generation failed');
      }

      albumRequestStatusHandled = true;
      await updateAlbumRequestStatus(requestId, 'completed', {
        albumId: result.albumId,
        successfulTracks: result.successfulTracks || 0,
        failedTracks: result.failedTracks || 0,
        percentComplete: 100,
        phase: 'completed',
      });
    } else {
      const trackService = await getTrackGenerationService();
      if (!trackService) {
        throw MusicError.serviceUnavailable('TrackGenerationService unavailable');
      }

      result = await trackService.generate({
        userId: job.data.userId,
        prompt: job.data.prompt,
        style: job.data.style,
        genre: job.data.genre,
        mood: job.data.mood,
        culturalStyle: job.data.culturalStyle,
        instrumentType: job.data.instrumentType,
        entryId: job.data.entryId,
        sessionId: job.data.requestId,
      } as TrackGenerationRequest);
    }

    if (!result.success) {
      throw MusicError.internalError(result.error || 'Generation failed');
    }

    jobStatusStore.set(jobId, {
      status: 'completed',
      progress: 100,
      trackId: result.trackId || result.albumId || result.albumRequestId,
      createdAt: existingStatus?.createdAt || new Date(),
      updatedAt: new Date(),
    });

    MusicEventPublisher.generationCompleted(
      job.data.userId,
      requestId,
      requestId,
      result.trackId,
      result.albumId,
      result.fileUrl
    );

    logger.info('Music generation job completed', { jobId, userId, trackId: result.trackId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts || 2) - 1;

    logger.error('Music generation job failed', {
      jobId,
      userId,
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 2,
      isLastAttempt,
    });

    jobStatusStore.set(jobId, {
      status: 'failed',
      error: errorMessage,
      createdAt: existingStatus?.createdAt || new Date(),
      updatedAt: new Date(),
    });

    if (isLastAttempt && job.data.musicType === 'album' && !albumRequestStatusHandled) {
      await updateAlbumRequestStatus(requestId, 'failed', {
        errorMessage: `Generation failed after ${job.attemptsMade + 1} attempts: ${errorMessage}`,
        phase: 'failed',
      });
    }

    MusicEventPublisher.generationFailed(job.data.userId, requestId, errorMessage, requestId, isLastAttempt);

    throw error;
  }
};

let staleCheckScheduler: IntervalScheduler | null = null;

async function cleanupStaleRequests(): Promise<void> {
  try {
    const repo = await getAlbumRequestRepository();
    if (!repo) return;

    const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
    const { albumRequests } = await import('../../schema/music-schema');
    const { eq, and, isNull, lt, inArray } = await import('drizzle-orm');

    const db = getDatabase();
    const staleThreshold = new Date(Date.now() - STALE_REQUEST_THRESHOLD_MS);

    const staleRecords = await db
      .select({ id: albumRequests.id, updatedAt: albumRequests.updatedAt })
      .from(albumRequests)
      .where(
        and(
          inArray(albumRequests.status, ['processing', 'queued']),
          lt(albumRequests.updatedAt, staleThreshold),
          isNull(albumRequests.deletedAt)
        )
      )
      .limit(50);

    if (staleRecords.length === 0) return;

    logger.warn('Found stale album requests, marking as failed', {
      count: staleRecords.length,
      ids: staleRecords.map(r => r.id),
    });

    for (const record of staleRecords) {
      await repo.updateProgress(record.id, {
        status: 'failed',
        phase: 'failed',
        errorMessage: 'Request timed out - generation did not complete within 30 minutes',
        completedAt: new Date(),
      });
    }

    logger.info('Stale album requests cleaned up', { count: staleRecords.length });
  } catch (error) {
    logger.error('Failed to cleanup stale album requests', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function initializeGenerationQueue(): boolean {
  if (!isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
    logger.debug('ASYNC_GENERATION flag disabled, skipping queue registration');
    return false;
  }

  if (!QueueManager.isInitialized()) {
    QueueManager.init();
  }

  if (!QueueManager.isInitialized()) {
    logger.warn('QueueManager not available (no Redis?), async generation disabled');
    return false;
  }

  QueueManager.registerQueue<GenerationJobPayload>(QUEUE_NAME, generationProcessor, {
    concurrency: MUSIC_QUEUE_CONCURRENCY,
  });
  logger.info('Music generation queue registered', { concurrency: MUSIC_QUEUE_CONCURRENCY });

  staleCheckScheduler = createIntervalScheduler({
    name: 'stale-request-cleanup',
    serviceName: 'music-service',
    intervalMs: STALE_CHECK_INTERVAL_MS,
    handler: () => cleanupStaleRequests(),
  });
  staleCheckScheduler.start();
  logger.info('Stale request cleanup scheduled', { intervalMs: STALE_CHECK_INTERVAL_MS });

  return true;
}

export async function enqueueGenerationJob(payload: GenerationJobPayload): Promise<string | null> {
  const jobId = payload.jobId || randomUUID();
  pruneStatusStore();

  jobStatusStore.set(jobId, {
    status: 'queued',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const enqueuedId = await QueueManager.enqueue<GenerationJobPayload>(
    QUEUE_NAME,
    'generate-music',
    { ...payload, jobId },
    { jobId, attempts: 2 }
  );

  if (!enqueuedId) {
    jobStatusStore.delete(jobId);
    return null;
  }

  return jobId;
}

export function getGenerationJobStatus(jobId: string) {
  return jobStatusStore.get(jobId) || null;
}

export function shutdownStaleChecker(): void {
  if (staleCheckScheduler) {
    staleCheckScheduler.stop();
    staleCheckScheduler = null;
    logger.info('Stale request cleanup stopped');
  }
}

export { QUEUE_NAME };
