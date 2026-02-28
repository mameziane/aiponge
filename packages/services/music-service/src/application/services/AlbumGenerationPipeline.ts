/**
 * AlbumGenerationPipeline - Orchestrates album generation with explicit state machine
 *
 * States:
 * INITIALIZING → VALIDATING → CREATING_ALBUM → PREPARING_TRACKS → GENERATING_TRACKS →
 * GENERATING_ARTWORK → LINKING → FINALIZING → COMPLETED | FAILED
 *
 * Design goals:
 * - Clear state transitions with defined inputs/outputs per state
 * - Centralized progress tracking via ProgressContext
 * - Partial failure support (some tracks can fail without aborting album)
 * - Uses RefactoredTrackGenerationHandler for individual track generation
 * - Tier-specific generation settings via TierConfigClient
 */

import { getLogger } from '../../config/service-urls';
import { v4 as uuidv4 } from 'uuid';
import { ErrorClassifier, PipelineErrorCode } from '../errors';
import { type PersistenceContext, type ContentVisibility } from '../shared/persistence-types';
import pLimit from 'p-limit';
import { TierConfigClient } from '@aiponge/platform-core';

export type { PersistenceContext, ContentVisibility };

const logger = getLogger('music-service:album-generation-pipeline');

// Default fallback values (used when tier config unavailable)
const DEFAULT_PARALLEL_TRACK_LIMIT = Math.max(1, parseInt(process.env.TRACK_GENERATION_CONCURRENCY || '10', 10) || 10);

export enum AlbumGenerationState {
  INITIALIZING = 'initializing',
  VALIDATING = 'validating',
  CREATING_ALBUM = 'creating_album',
  PREPARING_TRACKS = 'preparing_tracks',
  GENERATING_TRACKS = 'generating_tracks',
  GENERATING_ARTWORK = 'generating_artwork',
  LINKING = 'linking',
  FINALIZING = 'finalizing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AlbumEntry {
  entryId: string;
  content: string;
  order: number;
}

export interface AlbumGenerationConfig {
  userId: string;
  requestId?: string;
  chapterId?: string;
  chapterTitle?: string;
  bookId: string;
  bookTitle: string;
  bookType?: string;
  bookDescription?: string;
  bookCategory?: string;
  bookTags?: string[];
  bookThemes?: string[];
  entries: AlbumEntry[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  style?: string;
  genre?: string;
  mood?: string;
  language?: string;
  culturalLanguages?: string[];
  languageMode?: 'single' | 'all';
  targetLanguages?: string[];
  culturalStyle?: string;
  instrumentType?: string;
  negativeTags?: string;
  vocalGender?: 'f' | 'm';
  isInstrumental?: boolean;
  styleWeight?: number;
  genres?: string[];
  persistenceContext?: PersistenceContext;
  preCreatedAlbumId?: string;
  tier?: string;
  displayName?: string;
}

export interface TrackResult {
  entryId: string;
  order: number;
  success: boolean;
  requestId?: string;
  trackId?: string;
  lyricsId?: string;
  language?: string;
  variantGroupId?: string;
  title?: string;
  artworkUrl?: string;
  audioFileUrl?: string;
  lyrics?: string;
  error?: string;
  code?: string;
  pendingLyricsSync?: PendingLyricsSync;
}

export interface TrackCardDetail {
  entryId: string;
  order: number;
  language?: string;
  variantGroupId?: string;
  phase: 'queued' | 'lyrics' | 'audio' | 'storing' | 'saving' | 'lyrics_sync' | 'completed' | 'failed';
  percentComplete: number;
  title?: string;
  artworkUrl?: string;
  audioFileUrl?: string;
  lyrics?: string;
  trackId?: string;
  error?: string;
  success?: boolean;
}

const SUB_PHASE_CUMULATIVE: Record<string, number> = {
  lyrics: 0.05,
  audio: 0.2,
  storing: 0.7,
  saving: 0.9,
};

export interface PendingLyricsSync {
  trackId: string;
  lyricsId: string;
  clipId?: string;
  lyricsContent: string;
  audioUrl: string;
  visibility: string;
  providerId?: string;
}

export interface ProgressContext {
  albumRequestId: string;
  albumId?: string;
  albumTitle: string;
  albumArtworkUrl?: string;
  userId: string;
  persistenceContext?: PersistenceContext;
  generationNumber: number;
  state: AlbumGenerationState;
  currentTrack: number;
  totalTracks: number;
  currentEntryId?: string;
  subPhase?: 'lyrics' | 'artwork' | 'audio' | 'storing' | 'saving' | 'lyrics_sync';
  percentComplete: number;
  trackProgress: Map<string, number>;
  trackCardDetails: Map<string, TrackCardDetail>;
  trackResults: TrackResult[];
  successfulTracks: number;
  failedTracks: number;
  successfulLanguages: Set<string>;
  failedLanguages: Set<string>;
  error?: string;
  errorCode?: string;
  errorSeverity?: 'validation' | 'transient' | 'permanent';
  earlyArtworkPromise?: Promise<string | undefined>;
  pendingLyricsSyncs: PendingLyricsSync[];
  cachedUserContext?: CachedUserContext;
}

export interface AlbumGenerationResult {
  success: boolean;
  albumId?: string;
  albumTitle?: string;
  albumArtworkUrl?: string;
  albumRequestId: string;
  totalTracks: number;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  tracks: TrackResult[];
  successfulTracks: number;
  failedTracks: number;
  estimatedDuration?: number;
  languageMode?: 'single' | 'all';
  generatedLanguages?: string[];
  failedLanguages?: string[];
  error?: string;
  code?: string;
}

export type ProgressCallback = (progress: ProgressUpdate) => void | Promise<void>;

export interface ProgressUpdate {
  albumRequestId: string;
  albumId?: string;
  albumTitle?: string;
  albumArtworkUrl?: string;
  userId: string;
  currentTrack: number;
  totalTracks: number;
  currentEntryId?: string;
  phase: string;
  subPhase?: 'lyrics' | 'artwork' | 'audio' | 'storing' | 'saving' | 'lyrics_sync';
  percentComplete: number;
  trackResults: TrackResult[];
  trackCardDetails?: TrackCardDetail[];
  error?: string;
  errorCode?: string;
  errorSeverity?: 'validation' | 'transient' | 'permanent';
  status?: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  successfulTracks?: number;
  failedTracks?: number;
}

export interface StateTransitionResult {
  success: boolean;
  nextState: AlbumGenerationState;
  error?: string;
  code?: string;
  severity?: 'validation' | 'transient' | 'permanent';
  retryable?: boolean;
}

export interface AlbumCreationResult {
  albumId: string;
  generationNumber: number;
}

export interface AlbumCreationHandler {
  createAlbum(config: AlbumGenerationConfig, context: ProgressContext): Promise<AlbumCreationResult>;
}

export interface SubPhaseData {
  title?: string;
  lyrics?: string;
  artworkUrl?: string;
  audioFileUrl?: string;
}

export type SubPhaseCallback = (
  subPhase: 'lyrics' | 'artwork' | 'audio' | 'storing' | 'saving' | 'lyrics_sync',
  progressIncrement?: number,
  data?: SubPhaseData
) => Promise<void>;

export interface CachedUserContext {
  readonly preferences?: { currentMood?: string; displayName?: string; languagePreference?: string; emotionalState?: string; wellnessIntention?: string };
  readonly narrativeSeeds?: { keywords?: string[]; emotionalProfile?: Record<string, unknown> };
  readonly persona?: Record<string, unknown>;
}

/**
 * Read-only context for track generation.
 * This type enforces immutability during parallel track generation.
 * Only includes fields that are read by generateTrack - no mutable counters/progress.
 */
export interface ReadOnlyTrackContext {
  readonly albumRequestId: string;
  readonly albumId?: string;
  readonly albumTitle: string;
  readonly userId: string;
  readonly persistenceContext?: PersistenceContext;
  readonly generationNumber: number;
  readonly cachedUserContext?: CachedUserContext;
}

export interface TrackGenerationHandler {
  generateTrack(
    entry: AlbumEntry,
    language: string,
    variantGroupId: string,
    config: AlbumGenerationConfig,
    context: ReadOnlyTrackContext,
    onSubPhase?: SubPhaseCallback
  ): Promise<TrackResult>;
}

export interface ArtworkGenerationHandler {
  generateArtwork(
    content: string,
    title: string,
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<string | undefined>;
}

export interface AlbumLinkingHandler {
  linkTracksToAlbum(
    albumId: string,
    trackIds: string[],
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<void>;

  finalizeAlbum(
    albumId: string,
    artworkUrl: string | undefined,
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<void>;
}

export interface TitleTranslationHandler {
  translateTitle(title: string, targetLanguage: string): Promise<string>;
}

export interface LyricsSyncHandler {
  syncAllPending(syncs: PendingLyricsSync[], albumRequestId: string): Promise<void>;
}

export interface UserContextFetcher {
  fetchUserContext(userId: string, requestId: string): Promise<CachedUserContext>;
}

export interface AlbumPipelineDependencies {
  albumCreation: AlbumCreationHandler;
  trackGeneration: TrackGenerationHandler;
  artworkGeneration: ArtworkGenerationHandler;
  albumLinking: AlbumLinkingHandler;
  titleTranslation?: TitleTranslationHandler;
  lyricsSync?: LyricsSyncHandler;
  userContextFetcher?: UserContextFetcher;
}

const SUPPORTED_LANGUAGES = ['en-US', 'es-ES', 'de-DE', 'fr-FR', 'pt-BR', 'ar', 'ja-JP'] as const;

export class AlbumGenerationPipeline {
  private progressCallback?: ProgressCallback;
  private tierConfigClient: TierConfigClient;

  constructor(
    private readonly dependencies: AlbumPipelineDependencies,
    progressCallback?: ProgressCallback
  ) {
    this.progressCallback = progressCallback;
    this.tierConfigClient = new TierConfigClient();
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  async execute(config: AlbumGenerationConfig): Promise<AlbumGenerationResult> {
    const context = this.initializeContext(config);

    logger.info('Album generation pipeline starting', {
      albumRequestId: context.albumRequestId,
      userId: config.userId,
      entryCount: config.entries.length,
      totalTracks: context.totalTracks,
    });

    try {
      let currentState = AlbumGenerationState.INITIALIZING;

      while (currentState !== AlbumGenerationState.COMPLETED && currentState !== AlbumGenerationState.FAILED) {
        const result = await this.executeState(currentState, config, context);

        if (!result.success) {
          context.error = result.error;
          context.errorCode = result.code;
          context.errorSeverity = result.severity;
          currentState = AlbumGenerationState.FAILED;
        } else {
          currentState = result.nextState;
        }

        context.state = currentState;
        await this.emitProgress(context);
      }

      const result = this.buildResult(config, context);

      this.runBackgroundLyricsSync(context);

      return result;
    } catch (error) {
      const classified = ErrorClassifier.classify(error, PipelineErrorCode.UNKNOWN);
      logger.error('Album generation pipeline failed', {
        albumRequestId: context.albumRequestId,
        error: classified.message,
        code: classified.code,
        severity: classified.severity,
        retryable: classified.retryable,
        state: context.state,
      });

      context.state = AlbumGenerationState.FAILED;
      context.error = classified.message;
      context.errorCode = classified.code;
      context.errorSeverity = classified.severity;
      await this.emitProgress(context);

      return this.buildResult(config, context);
    }
  }

  private initializeContext(config: AlbumGenerationConfig): ProgressContext {
    const albumRequestId = config.requestId || uuidv4();
    const languageMode = config.languageMode || 'single';
    const targetLanguages: string[] =
      languageMode === 'all' ? config.targetLanguages || [...SUPPORTED_LANGUAGES] : [config.language || 'en-US'];

    const totalTracks = config.entries.length * targetLanguages.length;
    const albumTitle = config.bookTitle;

    const albumId = config.persistenceContext?.albumId || config.preCreatedAlbumId;

    return {
      albumRequestId,
      albumId,
      albumTitle,
      userId: config.userId,
      persistenceContext: config.persistenceContext,
      generationNumber: 1, // Will be updated when album is created/reused
      state: AlbumGenerationState.INITIALIZING,
      currentTrack: 0,
      totalTracks,
      percentComplete: 0,
      trackProgress: new Map<string, number>(),
      trackCardDetails: new Map<string, TrackCardDetail>(),
      trackResults: [],
      successfulTracks: 0,
      failedTracks: 0,
      successfulLanguages: new Set<string>(),
      failedLanguages: new Set<string>(),
      pendingLyricsSyncs: [],
    };
  }

  private async executeState(
    state: AlbumGenerationState,
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    switch (state) {
      case AlbumGenerationState.INITIALIZING:
        return this.stateInitializing(config, context);

      case AlbumGenerationState.VALIDATING:
        return this.stateValidating(config, context);

      case AlbumGenerationState.CREATING_ALBUM:
        return this.stateCreatingAlbum(config, context);

      case AlbumGenerationState.PREPARING_TRACKS:
        return this.statePreparingTracks(config, context);

      case AlbumGenerationState.GENERATING_TRACKS:
        return this.stateGeneratingTracks(config, context);

      case AlbumGenerationState.GENERATING_ARTWORK:
        return this.stateGeneratingArtwork(config, context);

      case AlbumGenerationState.LINKING:
        return this.stateLinking(config, context);

      case AlbumGenerationState.FINALIZING:
        return this.stateFinalizing(config, context);

      default:
        return { success: false, nextState: AlbumGenerationState.FAILED, error: 'Unknown state' };
    }
  }

  private async stateInitializing(
    _config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 0;
    logger.debug('State: INITIALIZING', { albumRequestId: context.albumRequestId });
    return { success: true, nextState: AlbumGenerationState.VALIDATING };
  }

  private async stateValidating(
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 2;
    logger.debug('State: VALIDATING', { albumRequestId: context.albumRequestId });

    if (!config.entries || config.entries.length === 0) {
      return {
        success: false,
        nextState: AlbumGenerationState.FAILED,
        error: 'No entries provided for album generation',
        code: PipelineErrorCode.MISSING_REQUIRED_FIELD,
        severity: 'validation',
        retryable: false,
      };
    }

    const emptyEntries = config.entries.filter(e => !e.content || e.content.trim().length === 0);
    if (emptyEntries.length > 0) {
      logger.warn('Filtering out entries with empty content', {
        albumRequestId: context.albumRequestId,
        emptyEntryIds: emptyEntries.map(e => e.entryId),
        emptyCount: emptyEntries.length,
        totalBefore: config.entries.length,
      });
      config.entries = config.entries.filter(e => e.content && e.content.trim().length > 0);
      if (config.entries.length === 0) {
        return {
          success: false,
          nextState: AlbumGenerationState.FAILED,
          error: 'All entries have empty content - no tracks to generate',
          code: PipelineErrorCode.MISSING_REQUIRED_FIELD,
          severity: 'validation',
          retryable: false,
        };
      }
      const languageMode = config.languageMode || 'single';
      const targetLanguages: string[] =
        languageMode === 'all' ? config.targetLanguages || [...SUPPORTED_LANGUAGES] : [config.language || 'en-US'];
      context.totalTracks = config.entries.length * targetLanguages.length;
    }

    if (config.entries.length > 20) {
      return {
        success: false,
        nextState: AlbumGenerationState.FAILED,
        error: 'Maximum 20 tracks per album allowed',
        code: PipelineErrorCode.LIMIT_EXCEEDED,
        severity: 'validation',
        retryable: false,
      };
    }

    return { success: true, nextState: AlbumGenerationState.CREATING_ALBUM };
  }

  private async stateCreatingAlbum(
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 5;
    logger.debug('State: CREATING_ALBUM', {
      albumRequestId: context.albumRequestId,
      visibility: context.persistenceContext?.visibility,
      hasPreCreatedAlbumId: !!context.albumId,
    });

    const targetLanguage = config.language || config.targetLanguages?.[0] || 'en-US';
    const isNonEnglish = !targetLanguage.startsWith('en');
    if (isNonEnglish && this.dependencies.titleTranslation && context.albumTitle) {
      try {
        const translatedTitle = await this.dependencies.titleTranslation.translateTitle(
          context.albumTitle,
          targetLanguage
        );
        if (translatedTitle && translatedTitle.trim().length > 0) {
          logger.info('Album title translated for target language', {
            originalTitle: context.albumTitle,
            translatedTitle,
            targetLanguage,
            albumRequestId: context.albumRequestId,
          });
          context.albumTitle = translatedTitle;
        }
      } catch (error) {
        logger.warn('Album title translation failed, using original title', {
          originalTitle: context.albumTitle,
          targetLanguage,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      if (!context.albumId) {
        const result = await this.dependencies.albumCreation.createAlbum(config, context);
        context.albumId = result.albumId;
        context.generationNumber = result.generationNumber;
      }
      if (!context.albumId) {
        return {
          success: false,
          nextState: AlbumGenerationState.FAILED,
          error: 'Failed to create or obtain album ID',
          code: PipelineErrorCode.ALBUM_CREATION_FAILED,
          severity: 'permanent',
          retryable: false,
        };
      }
      if (context.persistenceContext) {
        context.persistenceContext.albumId = context.albumId;
      }

      return { success: true, nextState: AlbumGenerationState.PREPARING_TRACKS };
    } catch (error) {
      const classified = ErrorClassifier.classify(error, PipelineErrorCode.ALBUM_CREATION_FAILED);
      return {
        success: false,
        nextState: AlbumGenerationState.FAILED,
        error: `Album creation failed: ${classified.message}`,
        code: classified.code,
        severity: classified.severity,
        retryable: classified.retryable,
      };
    }
  }

  private async statePreparingTracks(
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 8;
    logger.debug('State: PREPARING_TRACKS', {
      albumRequestId: context.albumRequestId,
      entryCount: config.entries.length,
    });

    if (this.dependencies.userContextFetcher) {
      try {
        context.cachedUserContext = await this.dependencies.userContextFetcher.fetchUserContext(
          config.userId,
          context.albumRequestId
        );
        logger.info('User context cached for album generation', {
          albumRequestId: context.albumRequestId,
          hasPreferences: !!context.cachedUserContext.preferences,
          hasPersona: !!context.cachedUserContext.persona,
          hasSeeds: !!context.cachedUserContext.narrativeSeeds,
        });
      } catch (error) {
        logger.warn('Failed to pre-fetch user context, will fetch per-track', {
          albumRequestId: context.albumRequestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const firstEntry = config.entries.sort((a, b) => a.order - b.order)[0];
    if (firstEntry) {
      context.earlyArtworkPromise = this.dependencies.artworkGeneration
        .generateArtwork(firstEntry.content, context.albumTitle, config, context)
        .then(async artworkUrl => {
          if (artworkUrl && !context.albumArtworkUrl) {
            context.albumArtworkUrl = artworkUrl;
            await this.emitProgress(context);
          }
          return artworkUrl;
        })
        .catch(error => {
          logger.warn('Early artwork generation failed', { error: String(error) });
          return undefined;
        });
    }

    return { success: true, nextState: AlbumGenerationState.GENERATING_TRACKS };
  }

  private async stateGeneratingTracks(
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    // Fetch tier-specific generation settings with fallback to defaults
    let parallelTrackLimit = DEFAULT_PARALLEL_TRACK_LIMIT;
    try {
      if (config.tier) {
        const generationSettings = await this.tierConfigClient.getGenerationSettings(config.tier);
        parallelTrackLimit = generationSettings.parallelTrackLimit;
      }
    } catch (error) {
      logger.warn('Failed to fetch tier generation settings, using defaults', { tier: config.tier, error });
    }

    logger.info('State: GENERATING_TRACKS - Starting parallel generation', {
      albumRequestId: context.albumRequestId,
      totalTracks: context.totalTracks,
      parallelLimit: parallelTrackLimit,
      tier: config.tier,
    });

    const languageMode = config.languageMode || 'single';
    const targetLanguages: string[] =
      languageMode === 'all' ? config.targetLanguages || [...SUPPORTED_LANGUAGES] : [config.language || 'en-US'];

    const sortedEntries = [...config.entries].sort((a, b) => a.order - b.order);

    // Create controlled concurrency limiter with tier-specific limit
    const limit = pLimit(parallelTrackLimit);

    // Build array of all track generation tasks
    interface TrackTask {
      entry: AlbumEntry;
      language: string;
      variantGroupId: string;
      order: number;
    }

    const trackTasks: TrackTask[] = sortedEntries.flatMap(entry => {
      const variantGroupId = uuidv4();
      return targetLanguages.map(lang => ({
        entry,
        language: lang,
        variantGroupId,
        order: entry.order,
      }));
    });

    logger.info('Executing parallel track generation', {
      albumRequestId: context.albumRequestId,
      totalTasks: trackTasks.length,
      parallelLimit: parallelTrackLimit,
    });

    // Create a read-only snapshot of context for parallel track generation
    // This enforces immutability at the type level - generateTrack cannot mutate counters/progress
    const trackContext: ReadOnlyTrackContext = Object.freeze({
      albumRequestId: context.albumRequestId,
      albumId: context.albumId,
      albumTitle: context.albumTitle,
      userId: context.userId,
      persistenceContext: context.persistenceContext,
      generationNumber: context.generationNumber,
      cachedUserContext: context.cachedUserContext,
    });

    // Mutex for serializing progress updates - enables real-time emission without race conditions
    // Each track completion awaits the mutex, updates context, emits, then releases
    let progressMutex: Promise<void> = Promise.resolve();
    const trackResults: (TrackResult & { task: TrackTask })[] = [];

    // Execute all tracks in parallel with controlled concurrency
    // Each task uses mutex to serialize progress updates for real-time emission
    // trackContext is frozen and typed as ReadOnlyTrackContext - enforces immutability
    // Stagger delay is now applied inside generateAudio (MusicAPI calls only),
    // so lyrics/artwork start immediately without waiting
    const results = await Promise.allSettled(
      trackTasks.map(task =>
        limit(async () => {
          const { entry, language, variantGroupId } = task;

          const trackKey = `${entry.entryId}:${language}:${variantGroupId}`;

          progressMutex = progressMutex.then(async () => {
            context.trackProgress.set(trackKey, 0);
            context.trackCardDetails.set(trackKey, {
              entryId: entry.entryId,
              order: entry.order,
              language,
              variantGroupId,
              phase: 'queued',
              percentComplete: 0,
            });
            context.percentComplete = this.calculateProgress(context);
            await this.emitProgress(context);
          });
          await progressMutex;

          try {
            const onSubPhase: SubPhaseCallback = async (subPhase, _progressIncrement = 0, data?: SubPhaseData) => {
              const fraction = SUB_PHASE_CUMULATIVE[subPhase] ?? 0;
              progressMutex = progressMutex.then(async () => {
                context.trackProgress.set(trackKey, fraction);
                context.subPhase = subPhase;
                const card = context.trackCardDetails.get(trackKey);
                if (card) {
                  card.phase = subPhase as TrackCardDetail['phase'];
                  card.percentComplete = Math.round(fraction * 100);
                  if (data?.title) card.title = data.title;
                  if (data?.lyrics) card.lyrics = data.lyrics;
                  if (data?.artworkUrl) card.artworkUrl = data.artworkUrl;
                  if (data?.audioFileUrl) card.audioFileUrl = data.audioFileUrl;
                }
                context.percentComplete = this.calculateProgress(context);
                await this.emitProgress(context);
              });
              await progressMutex;
            };

            const result = await this.dependencies.trackGeneration.generateTrack(
              entry,
              language,
              variantGroupId,
              config,
              trackContext,
              onSubPhase
            );

            logger.info('Track generation completed', {
              albumRequestId: context.albumRequestId,
              entryId: entry.entryId,
              language,
              success: result.success,
            });

            const trackResult = { ...result, task } as TrackResult & { task: TrackTask };

            progressMutex = progressMutex.then(async () => {
              trackResults.push(trackResult);
              context.trackProgress.set(trackKey, 1.0);
              const card = context.trackCardDetails.get(trackKey);
              if (card) {
                card.phase = result.success ? 'completed' : 'failed';
                card.percentComplete = 100;
                card.success = result.success;
                card.trackId = result.trackId;
                card.title = result.title;
                card.artworkUrl = result.artworkUrl;
                card.audioFileUrl = result.audioFileUrl;
                card.lyrics = result.lyrics;
                card.error = result.error;
              }
              if (result.success) {
                context.successfulTracks++;
                if (trackResult.language) {
                  context.successfulLanguages.add(trackResult.language);
                }
                if (result.pendingLyricsSync) {
                  context.pendingLyricsSyncs.push(result.pendingLyricsSync);
                }
              } else {
                context.failedTracks++;
                if (trackResult.language) {
                  context.failedLanguages.add(trackResult.language);
                }
              }
              context.currentTrack = trackResults.length;
              context.subPhase = undefined;
              context.percentComplete = this.calculateProgress(context);
              await this.emitProgress(context);
            });
            await progressMutex;

            return trackResult;
          } catch (error) {
            const classified = ErrorClassifier.classify(error, PipelineErrorCode.MUSIC_GENERATION_FAILED);
            logger.error('Track generation failed', {
              entryId: entry.entryId,
              language,
              error: classified.message,
              code: classified.code,
              severity: classified.severity,
            });

            const errorResult = {
              entryId: entry.entryId,
              order: entry.order,
              success: false,
              language,
              variantGroupId,
              error: classified.message,
              code: classified.code,
              task,
            } as TrackResult & { task: TrackTask };

            progressMutex = progressMutex.then(async () => {
              trackResults.push(errorResult);
              context.trackProgress.set(trackKey, 1.0);
              const card = context.trackCardDetails.get(trackKey);
              if (card) {
                card.phase = 'failed';
                card.percentComplete = 100;
                card.success = false;
                card.error = classified.message;
              }
              context.failedTracks++;
              if (errorResult.language) {
                context.failedLanguages.add(errorResult.language);
              }
              context.currentTrack = trackResults.length;
              context.subPhase = undefined;
              context.percentComplete = this.calculateProgress(context);
              await this.emitProgress(context);
            });
            await progressMutex;

            return errorResult;
          }
        })
      )
    );

    // Final wait for any pending progress emissions
    await progressMutex;

    // Build final trackResults from collected results (already processed during generation)
    context.subPhase = undefined;
    context.trackResults = trackResults.map(({ task, ...rest }) => rest as TrackResult);

    // Sort trackResults by order to maintain album track ordering
    context.trackResults.sort((a, b) => a.order - b.order);

    logger.info('Parallel track generation completed', {
      albumRequestId: context.albumRequestId,
      successfulTracks: context.successfulTracks,
      failedTracks: context.failedTracks,
      totalTracks: context.totalTracks,
    });

    if (context.successfulTracks === 0) {
      return {
        success: false,
        nextState: AlbumGenerationState.FAILED,
        error: 'All track generations failed',
        code: PipelineErrorCode.GENERATION_FAILED,
        severity: 'permanent',
        retryable: false,
      };
    }

    return { success: true, nextState: AlbumGenerationState.GENERATING_ARTWORK };
  }

  private async stateGeneratingArtwork(
    _config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 90;
    logger.debug('State: GENERATING_ARTWORK', { albumRequestId: context.albumRequestId });

    if (context.earlyArtworkPromise && !context.albumArtworkUrl) {
      try {
        const artworkUrl = await context.earlyArtworkPromise;
        if (artworkUrl) {
          context.albumArtworkUrl = artworkUrl;
        }
      } catch (error) {
        logger.warn('Final artwork resolution failed', { error: String(error) });
      }
    }

    return { success: true, nextState: AlbumGenerationState.LINKING };
  }

  private async stateLinking(config: AlbumGenerationConfig, context: ProgressContext): Promise<StateTransitionResult> {
    context.percentComplete = 93;

    const albumId = context.albumId;

    logger.debug('State: LINKING', {
      albumRequestId: context.albumRequestId,
      albumId,
      visibility: context.persistenceContext?.visibility,
      successfulTracks: context.successfulTracks,
    });

    if (!albumId) {
      logger.warn('No album ID available for linking, skipping to finalization');
      return { success: true, nextState: AlbumGenerationState.FINALIZING };
    }

    try {
      const successfulTrackIds = context.trackResults.filter(t => t.success && t.trackId).map(t => t.trackId!);

      if (successfulTrackIds.length > 0) {
        await this.dependencies.albumLinking.linkTracksToAlbum(albumId, successfulTrackIds, config, context);
        logger.info('Tracks linked to album', {
          albumId,
          trackCount: successfulTrackIds.length,
        });
      }

      return { success: true, nextState: AlbumGenerationState.FINALIZING };
    } catch (error) {
      logger.warn('Track linking failed, continuing to finalization', { error: String(error) });
      return { success: true, nextState: AlbumGenerationState.FINALIZING };
    }
  }

  private async stateFinalizing(
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<StateTransitionResult> {
    context.percentComplete = 97;

    const albumId = context.albumId;

    logger.debug('State: FINALIZING', {
      albumRequestId: context.albumRequestId,
      albumId,
      visibility: context.persistenceContext?.visibility,
      hasArtwork: !!context.albumArtworkUrl,
    });

    if (albumId) {
      try {
        await this.dependencies.albumLinking.finalizeAlbum(albumId, context.albumArtworkUrl, config, context);
        logger.info('Album finalized', { albumId, visibility: context.persistenceContext?.visibility });
      } catch (error) {
        logger.warn('Album finalization failed', { error: String(error) });
      }
    }

    context.percentComplete = 100;
    return { success: true, nextState: AlbumGenerationState.COMPLETED };
  }

  private calculateProgress(context: ProgressContext): number {
    const baseProgress = 10;
    const trackGenerationRange = 80;
    const total = context.totalTracks;
    if (total === 0) return baseProgress;

    let totalFraction = 0;
    for (const fraction of context.trackProgress.values()) {
      totalFraction += fraction;
    }

    const progressFromTracks = (totalFraction / total) * trackGenerationRange;
    return Math.min(baseProgress + Math.floor(progressFromTracks), 90);
  }

  private async emitProgress(context: ProgressContext): Promise<void> {
    if (!this.progressCallback) return;

    // Compute status based on current context state
    const status = this.determineStatus(context);

    const update: ProgressUpdate = {
      albumRequestId: context.albumRequestId,
      albumId: context.albumId,
      albumTitle: context.albumTitle,
      albumArtworkUrl: context.albumArtworkUrl,
      userId: context.userId,
      currentTrack: context.currentTrack,
      totalTracks: context.totalTracks,
      currentEntryId: context.currentEntryId,
      phase: context.state,
      subPhase: context.subPhase,
      percentComplete: context.percentComplete,
      trackResults: context.trackResults,
      trackCardDetails: Array.from(context.trackCardDetails.values()),
      error: context.error,
      errorCode: context.errorCode,
      errorSeverity: context.errorSeverity,
      status,
      successfulTracks: context.successfulTracks,
      failedTracks: context.failedTracks,
    };

    try {
      await this.progressCallback(update);
    } catch (error) {
      logger.warn('Progress callback failed', { error: String(error) });
    }
  }

  private buildResult(config: AlbumGenerationConfig, context: ProgressContext): AlbumGenerationResult {
    const languageMode = config.languageMode || 'single';
    const status = this.determineStatus(context);

    return {
      success: context.state === AlbumGenerationState.COMPLETED || context.successfulTracks > 0,
      albumId: context.albumId,
      albumTitle: context.albumTitle,
      albumArtworkUrl: context.albumArtworkUrl,
      albumRequestId: context.albumRequestId,
      totalTracks: context.totalTracks,
      status,
      tracks: context.trackResults,
      successfulTracks: context.successfulTracks,
      failedTracks: context.failedTracks,
      languageMode,
      generatedLanguages: Array.from(context.successfulLanguages),
      failedLanguages: Array.from(context.failedLanguages),
      error: context.error,
      code: context.errorCode,
    };
  }

  private runBackgroundLyricsSync(context: ProgressContext): void {
    const pendingSyncs = context.pendingLyricsSyncs;
    if (pendingSyncs.length === 0) {
      logger.debug('No pending lyrics syncs to run', { albumRequestId: context.albumRequestId });
      return;
    }

    if (!this.dependencies.lyricsSync) {
      logger.warn('No lyrics sync handler configured, skipping background sync', {
        albumRequestId: context.albumRequestId,
        pendingCount: pendingSyncs.length,
      });
      return;
    }

    logger.info('Firing background lyrics sync for completed tracks', {
      albumRequestId: context.albumRequestId,
      pendingCount: pendingSyncs.length,
    });

    this.dependencies.lyricsSync
      .syncAllPending(pendingSyncs, context.albumRequestId)
      .catch(error => {
        logger.error('Background lyrics sync batch failed', {
          albumRequestId: context.albumRequestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private determineStatus(context: ProgressContext): 'queued' | 'processing' | 'completed' | 'partial' | 'failed' {
    if (context.state === AlbumGenerationState.FAILED && context.successfulTracks === 0) {
      return 'failed';
    }
    if (context.failedTracks > 0 && context.successfulTracks > 0) {
      return 'partial';
    }
    if (context.state === AlbumGenerationState.COMPLETED) {
      return 'completed';
    }
    return 'processing';
  }
}
