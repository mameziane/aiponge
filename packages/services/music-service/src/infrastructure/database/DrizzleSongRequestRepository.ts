import { eq, desc, and, isNull } from 'drizzle-orm';
import { songRequests, type SongRequest, type NewSongRequest } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-drizzle-song-request-repository');

export interface SongRequestProgress {
  id: string;
  userId: string;
  entryId?: string | null;
  status: string;
  phase: string;
  percentComplete: number;
  visibility: ContentVisibility;
  errorMessage?: string | null;
  artworkError?: string | null;
  trackId?: string | null;
  trackTitle?: string | null;
  artworkUrl?: string | null;
  streamingUrl?: string | null;
  lyrics?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export type SongRequestPhase =
  | 'queued'
  | 'fetching_content'
  | 'generating_lyrics'
  | 'generating_artwork'
  | 'generating_music'
  | 'saving'
  | 'completed'
  | 'failed';

export class DrizzleSongRequestRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(data: NewSongRequest): Promise<SongRequest> {
    logger.debug('Creating song request', {
      userId: data.userId,
      entryId: data.entryId,
      visibility: data.visibility,
    });

    const [result] = await this.db.insert(songRequests).values(data).returning();

    logger.info('Song request created', { id: result.id, userId: data.userId });
    return result;
  }

  async findById(id: string): Promise<SongRequest | null> {
    const [result] = await this.db
      .select()
      .from(songRequests)
      .where(and(eq(songRequests.id, id), isNull(songRequests.deletedAt)))
      .limit(1);
    return result || null;
  }

  async findByUserId(userId: string, limit = 10): Promise<SongRequest[]> {
    return this.db
      .select()
      .from(songRequests)
      .where(and(eq(songRequests.userId, userId), isNull(songRequests.deletedAt)))
      .orderBy(desc(songRequests.createdAt))
      .limit(Math.min(limit || 20, 100));
  }

  async findActiveByUserId(userId: string): Promise<SongRequest | null> {
    const [result] = await this.db
      .select()
      .from(songRequests)
      .where(
        and(eq(songRequests.userId, userId), eq(songRequests.status, 'processing'), isNull(songRequests.deletedAt))
      )
      .orderBy(desc(songRequests.createdAt))
      .limit(1);

    return result || null;
  }

  async findAllActiveByUserId(userId: string): Promise<SongRequest[]> {
    return this.db
      .select()
      .from(songRequests)
      .where(
        and(eq(songRequests.userId, userId), eq(songRequests.status, 'processing'), isNull(songRequests.deletedAt))
      )
      .orderBy(desc(songRequests.createdAt));
  }

  async updatePhase(id: string, phase: SongRequestPhase, percentComplete?: number): Promise<void> {
    const updateData: Partial<typeof songRequests.$inferInsert> = {
      phase,
      updatedAt: new Date(),
    };

    if (percentComplete !== undefined) {
      updateData.percentComplete = percentComplete;
    }

    if (phase === 'completed') {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
    } else if (phase === 'failed') {
      updateData.status = 'failed';
      updateData.completedAt = new Date();
    } else if (phase !== 'queued') {
      updateData.status = 'processing';
    }

    await this.db
      .update(songRequests)
      .set(updateData)
      .where(and(eq(songRequests.id, id), isNull(songRequests.deletedAt)));

    logger.debug('Song request phase updated', { id, phase, percentComplete });
  }

  async updateProgress(
    id: string,
    update: {
      status?: string;
      phase?: SongRequestPhase;
      percentComplete?: number;
      errorMessage?: string | null;
      trackId?: string;
      trackTitle?: string;
      artworkUrl?: string;
      lyrics?: string;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void> {
    const updateData: Partial<typeof songRequests.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (update.status !== undefined) updateData.status = update.status;
    if (update.phase !== undefined) updateData.phase = update.phase;
    if (update.percentComplete !== undefined) updateData.percentComplete = update.percentComplete;
    if (update.errorMessage !== undefined) updateData.errorMessage = update.errorMessage;
    if (update.trackId !== undefined) updateData.trackId = update.trackId;
    if (update.trackTitle !== undefined) updateData.trackTitle = update.trackTitle;
    if (update.artworkUrl !== undefined) updateData.artworkUrl = update.artworkUrl;
    if (update.startedAt !== undefined) updateData.startedAt = update.startedAt;
    if (update.completedAt !== undefined) updateData.completedAt = update.completedAt;

    if (update.lyrics !== undefined) {
      const existingRequest = await this.findById(id);
      const existingMetadata = (existingRequest?.metadata as Record<string, unknown>) || {};
      updateData.metadata = { ...existingMetadata, originalLyrics: update.lyrics };
    }

    await this.db
      .update(songRequests)
      .set(updateData)
      .where(and(eq(songRequests.id, id), isNull(songRequests.deletedAt)));

    logger.debug('Song request progress updated', {
      id,
      status: update.status,
      phase: update.phase,
      percentComplete: update.percentComplete,
      hasLyrics: !!update.lyrics,
    });
  }

  async getProgress(id: string): Promise<SongRequestProgress | null> {
    const request = await this.findById(id);
    if (!request) return null;

    const metadata = request.metadata as Record<string, unknown> | null;
    const lyrics = (metadata?.originalLyrics || metadata?.lyrics || null) as string | null;

    return {
      id: request.id,
      userId: request.userId,
      entryId: request.entryId,
      status: request.status,
      phase: request.phase,
      percentComplete: request.percentComplete,
      visibility: request.visibility as ContentVisibility,
      errorMessage: request.errorMessage,
      artworkError: request.artworkError,
      trackId: request.trackId,
      trackTitle: request.trackTitle,
      artworkUrl: request.artworkUrl,
      streamingUrl: request.streamingUrl as string | null | undefined,
      lyrics,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
    };
  }
}
