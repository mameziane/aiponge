/**
 * RefactoredAlbumHandlers - New handlers that use shared utilities instead of Strategy pattern
 *
 * These handlers replace DefaultTrackGenerationHandler by using MusicGenerationUtils
 * directly, eliminating the TrackGenerationPipeline and PersistenceStrategy dependencies.
 *
 * Integrates GenerationSessionService for proper session tracking and compensation on failure.
 */

import { getLogger, SERVICE_URLS } from '../../config/service-urls';
import { PipelineError } from '../errors';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { DrizzleMusicCatalogRepository } from '../../infrastructure/database/DrizzleMusicCatalogRepository';
import { DrizzleUserTrackRepository } from '../../infrastructure/database/DrizzleUserTrackRepository';
import { UnifiedLyricsRepository } from '../../infrastructure/database/UnifiedLyricsRepository';
import { Track } from '../../domains/music-catalog/entities/Track';
import { v4 as uuidv4 } from 'uuid';
import { MusicGenerationUtils, FileStorageUtils, type StoragePathConfig } from '../shared';
import type { CachedUserContextInput } from './LyricsPreparationService';
import { isPubliclyAccessibleContext } from '../shared/persistence-types';
import { CONTENT_VISIBILITY, TRACK_LIFECYCLE } from '@aiponge/shared-contracts';
import type { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import type { GenerateArtworkUseCase } from '../use-cases/music/GenerateArtworkUseCase';
import type { LyricsPreparationService } from './LyricsPreparationService';
import type {
  TrackGenerationHandler,
  LyricsSyncHandler,
  UserContextFetcher,
  CachedUserContext,
  PendingLyricsSync,
  AlbumGenerationConfig,
  ReadOnlyTrackContext,
  AlbumEntry,
  TrackResult,
  SubPhaseCallback,
} from './AlbumGenerationPipeline';
import type { IMusicProviderOrchestrator } from '../../domains/ai-music/interfaces/IMusicProvider';
import pLimit from 'p-limit';

const logger = getLogger('music-service:refactored-album-handlers');

export interface RefactoredHandlerDependencies {
  storageClient: StorageServiceClient;
  artworkUseCase: GenerateArtworkUseCase;
  lyricsPreparationService: LyricsPreparationService;
  catalogRepository: DrizzleMusicCatalogRepository;
  userTrackRepository: DrizzleUserTrackRepository;
  lyricsRepository: UnifiedLyricsRepository;
  musicProviderOrchestrator: IMusicProviderOrchestrator;
}

export class RefactoredTrackGenerationHandler implements TrackGenerationHandler {
  private readonly generationUtils: MusicGenerationUtils;
  private readonly fileStorageUtils: FileStorageUtils;

  constructor(private readonly deps: RefactoredHandlerDependencies) {
    this.generationUtils = new MusicGenerationUtils(
      deps.musicProviderOrchestrator,
      deps.lyricsPreparationService,
      deps.artworkUseCase,
      deps.storageClient
    );
    this.fileStorageUtils = new FileStorageUtils(deps.storageClient);
  }

  async generateTrack(
    entry: AlbumEntry,
    language: string,
    variantGroupId: string,
    config: AlbumGenerationConfig,
    context: ReadOnlyTrackContext,
    onSubPhase?: SubPhaseCallback
  ): Promise<TrackResult> {
    const requestId = uuidv4();

    const visibility = context.persistenceContext?.visibility || CONTENT_VISIBILITY.PERSONAL;

    logger.info('Generating track via refactored handler', {
      entryId: entry.entryId,
      language,
      variantGroupId,
      order: entry.order,
      albumRequestId: context.albumRequestId,
      visibility,
    });

    try {
      if (onSubPhase) await onSubPhase('lyrics', 2);

      const lyricsResult = await this.generationUtils.generateLyrics({
        userId: config.userId,
        requestId,
        entryId: entry.entryId,
        entryContent: entry.content ? { content: entry.content, updatedAt: new Date().toISOString() } : undefined,
        style: config.style,
        mood: config.mood,
        language,
        visibility,
        cachedUserContext: context.cachedUserContext as CachedUserContextInput,
        bookContext: {
          bookType: config.bookType,
          bookTitle: config.bookTitle,
          bookDescription: config.bookDescription,
          chapterTitle: config.chapterTitle,
          bookCategory: config.bookCategory,
          bookTags: config.bookTags,
          bookThemes: config.bookThemes,
        },
      });

      if (!lyricsResult.success || !lyricsResult.lyricsContent) {
        return {
          entryId: entry.entryId,
          order: entry.order,
          success: false,
          requestId,
          language,
          variantGroupId,
          error: lyricsResult.error || 'Lyrics generation failed',
          code: 'LYRICS_FAILED',
        };
      }

      const title =
        lyricsResult.songTitle ||
        MusicGenerationUtils.extractTitleFromLyrics(lyricsResult.lyricsContent) ||
        `Track ${entry.order}`;
      const sanitizedLyrics = MusicGenerationUtils.sanitizeLyrics(lyricsResult.lyricsContent);

      if (onSubPhase) await onSubPhase('audio', 5, { title, lyrics: sanitizedLyrics });

      const artworkStorageConfig: StoragePathConfig = { userId: config.userId, fileType: 'artworks' };
      const artworkParams = {
        lyrics: sanitizedLyrics,
        title,
        style: config.style,
        mood: config.mood,
        userId: config.userId,
        visibility,
      };

      const audioParams = MusicGenerationUtils.buildAudioParams({
        lyrics: sanitizedLyrics,
        title,
        style: config.style,
        genre: config.genre,
        genres: config.genres,
        mood: config.mood,
        isInstrumental: config.isInstrumental,
        instrumentType: config.instrumentType,
        vocalGender: config.vocalGender,
        negativeTags: config.negativeTags,
        culturalStyle: config.culturalStyle,
        styleWeight: config.styleWeight,
      });

      const [initialArtworkResult, audioResult] = await Promise.all([
        this.generationUtils.generateArtwork(artworkParams, artworkStorageConfig, requestId),
        this.generationUtils.generateAudio(audioParams),
      ]);

      let artworkResult = initialArtworkResult;
      if (!artworkResult.success || !artworkResult.artworkUrl) {
        logger.warn('Artwork generation failed on first attempt, retrying...', {
          requestId,
          entryId: entry.entryId,
          error: artworkResult.error,
        });
        const ARTWORK_RETRY_DELAY_MS = 3000;
        const ARTWORK_MAX_RETRIES = 2;
        for (let attempt = 1; attempt <= ARTWORK_MAX_RETRIES; attempt++) {
          await new Promise(resolve => setTimeout(resolve, ARTWORK_RETRY_DELAY_MS));
          artworkResult = await this.generationUtils.generateArtwork(artworkParams, artworkStorageConfig, requestId);
          if (artworkResult.success && artworkResult.artworkUrl) {
            logger.info('Artwork generation succeeded on retry', {
              requestId,
              entryId: entry.entryId,
              attempt,
            });
            break;
          }
          logger.warn('Artwork retry failed', {
            requestId,
            entryId: entry.entryId,
            attempt,
            error: artworkResult.error,
          });
        }
        if (!artworkResult.success || !artworkResult.artworkUrl) {
          logger.warn('Artwork generation failed after all retries - track will have no artwork', {
            requestId,
            entryId: entry.entryId,
            error: artworkResult.error,
          });
        }
      }

      if (!audioResult.success || !audioResult.audioUrl) {
        return {
          entryId: entry.entryId,
          order: entry.order,
          success: false,
          requestId,
          lyricsId: lyricsResult.lyricsId ?? undefined,
          language,
          variantGroupId,
          error: audioResult.error || 'Audio generation failed',
          code: 'AUDIO_FAILED',
        };
      }

      if (onSubPhase)
        await onSubPhase('storing', 3, {
          artworkUrl: artworkResult.artworkUrl,
        });

      const audioStorageConfig: StoragePathConfig = { userId: config.userId, fileType: 'tracks' };

      const audioFileResult = await this.fileStorageUtils.downloadAndStoreAudio(
        audioResult.audioUrl,
        audioStorageConfig,
        requestId
      );

      if (!audioFileResult.success || !audioFileResult.publicUrl) {
        return {
          entryId: entry.entryId,
          order: entry.order,
          success: false,
          requestId,
          lyricsId: lyricsResult.lyricsId ?? undefined,
          language,
          variantGroupId,
          error: audioFileResult.error || 'Audio storage failed',
          code: 'STORAGE_FAILED',
        };
      }

      // Extract audio duration from the stored file using storage service URL
      // The stored file path is a relative path like /api/files/... that needs the storage service base URL
      // Use SERVICE_URLS.storageService which properly resolves from env vars or defaults
      const storageBaseUrl = SERVICE_URLS.storageService;
      const extractedDuration = await FileStorageUtils.extractAudioDuration(audioFileResult.publicUrl, storageBaseUrl);

      if (onSubPhase)
        await onSubPhase('saving', 2, {
          audioFileUrl: audioFileResult.publicUrl,
        });

      const trackId = await this.persistTrack({
        config,
        context,
        title,
        requestId,
        lyricsId: lyricsResult.lyricsId ?? undefined,
        audioFileUrl: audioFileResult.publicUrl,
        artworkUrl: artworkResult.artworkUrl,
        duration: extractedDuration || audioResult.duration || 0,
        fileSize: audioFileResult.fileSize || 0,
        entryId: entry.entryId,
        order: entry.order,
        language,
        variantGroupId,
        generationNumber: context.generationNumber,
      });

      const pendingLyricsSync = lyricsResult.lyricsId
        ? {
            trackId,
            lyricsId: lyricsResult.lyricsId,
            clipId: audioResult.clipId,
            lyricsContent: sanitizedLyrics,
            audioUrl: audioFileResult.publicUrl,
            visibility,
            providerId: audioResult.providerId,
          }
        : undefined;

      logger.info('Track generated successfully via refactored handler', {
        trackId,
        entryId: entry.entryId,
        language,
        visibility,
        hasLyricsSyncPending: !!pendingLyricsSync,
      });

      return {
        entryId: entry.entryId,
        order: entry.order,
        success: true,
        requestId,
        trackId,
        lyricsId: lyricsResult.lyricsId ?? undefined,
        language,
        variantGroupId,
        title,
        artworkUrl: artworkResult.artworkUrl,
        audioFileUrl: audioFileResult.publicUrl,
        lyrics: sanitizedLyrics,
        pendingLyricsSync,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Track generation threw exception in refactored handler', {
        entryId: entry.entryId,
        language,
        error: errorMessage,
      });

      return {
        entryId: entry.entryId,
        order: entry.order,
        success: false,
        requestId,
        language,
        variantGroupId,
        error: errorMessage,
        code: 'GENERATION_EXCEPTION',
      };
    }
  }

  private async persistTrack(params: {
    config: AlbumGenerationConfig;
    context: ReadOnlyTrackContext;
    title: string;
    requestId: string;
    lyricsId?: string;
    audioFileUrl: string;
    artworkUrl?: string;
    duration?: number;
    fileSize?: number;
    entryId: string;
    order: number;
    language: string;
    variantGroupId: string;
    generationNumber: number;
  }): Promise<string> {
    const trackId = uuidv4();

    if (isPubliclyAccessibleContext(params.context.persistenceContext)) {
      if (!params.context.albumId) {
        throw PipelineError.missingRequiredField('albumId is required for shared library tracks');
      }

      // Extract base language code (e.g., 'en' from 'en-US')
      const baseLanguage = params.language?.split('-')[0] || 'en';

      const savedTrack = await this.deps.catalogRepository.saveTrack({
        id: trackId,
        title: params.title,
        userId: params.config.userId,
        albumId: params.context.albumId,
        fileUrl: params.audioFileUrl,
        artworkUrl: params.artworkUrl,
        duration: params.duration || 0,
        fileSize: params.fileSize || 0,
        mimeType: 'audio/mpeg',
        quality: 'high',
        lyricsId: params.lyricsId,
        hasSyncedLyrics: false,
        trackNumber: params.order,
        generationNumber: params.generationNumber,
        genres: params.config.genre ? [params.config.genre] : [],
        status: TRACK_LIFECYCLE.PUBLISHED,
        language: baseLanguage,
        generatedByUserId: params.config.userId,
        generationRequestId: params.requestId,
        metadata: {
          entryId: params.entryId,
          language: params.language,
          variantGroupId: params.variantGroupId,
          style: params.config.style,
          mood: params.config.mood,
          ...(params.config.displayName ? { displayName: params.config.displayName } : {}),
        },
      });

      logger.debug('Shared library track persisted via repository', {
        trackId: savedTrack.id,
        albumId: params.context.albumId,
      });
      return savedTrack.id;
    } else {
      if (!params.context.albumId) {
        throw PipelineError.missingRequiredField('albumId is required for personal tracks');
      }

      const baseLanguage = params.language?.split('-')[0] || 'en';

      const userTrack = Track.create({
        id: trackId,
        userId: params.config.userId,
        title: params.title,
        albumId: params.context.albumId,
        fileUrl: params.audioFileUrl,
        artworkUrl: params.artworkUrl,
        duration: params.duration || 0,
        fileSize: params.fileSize || 0,
        mimeType: 'audio/mpeg',
        quality: 'high',
        lyricsId: params.lyricsId,
        hasSyncedLyrics: false,
        trackNumber: params.order,
        generationNumber: params.generationNumber,
        genres: params.config.genre ? [params.config.genre] : [],
        language: baseLanguage,
        variantGroupId: params.variantGroupId,
        status: TRACK_LIFECYCLE.ACTIVE,
        sourceType: 'generated',
        generatedByUserId: params.config.userId,
        generationRequestId: params.requestId,
        metadata: {
          entryId: params.entryId,
          language: params.language,
          variantGroupId: params.variantGroupId,
          style: params.config.style,
          mood: params.config.mood,
          ...(params.config.displayName ? { displayName: params.config.displayName } : {}),
        },
      });

      const savedTrack = await this.deps.userTrackRepository.save(userTrack);
      logger.debug('User track persisted via repository', { trackId: savedTrack.id, albumId: params.context.albumId });
      return savedTrack.id;
    }
  }
}

const LYRICS_SYNC_CONCURRENCY = 3;

export class DefaultLyricsSyncHandler implements LyricsSyncHandler {
  private readonly generationUtils: MusicGenerationUtils;

  constructor(private readonly deps: RefactoredHandlerDependencies) {
    this.generationUtils = new MusicGenerationUtils(
      deps.musicProviderOrchestrator,
      deps.lyricsPreparationService,
      deps.artworkUseCase,
      deps.storageClient
    );
  }

  async syncAllPending(syncs: PendingLyricsSync[], albumRequestId: string): Promise<void> {
    if (syncs.length === 0) return;

    logger.info('Starting background lyrics sync batch', {
      albumRequestId,
      totalSyncs: syncs.length,
      concurrency: LYRICS_SYNC_CONCURRENCY,
    });

    const limit = pLimit(LYRICS_SYNC_CONCURRENCY);

    const results = await Promise.allSettled(
      syncs.map(sync =>
        limit(async () => {
          try {
            await this.generationUtils.performFullLyricsSync(
              {
                trackId: sync.trackId,
                lyricsId: sync.lyricsId,
                clipId: sync.clipId,
                lyricsContent: sync.lyricsContent,
                audioUrl: sync.audioUrl,
                visibility: sync.visibility as 'personal' | 'shared' | 'public',
                providerId: sync.providerId,
              },
              {
                lyricsRepository: this.deps.lyricsRepository,
                catalogRepository: this.deps.catalogRepository,
                userTrackRepository: this.deps.userTrackRepository,
              }
            );
            return { trackId: sync.trackId, success: true };
          } catch (error) {
            logger.warn('Background lyrics sync failed for track (non-fatal)', {
              trackId: sync.trackId,
              lyricsId: sync.lyricsId,
              error: error instanceof Error ? error.message : String(error),
            });
            return { trackId: sync.trackId, success: false };
          }
        })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Background lyrics sync batch completed', {
      albumRequestId,
      total: syncs.length,
      succeeded,
      failed,
    });
  }
}

import { EntryContentGateway } from './EntryContentGateway';

export class DefaultUserContextFetcher implements UserContextFetcher {
  private readonly entryGateway: EntryContentGateway;

  constructor() {
    this.entryGateway = new EntryContentGateway();
  }

  async fetchUserContext(userId: string, requestId: string): Promise<CachedUserContext> {
    const [prefResult, seedsResult, personaResult] = await Promise.all([
      this.entryGateway.fetchUserPreferences(userId, requestId),
      this.entryGateway.fetchNarrativeSeeds(userId, requestId),
      this.entryGateway.fetchUserPersona(userId, requestId),
    ]);

    return {
      preferences: prefResult.success ? prefResult.preferences : undefined,
      narrativeSeeds: seedsResult.success ? seedsResult.seeds : undefined,
      persona: personaResult.success && personaResult.persona
        ? (personaResult.persona as unknown as Record<string, unknown>)
        : undefined,
    };
  }
}

export async function createRefactoredPipelineDependencies(deps: RefactoredHandlerDependencies) {
  const {
    DefaultAlbumCreationHandler,
    DefaultArtworkGenerationHandler,
    DefaultAlbumLinkingHandler,
  } = await import('./AlbumPipelineHandlers');

  return {
    albumCreationHandler: new DefaultAlbumCreationHandler(),
    trackGenerationHandler: new RefactoredTrackGenerationHandler(deps),
    artworkGenerationHandler: new DefaultArtworkGenerationHandler(),
    albumLinkingHandler: new DefaultAlbumLinkingHandler(),
    lyricsSyncHandler: new DefaultLyricsSyncHandler(deps),
  };
}
