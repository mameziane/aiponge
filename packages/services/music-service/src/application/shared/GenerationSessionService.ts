import { eq, sql, and, isNull } from 'drizzle-orm';
import { songRequests, SongRequest, NewSongRequest } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { type ContentVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-generation-session');

export type GenerationPhase =
  | 'queued'
  | 'fetching_content'
  | 'generating_lyrics'
  | 'generating_artwork'
  | 'generating_music'
  | 'saving'
  | 'completed'
  | 'failed';

export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface GenerationStepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  url?: string;
  id?: string;
}

export interface SessionProgress {
  phase: GenerationPhase;
  percentComplete: number;
  status: GenerationStatus;
}

export interface CompensationRecord {
  lyricsId?: string;
  artworkUrl?: string;
  audioUrl?: string;
  trackId?: string;
  reservationId?: string;
  userId?: string;
}

export class GenerationSessionService {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly storageClient: StorageServiceClient
  ) {}

  async create(params: {
    userId: string;
    targetVisibility: ContentVisibility;
    entryId?: string;
    requestPayload?: Record<string, unknown>;
  }): Promise<SongRequest> {
    const sessionData: NewSongRequest = {
      userId: params.userId,
      entryId: params.entryId,
      visibility: params.targetVisibility,
      status: 'processing',
      phase: 'fetching_content',
      percentComplete: 0,
      requestPayload: params.requestPayload || {},
      startedAt: new Date(),
    };

    const [session] = await this.db.insert(songRequests).values(sessionData).returning();

    logger.info('Generation session created', {
      sessionId: session.id,
      userId: params.userId,
      targetVisibility: params.targetVisibility,
    });

    return session;
  }

  async updatePhase(
    sessionId: string,
    phase: GenerationPhase,
    percentComplete: number,
    additionalData?: Partial<
      Pick<SongRequest, 'trackId' | 'trackTitle' | 'artworkUrl' | 'streamingUrl' | 'errorMessage'>
    >
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      phase,
      percentComplete,
      updatedAt: sql`NOW()`,
    };

    if (additionalData?.trackId) updateData.trackId = additionalData.trackId;
    if (additionalData?.trackTitle) updateData.trackTitle = additionalData.trackTitle;
    if (additionalData?.artworkUrl) updateData.artworkUrl = additionalData.artworkUrl;
    if (additionalData?.streamingUrl) updateData.streamingUrl = additionalData.streamingUrl;
    if (additionalData?.errorMessage) updateData.errorMessage = additionalData.errorMessage;

    await this.db
      .update(songRequests)
      .set(updateData)
      .where(and(eq(songRequests.id, sessionId), isNull(songRequests.deletedAt)));

    logger.debug('Session phase updated', { sessionId, phase, percentComplete });
  }

  async updateLyrics(sessionId: string, lyrics: string, songTitle?: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      logger.warn('Session not found for lyrics update', { sessionId });
      return;
    }

    const existingMetadata = (session.metadata as Record<string, unknown>) || {};
    const updatedMetadata = { ...existingMetadata, originalLyrics: lyrics };

    const updateData: Record<string, unknown> = {
      metadata: updatedMetadata,
      updatedAt: sql`NOW()`,
    };

    if (songTitle) {
      updateData.trackTitle = songTitle;
    }

    await this.db
      .update(songRequests)
      .set(updateData)
      .where(and(eq(songRequests.id, sessionId), isNull(songRequests.deletedAt)));

    logger.debug('Session lyrics updated', { sessionId, hasLyrics: !!lyrics, songTitle });
  }

  async markCompleted(
    sessionId: string,
    trackId: string,
    trackTitle: string,
    artworkUrl?: string,
    artworkError?: string
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status: 'completed',
      phase: 'completed',
      percentComplete: 100,
      trackId,
      trackTitle,
      completedAt: new Date(),
      updatedAt: sql`NOW()`,
    };

    if (artworkUrl) {
      updateData.artworkUrl = artworkUrl;
    }

    if (artworkError) {
      updateData.artworkError = artworkError;
    }

    await this.db
      .update(songRequests)
      .set(updateData)
      .where(and(eq(songRequests.id, sessionId), isNull(songRequests.deletedAt)));

    logger.info('Session completed', {
      sessionId,
      trackId,
      trackTitle,
      hasArtwork: !!artworkUrl,
      artworkError: artworkError || null,
    });
  }

  async markFailed(sessionId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(songRequests)
      .set({
        status: 'failed',
        phase: 'failed',
        errorMessage,
        completedAt: new Date(),
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(songRequests.id, sessionId), isNull(songRequests.deletedAt)));

    logger.error('Session failed', { sessionId, errorMessage });
  }

  async getSession(sessionId: string): Promise<SongRequest | null> {
    const [session] = await this.db
      .select()
      .from(songRequests)
      .where(and(eq(songRequests.id, sessionId), isNull(songRequests.deletedAt)))
      .limit(1);
    return session || null;
  }

  async compensate(sessionId: string, record: CompensationRecord): Promise<void> {
    logger.info('Starting compensation for failed session', {
      sessionId,
      hasLyrics: !!record.lyricsId,
      hasArtwork: !!record.artworkUrl,
      hasAudio: !!record.audioUrl,
      hasTrack: !!record.trackId,
    });

    const cleanupPromises: Promise<void>[] = [];

    if (record.artworkUrl) {
      cleanupPromises.push(this.deleteStoredFile(record.artworkUrl, 'artwork'));
    }

    if (record.audioUrl) {
      cleanupPromises.push(this.deleteStoredFile(record.audioUrl, 'audio'));
    }

    await Promise.allSettled(cleanupPromises);

    logger.info('Compensation completed', { sessionId });
  }

  private async deleteStoredFile(urlOrFileId: string, type: string): Promise<void> {
    try {
      logger.debug('Attempting to delete stored file', { urlOrFileId, type });

      const fileId = this.extractFileIdFromUrl(urlOrFileId);
      if (!fileId) {
        logger.warn('Could not extract fileId from URL, skipping deletion', { urlOrFileId });
        return;
      }

      const result = await this.storageClient.deleteFile(fileId);
      if (result.success) {
        logger.info('Stored file deleted during compensation', { fileId, type });
      } else {
        logger.warn('Failed to delete stored file', { fileId, type, error: result.error });
      }
    } catch (error) {
      logger.warn('Failed to delete stored file during compensation', {
        urlOrFileId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private extractFileIdFromUrl(urlOrFileId: string): string | null {
    if (!urlOrFileId.startsWith('http')) {
      return urlOrFileId;
    }

    try {
      const url = new URL(urlOrFileId);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        return fileName;
      }
    } catch (error) {
      logger.debug('Could not parse URL for file ID extraction', {
        urlOrFileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }
}
