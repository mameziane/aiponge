import { getLogger } from '../../config/service-urls';
import {
  LyricsPreparationService,
  LyricsPreparationRequest,
  type CachedUserContextInput,
} from '../services/LyricsPreparationService';
import { EntryContent } from '../services/EntryContentGateway';
import { GenerateArtworkUseCase } from '../use-cases/music/GenerateArtworkUseCase';
import { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import { FileStorageUtils, StoragePathConfig, StoredFileResult } from './FileStorageUtils';
import {
  LyricsTimingService,
  type SyncedLine,
  type AudioAnalysisResult,
} from '../../domains/ai-music/services/LyricsTimingService';
import { ProvidersServiceClient } from '../../infrastructure/clients/ProvidersServiceClient';
import { getMusicApiLyricsTimelineClient } from '../../infrastructure/clients/MusicApiLyricsTimelineClient';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import type {
  IMusicProviderOrchestrator,
  MusicGenerationRequest as OrchestratorRequest,
  MusicProviderCapabilities,
} from '../../domains/ai-music/interfaces/IMusicProvider';
import { CONTENT_VISIBILITY, isContentPubliclyAccessible, type ContentVisibility } from '@aiponge/shared-contracts';
import type { NewLyrics } from '../../schema/music-schema';

const logger = getLogger('music-service-generation-utils');

const MUSIC_API_MAX_CONCURRENCY = Math.max(1, parseInt(process.env.MUSIC_API_MAX_CONCURRENCY || '10', 10));
const MUSIC_API_STAGGER_DELAY_MS = parseInt(process.env.TRACK_GENERATION_STAGGER_DELAY_MS || '3500', 10);

class GlobalMusicApiConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private nextAllowedStartTime = 0;
  private staggerChain: Promise<void> = Promise.resolve();

  async acquire(): Promise<void> {
    if (this.running < MUSIC_API_MAX_CONCURRENCY) {
      this.running++;
      logger.debug('MusicAPI concurrency limiter: acquired slot', {
        running: this.running,
        max: MUSIC_API_MAX_CONCURRENCY,
        queued: this.queue.length,
      });
    } else {
      logger.debug('MusicAPI concurrency limiter: queuing request', {
        running: this.running,
        max: MUSIC_API_MAX_CONCURRENCY,
        queued: this.queue.length,
      });
      await new Promise<void>(resolve => this.queue.push(resolve));
      this.running++;
    }

    if (MUSIC_API_STAGGER_DELAY_MS > 0) {
      const myTurn = this.staggerChain.then(async () => {
        const now = Date.now();
        const waitTime = Math.max(0, this.nextAllowedStartTime - now);
        if (waitTime > 0) {
          logger.debug('MusicAPI stagger delay before audio call', { waitTimeMs: waitTime });
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.nextAllowedStartTime = Date.now() + MUSIC_API_STAGGER_DELAY_MS;
      });
      this.staggerChain = myTurn;
      await myTurn;
    }
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
    logger.debug('MusicAPI concurrency limiter: released slot', { running: this.running, queued: this.queue.length });
  }
}

const globalMusicApiLimiter = new GlobalMusicApiConcurrencyLimiter();

let _sharedProvidersClient: ProvidersServiceClient | null = null;
function getSharedProvidersClient(): ProvidersServiceClient {
  if (!_sharedProvidersClient) {
    _sharedProvidersClient = getServiceRegistry().providersClient as unknown as ProvidersServiceClient;
  }
  return _sharedProvidersClient;
}

export interface LyricsGenerationParams {
  userId: string;
  requestId: string;
  entryId?: string;
  entryContent?: EntryContent;
  providedLyricsId?: string;
  style?: string;
  mood?: string;
  language?: string;
  culturalLanguages?: string[];
  skipCache?: boolean;
  visibility?: ContentVisibility;
  cachedUserContext?: {
    preferences?: Record<string, unknown>;
    narrativeSeeds?: Record<string, unknown>;
    persona?: Record<string, unknown>;
  };
  bookContext?: {
    bookType?: string;
    bookTitle?: string;
    bookDescription?: string;
    chapterTitle?: string;
    bookCategory?: string;
    bookTags?: string[];
    bookThemes?: string[];
  };
}

export interface LyricsResult {
  success: boolean;
  lyricsContent: string | null;
  lyricsId: string | null;
  songTitle: string | null;
  error?: string;
}

export interface ArtworkGenerationParams {
  lyrics: string;
  title?: string;
  style?: string;
  genre?: string;
  mood?: string;
  culturalStyle?: string;
  userId?: string;
  visibility?: ContentVisibility;
}

export interface ArtworkResult {
  success: boolean;
  artworkUrl?: string;
  fileId?: string;
  error?: string;
}

export interface AudioGenerationParams {
  lyrics: string;
  title: string;
  style?: string;
  genre?: string;
  mood?: string;
  isInstrumental?: boolean;
  duration?: number;
  instrumentType?: string;
  vocalGender?: 'f' | 'm';
  negativeTags?: string;
  culturalStyle?: string;
  tempo?: number;
  styleWeight?: number;
  numClips?: number;
}

export interface AudioResult {
  success: boolean;
  audioUrl?: string;
  clipId?: string;
  duration?: number;
  providerId?: string;
  variations?: Array<{
    audioUrl: string;
    variationNumber: number;
  }>;
  error?: string;
}

export interface LyricsTimingSyncParams {
  clipId: string;
  lyricsId: string;
  lyricsContent: string;
  visibility: ContentVisibility;
  audioUrl?: string;
}

export interface LyricsTimingSyncResult {
  success: boolean;
  syncedLines?: SyncedLine[];
  timedLyricsJson?: unknown;
  method?: 'musicapi-timeline' | 'whisper-audio-analysis';
  error?: string;
}

export interface AudioParamsSource {
  lyrics: string;
  title: string;
  style?: string;
  genre?: string;
  genres?: string[];
  mood?: string;
  isInstrumental?: boolean;
  instrumentType?: string;
  vocalGender?: 'f' | 'm';
  negativeTags?: string;
  culturalStyle?: string;
  styleWeight?: number;
}

export interface LyricsSyncDependencies {
  lyricsRepository: { update(id: string, data: Partial<NewLyrics>): Promise<unknown> };
  catalogRepository: { updateHasSyncedLyrics(trackId: string, value: boolean): Promise<unknown> };
  userTrackRepository: { updateHasSyncedLyrics(trackId: string, value: boolean): Promise<unknown> };
}

export interface FullLyricsSyncParams {
  trackId: string;
  lyricsId: string;
  clipId?: string;
  lyricsContent: string;
  audioUrl: string;
  visibility: ContentVisibility;
  providerId?: string;
}

export class MusicGenerationUtils {
  constructor(
    private readonly orchestrator: IMusicProviderOrchestrator,
    private readonly lyricsService: LyricsPreparationService,
    private readonly artworkUseCase: GenerateArtworkUseCase,
    private readonly storageClient: StorageServiceClient
  ) {}

  private get fileStorageUtils(): FileStorageUtils {
    return new FileStorageUtils(this.storageClient);
  }

  getProviderCapabilities(providerId: string) {
    return this.orchestrator.getProviderCapabilities(providerId);
  }

  async generateLyrics(params: LyricsGenerationParams): Promise<LyricsResult> {
    logger.info('Generating lyrics', {
      userId: params.userId,
      requestId: params.requestId,
      hasEntryId: !!params.entryId,
      hasProvidedLyricsId: !!params.providedLyricsId,
    });

    try {
      const prepRequest: LyricsPreparationRequest = {
        userId: params.userId,
        requestId: params.requestId,
        entryId: params.entryId,
        entryContent: params.entryContent,
        providedLyricsId: params.providedLyricsId,
        style: params.style,
        mood: params.mood,
        language: params.language,
        culturalLanguages: params.culturalLanguages,
        skipCache: params.skipCache,
        visibility: params.visibility,
        cachedUserContext: params.cachedUserContext as CachedUserContextInput,
        bookContext: params.bookContext,
      };

      const result = await this.lyricsService.prepareLyrics(prepRequest);

      if (!result.success) {
        return {
          success: false,
          lyricsContent: null,
          lyricsId: null,
          songTitle: null,
          error: result.error || 'Lyrics generation failed',
        };
      }

      return {
        success: true,
        lyricsContent: result.lyricsContent,
        lyricsId: result.lyricsId,
        songTitle: result.songTitle,
      };
    } catch (error) {
      logger.error('Error generating lyrics', {
        error: error instanceof Error ? error.message : String(error),
        userId: params.userId,
      });
      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: error instanceof Error ? error.message : 'Unknown lyrics generation error',
      };
    }
  }

  async generateArtwork(
    params: ArtworkGenerationParams,
    storageConfig: StoragePathConfig,
    taskId?: string
  ): Promise<ArtworkResult> {
    const artworkStorageConfig: StoragePathConfig = { ...storageConfig, fileType: 'artworks' };

    logger.info('Generating artwork', {
      hasLyrics: !!params.lyrics,
      title: params.title,
      storagePath: FileStorageUtils.getStoragePath(artworkStorageConfig),
    });

    try {
      const result = await this.artworkUseCase.execute({
        lyrics: params.lyrics,
        title: params.title || 'Untitled',
        style: params.style,
        genre: params.genre,
        mood: params.mood,
        culturalStyle: params.culturalStyle,
        userId: params.userId,
        visibility: params.visibility ?? CONTENT_VISIBILITY.PERSONAL,
      });

      if (!result.success || !result.artworkUrl) {
        return {
          success: false,
          error: result.error || 'Artwork generation failed',
        };
      }

      // GenerateArtworkUseCase already downloads and stores the artwork,
      // returning a local path. No need to store again.
      logger.info('Artwork generated and stored by GenerateArtworkUseCase', {
        artworkUrl: result.artworkUrl,
      });

      return {
        success: true,
        artworkUrl: result.artworkUrl,
        fileId: result.artworkUrl, // Use artworkUrl as fileId for compensation tracking
      };
    } catch (error) {
      logger.error('Error generating artwork', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown artwork generation error',
      };
    }
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioResult> {
    logger.info('Generating audio via MusicProviderOrchestrator', {
      title: params.title,
      hasLyrics: !!params.lyrics,
      isInstrumental: params.isInstrumental,
    });

    await globalMusicApiLimiter.acquire();
    try {
      const prompt = params.isInstrumental
        ? `Instrumental: ${params.style || 'melodic'} ${params.genre || ''} ${params.mood || ''}`
        : params.lyrics;

      const orchRequest: OrchestratorRequest = {
        prompt,
        title: params.title,
        lyrics: params.isInstrumental ? undefined : params.lyrics,
        style: params.style,
        genre: params.genre,
        mood: params.mood,
        duration: params.duration,
        vocalGender: params.vocalGender,
        isInstrumental: params.isInstrumental,
        instrumentType: params.instrumentType,
        negativeTags: params.negativeTags,
        culturalStyle: params.culturalStyle,
        tempo: params.tempo,
        styleWeight: params.styleWeight,
        numClips: params.numClips,
      };

      const result = await this.orchestrator!.generateMusicWithFallback(orchRequest);

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Audio generation failed',
        };
      }

      const firstClip = result.clips?.[0];
      const clipId = firstClip?.clipId;

      logger.info('Audio generation via orchestrator completed', {
        provider: result.metadata?.provider,
        clipsCount: result.clips?.length,
        extractedClipId: clipId || 'NOT_FOUND',
        audioUrl: firstClip?.audioUrl?.substring(0, 50),
      });

      return {
        success: true,
        audioUrl: firstClip?.audioUrl,
        clipId,
        providerId: result.metadata?.provider,
        variations: result.clips?.map((c, idx) => ({
          audioUrl: c.audioUrl,
          variationNumber: idx + 1,
        })),
      };
    } catch (error) {
      logger.error('Error generating audio via orchestrator', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown audio generation error',
      };
    } finally {
      globalMusicApiLimiter.release();
    }
  }

  async storeAudioFile(
    externalUrl: string,
    storageConfig: StoragePathConfig,
    taskId: string
  ): Promise<StoredFileResult> {
    return this.fileStorageUtils.downloadAndStoreAudio(externalUrl, storageConfig, taskId);
  }

  async storeArtworkFile(
    externalUrl: string,
    storageConfig: StoragePathConfig,
    taskId: string
  ): Promise<StoredFileResult> {
    return this.fileStorageUtils.downloadAndStoreArtwork(externalUrl, storageConfig, taskId);
  }

  static extractTitleFromLyrics(lyrics: string): string | null {
    const titleMatch = lyrics.match(/\[Title[:\s]*([^\]]+)\]/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }

    const firstLineMatch = lyrics.match(/^(?:\[.*?\]\s*)?(.+)$/m);
    if (firstLineMatch && firstLineMatch[1]) {
      const firstLine = firstLineMatch[1].trim();
      if (firstLine.length > 0 && firstLine.length <= 100) {
        return firstLine;
      }
    }

    return null;
  }

  static sanitizeLyrics(lyrics: string): string {
    return lyrics.replace(/\[Title[:\s]*[^\]]*\]/gi, '').trim();
  }

  /**
   * Sync lyrics timing data from MusicAPI using clipId
   * This should be called after audio generation to get synced lyrics for karaoke display
   *
   * @param params - clipId from audio generation, lyricsId to update, and target library
   * @returns Synced lines and raw timeline data, or error if sync fails
   */
  async syncLyricsTiming(params: LyricsTimingSyncParams): Promise<LyricsTimingSyncResult> {
    const { clipId, lyricsId, lyricsContent, visibility, audioUrl } = params;

    logger.info('Syncing lyrics timing', {
      clipId: clipId || 'NOT_PROVIDED',
      lyricsId,
      visibility,
      lyricsLength: lyricsContent?.length,
      hasAudioUrl: !!audioUrl,
    });

    try {
      const providersClient = getSharedProvidersClient();
      let musicApiClient = null;
      if (process.env.MUSICAPI_API_KEY) {
        try {
          musicApiClient = getMusicApiLyricsTimelineClient();
        } catch (error) {
          logger.warn('Failed to initialize MusicAPI lyrics timeline client', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const lyricsTimingService = new LyricsTimingService({ providersClient, musicApiClient });

      // Parse lyrics into lines for the timing service
      const lyricsLines = lyricsContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const sectionMatch = line.match(/^\[(.*?)\]$/);
          return {
            text: line,
            type: sectionMatch ? 'section' : 'lyric',
          };
        });

      let audioFilePath: string | undefined;
      if (!clipId && audioUrl) {
        try {
          const fs = await import('fs');
          const pathModule = await import('path');

          const isLocalPath = audioUrl.startsWith('/') && !audioUrl.startsWith('//');
          if (isLocalPath) {
            const localPath = pathModule.resolve(process.cwd(), audioUrl.slice(1));
            if (fs.existsSync(localPath)) {
              audioFilePath = localPath;
              logger.info('Using local audio file for lyrics timing analysis', { audioFilePath });
            } else {
              logger.warn('Local audio file not found for lyrics analysis', { localPath });
            }
          } else {
            const os = await import('os');
            const tempDir = os.tmpdir();
            audioFilePath = pathModule.join(tempDir, `lyrics-sync-${Date.now()}.mp3`);

            logger.info('Downloading audio for lyrics timing analysis', {
              audioUrl: audioUrl.substring(0, 50),
              audioFilePath,
            });

            const response = await fetch(audioUrl, { signal: AbortSignal.timeout(120000) });
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              fs.writeFileSync(audioFilePath, buffer);
              logger.info('Audio downloaded for lyrics analysis', { audioFilePath, size: buffer.length });
            } else {
              logger.warn('Failed to download audio for lyrics analysis', { status: response.status });
              audioFilePath = undefined;
            }
          }
        } catch (downloadError) {
          logger.warn('Error resolving audio for lyrics analysis', {
            error: downloadError instanceof Error ? downloadError.message : String(downloadError),
          });
          audioFilePath = undefined;
        }
      }

      const result = await lyricsTimingService.getSyncedLyrics({
        clipId: clipId || undefined,
        audioFilePath,
        lyricsLines,
        lyricsText: lyricsContent,
      });

      if (audioFilePath && audioUrl && !audioUrl.startsWith('/')) {
        try {
          const fs = await import('fs');
          fs.unlinkSync(audioFilePath);
        } catch (cleanupError) {
          logger.debug('Failed to cleanup temp audio file (non-blocking)', {
            audioFilePath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      }

      if (!result.success || !result.syncedLines) {
        logger.warn('Lyrics timing sync failed', {
          clipId,
          lyricsId,
          error: result.error,
        });
        return {
          success: false,
          error: result.error || 'Failed to get synced lyrics',
        };
      }

      logger.info('Lyrics timing sync successful', {
        clipId,
        lyricsId,
        syncedLinesCount: result.syncedLines.length,
        method: result.metadata.method,
        processingTime: result.metadata.processingTime,
      });

      return {
        success: true,
        syncedLines: result.syncedLines,
        timedLyricsJson: result.rawTimeline,
        method: result.metadata.method,
      };
    } catch (error) {
      logger.error('Error syncing lyrics timing', {
        error: error instanceof Error ? error.message : String(error),
        clipId,
        lyricsId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown lyrics timing sync error',
      };
    }
  }

  static buildAudioParams(source: AudioParamsSource): AudioGenerationParams {
    const resolvedGenre = source.genre || (source.genres?.length ? source.genres.join(', ') : undefined);

    return {
      lyrics: source.lyrics,
      title: source.title,
      style: source.style,
      genre: resolvedGenre,
      mood: source.mood,
      isInstrumental: source.isInstrumental,
      instrumentType: source.instrumentType,
      vocalGender: source.vocalGender,
      negativeTags: source.negativeTags,
      culturalStyle: source.culturalStyle,
      styleWeight: source.styleWeight,
    };
  }

  async performFullLyricsSync(params: FullLyricsSyncParams, deps: LyricsSyncDependencies): Promise<void> {
    const { trackId, lyricsId, clipId, lyricsContent, audioUrl, visibility, providerId } = params;

    const effectiveProviderId = providerId || 'musicapi';
    const providerCaps = this.getProviderCapabilities(effectiveProviderId);
    const supportsSyncedLyrics = providerCaps?.supportsSyncedLyrics ?? false;
    const isPublic = isContentPubliclyAccessible(visibility);

    logger.info('Starting full lyrics sync', {
      trackId,
      lyricsId,
      hasClipId: !!clipId,
      supportsSyncedLyrics,
      providerId: effectiveProviderId,
      visibility,
    });

    const updateHasSyncedLyrics = async (synced: boolean) => {
      if (isPublic) {
        await deps.catalogRepository.updateHasSyncedLyrics(trackId, synced);
      } else {
        await deps.userTrackRepository.updateHasSyncedLyrics(trackId, synced);
      }
    };

    let synced = false;

    if (clipId && supportsSyncedLyrics) {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 5000;

      for (let attempt = 1; attempt <= MAX_RETRIES && !synced; attempt++) {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }

        const syncResult = await this.syncLyricsTiming({
          clipId,
          lyricsId,
          lyricsContent,
          visibility,
        });

        if (syncResult.success && syncResult.syncedLines && syncResult.syncedLines.length > 0) {
          await deps.lyricsRepository.update(lyricsId, {
            clipId,
            syncedLines: syncResult.syncedLines,
            timedLyricsJson: syncResult.timedLyricsJson || null,
          });
          await updateHasSyncedLyrics(true);
          logger.info('Lyrics timing sync completed via MusicAPI', {
            trackId,
            lyricsId,
            clipId,
            method: syncResult.method,
            syncedLinesCount: syncResult.syncedLines.length,
            attempt,
            visibility,
          });
          synced = true;
        } else if (attempt < MAX_RETRIES) {
          logger.info('Lyrics timing not ready, retrying...', {
            trackId,
            attempt,
            clipId,
            error: syncResult.error,
          });
        }
      }
    }

    if (!synced && audioUrl) {
      logger.info('Falling back to audio analysis for lyrics timing', {
        trackId,
        lyricsId,
        hasClipId: !!clipId,
        supportsSyncedLyrics,
      });

      const syncResult = await this.syncLyricsTiming({
        clipId: '',
        lyricsId,
        lyricsContent,
        visibility,
        audioUrl,
      });

      if (syncResult.success && syncResult.syncedLines) {
        await deps.lyricsRepository.update(lyricsId, {
          syncedLines: syncResult.syncedLines,
          timedLyricsJson: syncResult.timedLyricsJson || null,
        });
        await updateHasSyncedLyrics(true);
        logger.info('Audio analysis lyrics timing sync completed', {
          trackId,
          lyricsId,
          method: syncResult.method,
          syncedLinesCount: syncResult.syncedLines.length,
          visibility,
        });
        synced = true;
      }
    }

    if (!synced) {
      logger.warn('All lyrics timing sync methods exhausted', {
        trackId,
        lyricsId,
        hasClipId: !!clipId,
        supportsSyncedLyrics,
      });
    }
  }
}
