/**
 * TrackGenerationService
 * Unified service for generating tracks with visibility-based access control
 *
 * Consolidates: UserTrackGenerationService, LibraryTrackGenerationService
 *
 * Use targetVisibility parameter to control:
 * - 'personal': User-owned content (private to user)
 * - 'shared': Library content (publicly accessible)
 */

import { randomUUID } from 'crypto';
import { getLogger, SERVICE_URLS } from '../../config/service-urls';
import { PipelineError } from '../errors';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import {
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  type ContentVisibility,
  isContentPubliclyAccessible,
  APP,
} from '@aiponge/shared-contracts';
import { getAnalyticsEventPublisher, type AnalyticsEventPublisher } from '@aiponge/platform-core';
import {
  GenerationSessionService,
  MusicGenerationUtils,
  FileStorageUtils,
  type ArtworkResult,
  type CompensationRecord,
  type StoragePathConfig,
} from '../shared';
import type { LyricsResult } from '../shared/MusicGenerationUtils';
import { Track, type TrackData } from '../../domains/music-catalog/entities/Track';
import type { UnifiedLyricsRepository } from '../../infrastructure/database/UnifiedLyricsRepository';
import type { UnifiedAlbumRepository } from '../../infrastructure/database/UnifiedAlbumRepository';
import type { DrizzleUserTrackRepository } from '../../infrastructure/database/DrizzleUserTrackRepository';
import type { DrizzleMusicCatalogRepository } from '../../infrastructure/database/DrizzleMusicCatalogRepository';
import type { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import type { GenerateArtworkUseCase } from '../use-cases/music/GenerateArtworkUseCase';
import type { LyricsPreparationService } from '../services/LyricsPreparationService';
import { getImageAnalysisService } from '../services/ImageAnalysisService';
import { getOrCreateSinglesAlbumForUser } from '../helpers/SinglesAlbumHelper';
import type { NewTrack } from '../../schema/music-schema';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';

const logger = getLogger('music-service:track-generation');

const analyticsPublisher: AnalyticsEventPublisher = getAnalyticsEventPublisher('music-service');

export type TrackVisibility = ContentVisibility;

export interface TrackGenerationRequest {
  userId: string;
  targetVisibility?: TrackVisibility;
  sessionId?: string;
  prompt?: string | null;
  existingLyrics?: string | null;
  artworkPrompt?: string | null;
  style?: string | null;
  mood?: string | null;
  genres?: string[] | null;
  genre?: string | null;
  albumId?: string | null;
  chapterId?: string | null;
  customInstrumental?: boolean | null;
  language?: string | null;
  culturalLanguages?: string[] | null;
  isBilingual?: boolean | null;
  playOnDate?: Date | null;
  entryId?: string | null;
  entryContent?: string | { content: string; chapterId?: string | null } | null;
  lyricsId?: string | null;
  pictureContext?: string | null;
  sourceEntryId?: string | null;
  sourceText?: string | null;
  sourceReference?: string | null;
  sourceBookTitle?: string | null;
  instrumentType?: string | null;
  vocalGender?: 'f' | 'm' | null;
  culturalStyle?: string | null;
  artworkUrl?: string | null;
  quality?: string | null;
  negativeTags?: string | null;
  styleWeight?: number | null;
  displayName?: string | null;
}

export interface TrackGenerationResult {
  success: boolean;
  trackId?: string;
  title?: string;
  fileUrl?: string;
  artworkUrl?: string;
  albumId?: string;
  lyricsId?: string | null;
  duration?: number;
  error?: string;
}

export interface TrackGenerationDependencies {
  lyricsRepository: UnifiedLyricsRepository;
  albumRepository: UnifiedAlbumRepository;
  userTrackRepository: DrizzleUserTrackRepository;
  catalogRepository: DrizzleMusicCatalogRepository;
  storageClient: StorageServiceClient;
  artworkUseCase: GenerateArtworkUseCase;
  lyricsPreparationService: LyricsPreparationService;
  db: DatabaseConnection;
  musicProviderOrchestrator: import('../../domains/ai-music/interfaces/IMusicProvider').IMusicProviderOrchestrator;
}

interface ContentPreparationResult {
  entryContent?: string;
  suggestedStyle?: string | null;
  suggestedMood?: string | null;
}

export class TrackGenerationService {
  private readonly sessionService: GenerationSessionService;
  private readonly fileUtils: FileStorageUtils;
  private readonly generationUtils: MusicGenerationUtils;

  constructor(private readonly deps: TrackGenerationDependencies) {
    this.sessionService = new GenerationSessionService(deps.db, deps.storageClient);
    this.fileUtils = new FileStorageUtils(deps.storageClient);
    this.generationUtils = new MusicGenerationUtils(
      deps.musicProviderOrchestrator,
      deps.lyricsPreparationService,
      deps.artworkUseCase,
      deps.storageClient
    );
  }

  async generate(request: TrackGenerationRequest): Promise<TrackGenerationResult> {
    const requestId = randomUUID();
    const compensation: CompensationRecord = {
      userId: request.userId,
      reservationId: (request as TrackGenerationRequest & { reservationId?: string }).reservationId,
    };
    const targetVisibility = request.targetVisibility || CONTENT_VISIBILITY.PERSONAL;
    const startTime = Date.now();

    logger.info('Starting track generation', {
      requestId,
      userId: request.userId,
      targetVisibility,
      hasPrompt: !!request.prompt,
      hasExistingLyrics: !!request.existingLyrics,
      providedSessionId: request.sessionId,
      hasArtworkUrl: !!request.artworkUrl,
      hasEntryContent: !!request.entryContent,
      hasEntryId: !!request.entryId,
    });

    let sessionId: string | undefined = request.sessionId;

    try {
      sessionId = await this.ensureSession(request, sessionId, targetVisibility);

      await this.sessionService.updatePhase(sessionId, 'generating_lyrics', 10);

      const step1Data = {
        requestId,
        sessionId,
        userId: request.userId,
        targetVisibility,
        hasEntryId: !!request.entryId,
        hasEntryContent: !!request.entryContent,
        hasArtworkUrl: !!request.artworkUrl,
        hasSourceText: !!request.sourceText,
      };
      logger.info('[STEP 1/6] GENERATING_LYRICS phase started', step1Data);

      const { entryContent, suggestedStyle, suggestedMood } = await this.prepareEntryContent(request, requestId);

      const lyricsResult = await this.generationUtils.generateLyrics({
        userId: request.userId,
        requestId,
        entryId: request.entryId ?? undefined,
        entryContent: entryContent ? { content: entryContent, updatedAt: new Date().toISOString() } : undefined,
        providedLyricsId: request.lyricsId ?? undefined,
        style: suggestedStyle ?? undefined,
        mood: suggestedMood ?? undefined,
        language: request.language ?? undefined,
        culturalLanguages: request.culturalLanguages ?? undefined,
        visibility: targetVisibility,
      });

      if (!lyricsResult.success || !lyricsResult.lyricsContent) {
        const errMsg = this.extractErrorMessage(lyricsResult.error, 'Lyrics generation failed');
        const errorCode = (lyricsResult as LyricsResult & { code?: string }).code || 'LYRICS_FAILED';
        const failData = {
          requestId,
          sessionId,
          userId: request.userId,
          error: errMsg,
          errorCode,
        };
        logger.error('[STEP 1/6] LYRICS GENERATION FAILED', failData);
        throw PipelineError.generationFailed(errMsg);
      }

      logger.info('[STEP 1/6] LYRICS GENERATED successfully', {
        requestId,
        lyricsLength: lyricsResult.lyricsContent.length,
        hasTitle: !!lyricsResult.songTitle,
      });

      compensation.lyricsId = lyricsResult.lyricsId ?? undefined;

      const title =
        lyricsResult.songTitle ||
        MusicGenerationUtils.extractTitleFromLyrics(lyricsResult.lyricsContent) ||
        'Untitled Track';
      const sanitizedLyrics = MusicGenerationUtils.sanitizeLyrics(lyricsResult.lyricsContent);

      if (sessionId) {
        await this.sessionService.updateLyrics(sessionId, sanitizedLyrics, title);
      }

      const storageConfig: StoragePathConfig = { userId: request.userId, fileType: 'artworks' };

      // Start artwork generation in background — runs in parallel with audio
      const artworkPromise = this.setupArtworkGeneration(
        request,
        sessionId!,
        sanitizedLyrics,
        title,
        suggestedStyle,
        suggestedMood,
        targetVisibility,
        storageConfig,
        requestId
      );

      const { audioResult, audioStorageResult } = await this.generateAndStoreAudio(
        request,
        sessionId,
        sanitizedLyrics,
        title,
        requestId
      );

      compensation.audioUrl = audioStorageResult.fileId;

      const storageBaseUrl = SERVICE_URLS.storageService;
      const [artworkResult, extractedDuration] = await Promise.all([
        artworkPromise,
        FileStorageUtils.extractAudioDuration(audioStorageResult.publicUrl, storageBaseUrl),
      ]);

      if (artworkResult.success && artworkResult.artworkUrl) {
        compensation.artworkUrl = artworkResult.fileId;
      } else {
        logger.warn('Artwork generation failed - track will have no artwork', {
          requestId,
          error: artworkResult.error,
        });
      }

      await this.sessionService.updatePhase(sessionId, 'saving', 80);

      const albumInfo = await this.resolveAlbum(request, targetVisibility);

      logger.info('Track save data debug', {
        requestId,
        userId: request.userId,
        albumId: albumInfo.albumId,
        targetVisibility,
      });

      const trackId = randomUUID();

      const confirmedAudioStorage = {
        publicUrl: audioStorageResult.publicUrl,
        fileSize: audioStorageResult.fileSize,
      };

      const savedTrack = await this.persistTrack(
        trackId,
        request,
        title,
        confirmedAudioStorage,
        artworkResult,
        extractedDuration,
        audioResult,
        lyricsResult,
        albumInfo,
        targetVisibility
      );

      compensation.trackId = savedTrack.id;

      if (lyricsResult.lyricsId) {
        this.generationUtils
          .performFullLyricsSync(
            {
              trackId: savedTrack.id,
              lyricsId: lyricsResult.lyricsId,
              clipId: audioResult.clipId,
              lyricsContent: sanitizedLyrics,
              audioUrl: confirmedAudioStorage.publicUrl,
              visibility: targetVisibility,
              providerId: audioResult.providerId,
            },
            {
              lyricsRepository: this.deps.lyricsRepository,
              catalogRepository: this.deps.catalogRepository,
              userTrackRepository: this.deps.userTrackRepository,
            }
          )
          .catch(syncError => {
            logger.warn('Lyrics timing sync failed (non-fatal)', {
              trackId: savedTrack.id,
              lyricsId: lyricsResult.lyricsId,
              error: syncError instanceof Error ? syncError.message : String(syncError),
            });
          });
      }

      await this.sessionService.markCompleted(
        sessionId,
        savedTrack.id,
        title,
        artworkResult.success ? artworkResult.artworkUrl : undefined,
        artworkResult.success ? undefined : artworkResult.error
      );

      const elapsedMs = Date.now() - startTime;
      logger.info('Track generation completed', {
        requestId,
        trackId: savedTrack.id,
        title,
        elapsedMs,
        targetVisibility,
      });

      // Emit analytics for user tracks
      if (!isContentPubliclyAccessible(targetVisibility)) {
        this.emitUserActivity(request.userId, 'track_generated', {
          trackId: savedTrack.id,
          title,
          duration: extractedDuration || audioResult.duration || 0,
          generationTimeMs: elapsedMs,
        });
      }

      return {
        success: true,
        trackId: savedTrack.id,
        title,
        fileUrl: audioStorageResult.publicUrl,
        artworkUrl: artworkResult.success ? artworkResult.artworkUrl : undefined,
        albumId: albumInfo.albumId,
        lyricsId: lyricsResult.lyricsId ?? null,
        duration: extractedDuration || audioResult.duration || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Track generation failed', {
        requestId,
        sessionId,
        error: errorMessage,
        targetVisibility,
      });

      if (sessionId) {
        await this.sessionService.markFailed(sessionId, errorMessage);
      }

      if (compensation.reservationId && compensation.userId) {
        try {
          const refundResult = await getServiceRegistry().userClient.refundCredits({
            userId: compensation.userId,
            amount: 1,
            description: `Generation failed: ${errorMessage}`,
            metadata: { reservationId: compensation.reservationId },
          });
          logger.info('Credit reservation compensated after generation failure', {
            requestId,
            reservationId: compensation.reservationId,
            userId: compensation.userId,
            refundSuccess: refundResult.success,
          });
        } catch (refundError) {
          logger.error('Failed to compensate credit reservation after generation failure', {
            requestId,
            reservationId: compensation.reservationId,
            userId: compensation.userId,
            error: refundError instanceof Error ? refundError.message : String(refundError),
          });
        }
      }

      await this.sessionService.compensate(sessionId || requestId, compensation);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async ensureSession(
    request: TrackGenerationRequest,
    existingSessionId: string | undefined,
    targetVisibility: TrackVisibility
  ): Promise<string> {
    if (existingSessionId) {
      return existingSessionId;
    }
    const session = await this.sessionService.create({
      userId: request.userId,
      targetVisibility,
      entryId: request.entryId ?? undefined,
      requestPayload: { prompt: request.prompt },
    });
    return session.id;
  }

  private extractErrorMessage(error: string | unknown, fallback: string): string {
    if (typeof error === 'string') {
      return error;
    }
    return error ? JSON.stringify(error) : fallback;
  }

  private async prepareEntryContent(
    request: TrackGenerationRequest,
    requestId: string
  ): Promise<ContentPreparationResult> {
    let entryContent = request.entryContent
      ? typeof request.entryContent === 'string'
        ? request.entryContent
        : request.entryContent.content
      : undefined;

    let suggestedStyle = request.style;
    let suggestedMood = request.mood;

    // Picture-to-song: analyze image to extract emotional content for lyrics
    if (request.artworkUrl && !entryContent) {
      const imageResult = await this.analyzeImageForLyrics(request, requestId);
      entryContent = imageResult.entryContent;
      suggestedStyle = suggestedStyle || imageResult.suggestedStyle || null;
      suggestedMood = suggestedMood || imageResult.suggestedMood || null;
    }

    // Source-to-song: use source text (book entry) for lyrics generation
    if (request.sourceText && !entryContent) {
      const sourceResult = this.prepareSourceContent(request);
      entryContent = sourceResult.entryContent;
      suggestedStyle = suggestedStyle || sourceResult.suggestedStyle;
      suggestedMood = suggestedMood || sourceResult.suggestedMood;
    }

    return { entryContent, suggestedStyle, suggestedMood };
  }

  private async generateAndStoreAudio(
    request: TrackGenerationRequest,
    sessionId: string,
    sanitizedLyrics: string,
    title: string,
    requestId: string
  ): Promise<{
    audioResult: { audioUrl: string; clipId?: string; duration?: number; providerId?: string };
    audioStorageResult: { publicUrl: string; fileSize?: number | null; fileId?: string };
  }> {
    await this.sessionService.updatePhase(sessionId, 'generating_music', 50);

    logger.info('[STEP 3/6] GENERATING_MUSIC phase started', {
      requestId,
      sessionId,
      title,
      lyricsLength: sanitizedLyrics.length,
    });

    const audioParams = MusicGenerationUtils.buildAudioParams({
      lyrics: sanitizedLyrics,
      title,
      style: request.style ?? undefined,
      genre: request.genre ?? undefined,
      genres: request.genres ?? undefined,
      mood: request.mood ?? undefined,
      isInstrumental: request.customInstrumental ?? undefined,
      instrumentType: request.instrumentType ?? undefined,
      vocalGender: request.vocalGender ?? undefined,
      negativeTags: request.negativeTags ?? undefined,
      culturalStyle: request.culturalStyle ?? undefined,
      styleWeight: request.styleWeight ?? undefined,
    });

    const audioResult = await this.generationUtils.generateAudio(audioParams);

    if (!audioResult.success || !audioResult.audioUrl) {
      const errMsg = this.extractErrorMessage(audioResult.error, 'Audio generation failed');
      logger.error('[STEP 3/6] AUDIO GENERATION FAILED', { requestId, sessionId, error: errMsg });
      throw PipelineError.generationFailed(errMsg);
    }

    logger.info('Audio generation result', {
      requestId,
      hasClipId: !!audioResult.clipId,
      clipId: audioResult.clipId || 'NOT_AVAILABLE',
    });

    // Early playback: Set streaming URL immediately
    await this.sessionService.updatePhase(sessionId, 'generating_music', 55, {
      streamingUrl: audioResult.audioUrl,
    });

    const audioStorageConfig: StoragePathConfig = { userId: request.userId, fileType: 'tracks' };

    const audioStorageResult = await this.generationUtils.storeAudioFile(
      audioResult.audioUrl,
      audioStorageConfig,
      requestId
    );

    if (!audioStorageResult.success || !audioStorageResult.publicUrl) {
      const errMsg = this.extractErrorMessage(audioStorageResult.error, 'Audio storage failed');
      throw PipelineError.persistenceFailed(errMsg);
    }

    return {
      audioResult: audioResult as { audioUrl: string; clipId?: string; duration?: number; providerId?: string },
      audioStorageResult: audioStorageResult as { publicUrl: string; fileSize?: number | null; fileId?: string },
    };
  }

  private async analyzeImageForLyrics(
    request: TrackGenerationRequest,
    requestId: string
  ): Promise<ContentPreparationResult> {
    logger.info('Picture-to-song: analyzing image', {
      requestId,
      userId: request.userId,
      targetVisibility: request.targetVisibility,
      hasContext: !!request.pictureContext,
    });

    const imageAnalysisService = getImageAnalysisService();
    if (!imageAnalysisService.isAvailable()) {
      logger.warn('Picture-to-song: image analysis not available', { requestId });
      return {
        entryContent: request.pictureContext || 'A moment captured in an image',
      };
    }

    const analysisResult = await imageAnalysisService.analyzeImage({
      artworkUrl: request.artworkUrl!,
      userContext: request.pictureContext ?? undefined,
      userId: request.userId,
      requestId,
      language: request.language ?? undefined,
    });

    if (analysisResult.success && analysisResult.entryContent) {
      const result: ContentPreparationResult = {
        entryContent: analysisResult.entryContent,
        suggestedStyle: analysisResult.analysis?.suggestedStyle,
        suggestedMood: analysisResult.analysis?.mood,
      };
      logger.info('Picture-to-song: image analysis completed', {
        requestId,
        mood: result.suggestedMood,
        style: result.suggestedStyle,
        contentLength: analysisResult.entryContent.length,
      });
      return result;
    }

    logger.warn('Picture-to-song: image analysis failed, using fallback', {
      requestId,
      error: analysisResult.error,
    });
    return {
      entryContent: request.pictureContext || 'A moment captured in an image',
    };
  }

  private prepareSourceContent(request: TrackGenerationRequest): ContentPreparationResult {
    logger.info('Source-to-song: using source text', {
      userId: request.userId,
      sourceEntryId: request.sourceEntryId,
      hasReference: !!request.sourceReference,
      bookTitle: request.sourceBookTitle,
    });

    let sourceContent = request.sourceText!;
    if (request.sourceReference) {
      sourceContent += `\n\n— ${request.sourceReference}`;
    }
    if (request.sourceBookTitle) {
      sourceContent += ` from "${request.sourceBookTitle}"`;
    }

    return {
      entryContent: sourceContent,
      suggestedStyle: 'contemplative, spiritual',
      suggestedMood: 'reflective, peaceful',
    };
  }

  private async setupArtworkGeneration(
    request: TrackGenerationRequest,
    sessionId: string,
    sanitizedLyrics: string,
    title: string,
    suggestedStyle: string | null | undefined,
    suggestedMood: string | null | undefined,
    targetVisibility: TrackVisibility,
    storageConfig: StoragePathConfig,
    requestId: string
  ): Promise<ArtworkResult> {
    if (request.artworkUrl) {
      logger.info('Picture-to-song: Using analyzed image as artwork', {
        requestId,
        userId: request.userId,
        artworkUrl: request.artworkUrl.substring(0, 80),
      });
      await this.sessionService.updatePhase(sessionId, 'generating_music', 40);
      return {
        success: true,
        artworkUrl: request.artworkUrl,
      };
    }

    await this.sessionService.updatePhase(sessionId, 'generating_artwork', 30);
    return this.generationUtils
      .generateArtwork(
        {
          lyrics: sanitizedLyrics,
          title,
          style: suggestedStyle ?? undefined,
          mood: suggestedMood ?? undefined,
          userId: request.userId,
          visibility: targetVisibility,
        },
        storageConfig,
        requestId
      )
      .catch((err): ArtworkResult => {
        logger.error('Artwork generation threw exception', { error: err instanceof Error ? err.message : String(err) });
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Artwork generation failed with exception',
        };
      });
  }

  private async resolveDisplayName(request: TrackGenerationRequest): Promise<string> {
    if (request.displayName) return request.displayName;
    try {
      const profileResult = await getServiceRegistry().userClient.getUserDisplayName(request.userId);
      if (profileResult.success && profileResult.displayName) return profileResult.displayName;
    } catch (err) {
      logger.warn('Failed to resolve display name for track generation, using fallback', {
        userId: request.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return '';
  }

  private async persistTrack(
    trackId: string,
    request: TrackGenerationRequest,
    title: string,
    audioStorageResult: { publicUrl: string; fileSize?: number | null },
    artworkResult: ArtworkResult,
    extractedDuration: number | undefined,
    audioResult: { duration?: number; clipId?: string },
    lyricsResult: { lyricsId?: string | null },
    albumInfo: { albumId: string; trackNumber?: number },
    targetVisibility: TrackVisibility
  ): Promise<{ id: string }> {
    const resolvedDisplayName = await this.resolveDisplayName(request);

    if (isContentPubliclyAccessible(targetVisibility)) {
      const sharedLanguage = request.language?.split('-')[0] || 'en';
      const trackData: NewTrack = {
        id: trackId,
        title,
        fileUrl: audioStorageResult.publicUrl,
        artworkUrl: artworkResult.success ? artworkResult.artworkUrl : undefined,
        duration: extractedDuration || audioResult.duration || 0,
        fileSize: audioStorageResult.fileSize ?? 0,
        mimeType: 'audio/mpeg',
        quality: 'high',
        userId: request.userId,
        albumId: albumInfo.albumId,
        lyricsId: lyricsResult.lyricsId ?? undefined,
        hasSyncedLyrics: false,
        generatedByUserId: request.userId,
        language: sharedLanguage,
        status: TRACK_LIFECYCLE.PUBLISHED,
        playCount: 0,
        metadata: {
          generatedAt: new Date().toISOString(),
          prompt: request.prompt,
          style: request.style,
          mood: request.mood,
          clipId: audioResult.clipId || undefined,
          displayName: resolvedDisplayName,
        },
      };

      const savedTrack = await this.deps.catalogRepository.saveTrack(trackData);
      await this.deps.albumRepository.refreshAlbumStats(albumInfo.albumId);
      return savedTrack;
    }

    const baseLanguage = request.language?.split('-')[0] || 'en';

    const trackData: TrackData = {
      id: trackId,
      userId: request.userId,
      title,
      fileUrl: audioStorageResult.publicUrl,
      artworkUrl: artworkResult.success ? artworkResult.artworkUrl : undefined,
      duration: extractedDuration || audioResult.duration || 0,
      fileSize: audioStorageResult.fileSize ?? 0,
      mimeType: 'audio/mpeg',
      quality: 'high',
      status: TRACK_LIFECYCLE.ACTIVE,
      visibility: CONTENT_VISIBILITY.PERSONAL,
      sourceType: 'generated',
      language: baseLanguage,
      albumId: albumInfo.albumId,
      lyricsId: lyricsResult.lyricsId ?? undefined,
      hasSyncedLyrics: false,
      generationNumber: 1,
      trackNumber: albumInfo.trackNumber,
      playOnDate: request.playOnDate ?? undefined,
      metadata: {
        generatedAt: new Date().toISOString(),
        prompt: request.prompt,
        style: request.style,
        mood: request.mood,
        language: request.language,
        clipId: audioResult.clipId || undefined,
        displayName: resolvedDisplayName,
      },
    };

    const track = Track.create(trackData);
    const savedTrack = await this.deps.userTrackRepository.save(track);
    await this.deps.albumRepository.updateTotals(albumInfo.albumId);
    return savedTrack;
  }

  private async resolveAlbum(
    request: TrackGenerationRequest,
    targetVisibility: string
  ): Promise<{ albumId: string; trackNumber?: number }> {
    const albumId = request.albumId;

    if (albumId) {
      if (!isContentPubliclyAccessible(targetVisibility)) {
        const trackNumber = await this.deps.albumRepository.getNextTrackNumber(albumId);
        return { albumId, trackNumber };
      }
      return { albumId };
    }

    if (isContentPubliclyAccessible(targetVisibility)) {
      const singlesAlbum = await getOrCreateSinglesAlbumForUser(request.userId);
      return { albumId: singlesAlbum.albumId };
    }

    // For personal tracks, check if there's a chapter-linked album
    if (request.chapterId) {
      const existingAlbum = await this.deps.albumRepository.findByUserIdAndChapterId(
        request.userId,
        request.chapterId,
        'user'
      );
      if (existingAlbum) {
        const trackNumber = await this.deps.albumRepository.getNextTrackNumber(existingAlbum.id);
        return { albumId: existingAlbum.id, trackNumber };
      }
    }

    // Personal tracks without a chapter-linked album get a default personal album
    // album_id is NOT NULL in mus_tracks, so every track must belong to an album
    const { getOrCreatePersonalAlbumForUser } = await import('../helpers/PersonalAlbumHelper');
    const personalAlbum = await getOrCreatePersonalAlbumForUser(request.userId);
    const trackNumber = await this.deps.albumRepository.getNextTrackNumber(personalAlbum.albumId);
    return { albumId: personalAlbum.albumId, trackNumber };
  }

  private emitUserActivity(userId: string, activityType: string, data: Record<string, unknown>): void {
    try {
      analyticsPublisher.recordEvent({
        eventType: activityType,
        eventData: data,
        userId,
      });
    } catch (analyticsError) {
      logger.debug('Analytics event failed (non-blocking)', {
        activityType,
        userId,
        error: analyticsError instanceof Error ? analyticsError.message : String(analyticsError),
      });
    }
  }
}
