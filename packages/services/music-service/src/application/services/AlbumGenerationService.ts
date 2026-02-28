/**
 * AlbumGenerationService - Unified album generation service
 *
 * Handles both user (personal) and librarian (shared) album generation flows
 * using a single code path differentiated by targetVisibility parameter.
 *
 * Post-consolidation: Replaces separate LibraryAlbumGenerationService and
 * UserAlbumGenerationService with unified visibility-based approach.
 */

import { getLogger } from '../../config/service-urls';
import { v4 as uuidv4 } from 'uuid';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';
import {
  AlbumGenerationPipeline,
  type AlbumGenerationConfig,
  type AlbumGenerationResult,
  type ProgressUpdate,
  type AlbumPipelineDependencies,
} from './AlbumGenerationPipeline';
import { RefactoredTrackGenerationHandler, DefaultLyricsSyncHandler, DefaultUserContextFetcher, type RefactoredHandlerDependencies } from './RefactoredAlbumHandlers';
import {
  DefaultAlbumCreationHandler,
  DefaultArtworkGenerationHandler,
  DefaultAlbumLinkingHandler,
  DefaultTitleTranslationHandler,
} from './AlbumPipelineHandlers';

const logger = getLogger('music-service:album-generation-service');

export interface AlbumGenerationRequest {
  userId: string;
  chapterId?: string;
  chapterTitle?: string;
  bookId: string;
  bookTitle: string;
  bookType?: string;
  bookDescription?: string;
  bookCategory?: string;
  bookTags?: string[];
  bookThemes?: string[];
  entries: Array<{
    entryId: string;
    content: string;
    order: number;
  }>;
  targetVisibility: ContentVisibility;
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
  preCreatedAlbumId?: string;
  displayName?: string;
}

export interface AlbumGenerationServiceResult {
  success: boolean;
  albumId?: string;
  albumTitle?: string;
  albumArtworkUrl?: string;
  albumRequestId: string;
  totalTracks: number;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  tracks: Array<{
    entryId: string;
    order: number;
    success: boolean;
    trackId?: string;
    lyricsId?: string;
    language?: string;
    error?: string;
  }>;
  successfulTracks: number;
  failedTracks: number;
  generatedLanguages?: string[];
  failedLanguages?: string[];
  error?: string;
}

export type AlbumProgressCallback = (progress: ProgressUpdate) => void | Promise<void>;

export interface AlbumGenerationServiceDependencies extends RefactoredHandlerDependencies {}

/**
 * Unified Album Generation Service
 *
 * Handles both personal (user) and shared (librarian) album generation
 * through visibility parameter instead of separate service classes.
 */
export class AlbumGenerationService {
  private pipelineDeps: AlbumPipelineDependencies;
  private defaultProgressCallback?: AlbumProgressCallback;

  constructor(deps: AlbumGenerationServiceDependencies, progressCallback?: AlbumProgressCallback) {
    this.pipelineDeps = {
      albumCreation: new DefaultAlbumCreationHandler(),
      trackGeneration: new RefactoredTrackGenerationHandler(deps),
      artworkGeneration: new DefaultArtworkGenerationHandler(),
      albumLinking: new DefaultAlbumLinkingHandler(),
      titleTranslation: new DefaultTitleTranslationHandler(),
      lyricsSync: new DefaultLyricsSyncHandler(deps),
      userContextFetcher: new DefaultUserContextFetcher(),
    };
    this.defaultProgressCallback = progressCallback;
  }

  setProgressCallback(callback: AlbumProgressCallback): void {
    this.defaultProgressCallback = callback;
  }

  async generate(
    request: AlbumGenerationRequest,
    progressCallback?: AlbumProgressCallback
  ): Promise<AlbumGenerationServiceResult> {
    const requestId = uuidv4();
    const targetVisibility = request.targetVisibility || CONTENT_VISIBILITY.PERSONAL;

    logger.info('Starting album generation', {
      requestId,
      userId: request.userId,
      chapterId: request.chapterId,
      entryCount: request.entries.length,
      targetVisibility: request.targetVisibility,
      languageMode: request.languageMode || 'single',
    });

    const config: AlbumGenerationConfig = {
      userId: request.userId,
      requestId,
      chapterId: request.chapterId,
      chapterTitle: request.chapterTitle,
      bookId: request.bookId,
      bookTitle: request.bookTitle,
      bookType: request.bookType,
      bookDescription: request.bookDescription,
      bookCategory: request.bookCategory,
      bookTags: request.bookTags,
      bookThemes: request.bookThemes,
      entries: request.entries,
      priority: request.priority,
      style: request.style,
      genre: request.genre,
      mood: request.mood,
      language: request.language,
      culturalLanguages: request.culturalLanguages,
      languageMode: request.languageMode,
      targetLanguages: request.targetLanguages,
      culturalStyle: request.culturalStyle,
      instrumentType: request.instrumentType,
      negativeTags: request.negativeTags,
      vocalGender: request.vocalGender,
      isInstrumental: request.isInstrumental,
      styleWeight: request.styleWeight,
      genres: request.genres,
      preCreatedAlbumId: request.preCreatedAlbumId,
      displayName: request.displayName,
      persistenceContext: {
        visibility: targetVisibility,
        userId: request.userId,
        albumId: request.preCreatedAlbumId,
      },
    };

    const pipeline = new AlbumGenerationPipeline(this.pipelineDeps, progressCallback || this.defaultProgressCallback);
    const result = await pipeline.execute(config);
    return this.translateResult(result);
  }

  private translateResult(result: AlbumGenerationResult): AlbumGenerationServiceResult {
    return {
      success: result.success,
      albumId: result.albumId,
      albumTitle: result.albumTitle,
      albumArtworkUrl: result.albumArtworkUrl,
      albumRequestId: result.albumRequestId,
      totalTracks: result.totalTracks,
      status: result.status,
      tracks: result.tracks.map(t => ({
        entryId: t.entryId,
        order: t.order,
        success: t.success,
        trackId: t.trackId,
        lyricsId: t.lyricsId,
        language: t.language,
        error: t.error,
      })),
      successfulTracks: result.successfulTracks,
      failedTracks: result.failedTracks,
      generatedLanguages: result.generatedLanguages,
      failedLanguages: result.failedLanguages,
      error: result.error,
    };
  }
}
