/**
 * DrizzleAlbumRequestRepository - PostgreSQL implementation for album generation requests
 * Tracks background album generation jobs with progress updates
 */

import { eq, desc, and, asc, isNull, inArray } from 'drizzle-orm';
import { albumRequests, albums, tracks, type AlbumRequest, type NewAlbumRequest } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-drizzle-album-request-repository');

export interface AlbumRequestProgress {
  id: string;
  userId: string;
  status: string;
  phase: string;
  subPhase?: string | null;
  totalTracks: number;
  currentTrack: number;
  successfulTracks: number;
  failedTracks: number;
  percentComplete: number;
  languageMode: string;
  generatedLanguages: string[];
  failedLanguages: string[];
  trackResults: unknown[];
  trackCardDetails: unknown[];
  errorMessage?: string | null;
  chapterTitle?: string | null;
  albumTitle?: string | null;
  albumId?: string | null;
  albumArtworkUrl?: string | null;
  visibility: ContentVisibility;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export class DrizzleAlbumRequestRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(data: NewAlbumRequest): Promise<AlbumRequest> {
    logger.debug('Creating album request', {
      userId: data.userId,
      chapterId: data.chapterId,
      totalTracks: data.totalTracks,
    });

    const [result] = await this.db.insert(albumRequests).values(data).returning();

    logger.info('Album request created', { id: result.id, userId: data.userId });
    return result;
  }

  async findById(id: string): Promise<AlbumRequest | null> {
    const [result] = await this.db
      .select()
      .from(albumRequests)
      .where(and(eq(albumRequests.id, id), isNull(albumRequests.deletedAt)))
      .limit(1);

    return result || null;
  }

  async findByUserId(userId: string, limit = 10): Promise<AlbumRequest[]> {
    return this.db
      .select()
      .from(albumRequests)
      .where(and(eq(albumRequests.userId, userId), isNull(albumRequests.deletedAt)))
      .orderBy(desc(albumRequests.createdAt))
      .limit(Math.min(limit || 20, 100));
  }

  async findActiveByUserId(userId: string): Promise<AlbumRequest | null> {
    const [result] = await this.db
      .select()
      .from(albumRequests)
      .where(
        and(eq(albumRequests.userId, userId), eq(albumRequests.status, 'processing'), isNull(albumRequests.deletedAt))
      )
      .orderBy(desc(albumRequests.createdAt))
      .limit(1);

    return result || null;
  }

  async findAllActiveByUserId(userId: string): Promise<AlbumRequest[]> {
    return this.db
      .select()
      .from(albumRequests)
      .where(
        and(
          eq(albumRequests.userId, userId),
          inArray(albumRequests.status, ['queued', 'processing']),
          isNull(albumRequests.deletedAt)
        )
      )
      .orderBy(desc(albumRequests.createdAt));
  }

  async updateProgress(
    id: string,
    update: {
      status?: string;
      phase?: string;
      subPhase?: string | null;
      currentTrack?: number;
      successfulTracks?: number;
      failedTracks?: number;
      percentComplete?: number;
      trackResults?: unknown[];
      trackCardDetails?: unknown[];
      generatedLanguages?: string[];
      failedLanguages?: string[];
      errorMessage?: string | null;
      startedAt?: Date;
      completedAt?: Date;
      albumId?: string;
      albumArtworkUrl?: string;
      albumTitle?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (update.status !== undefined) updateData.status = update.status;
    if (update.phase !== undefined) updateData.phase = update.phase;
    if (update.subPhase !== undefined) updateData.subPhase = update.subPhase;
    if (update.currentTrack !== undefined) updateData.currentTrack = update.currentTrack;
    if (update.successfulTracks !== undefined) updateData.successfulTracks = update.successfulTracks;
    if (update.failedTracks !== undefined) updateData.failedTracks = update.failedTracks;
    if (update.percentComplete !== undefined) updateData.percentComplete = update.percentComplete;
    if (update.trackResults !== undefined) updateData.trackResults = update.trackResults;
    if (update.generatedLanguages !== undefined) updateData.generatedLanguages = update.generatedLanguages;
    if (update.failedLanguages !== undefined) updateData.failedLanguages = update.failedLanguages;
    if (update.errorMessage !== undefined) updateData.errorMessage = update.errorMessage;
    if (update.startedAt !== undefined) updateData.startedAt = update.startedAt;
    if (update.completedAt !== undefined) updateData.completedAt = update.completedAt;
    if (update.albumId !== undefined) updateData.albumId = update.albumId;

    const needsMetadataUpdate =
      update.albumArtworkUrl !== undefined || update.albumTitle !== undefined || update.trackCardDetails !== undefined;
    if (needsMetadataUpdate) {
      const existingRecord = await this.findById(id);
      const existingMetadata = (existingRecord?.metadata as Record<string, unknown>) || {};
      const metadataUpdate: Record<string, unknown> = { ...existingMetadata };
      if (update.trackCardDetails !== undefined) {
        metadataUpdate.trackCardDetails = update.trackCardDetails;
      }
      if (update.albumArtworkUrl !== undefined) {
        metadataUpdate.albumArtworkUrl = update.albumArtworkUrl;
      }
      if (update.albumTitle !== undefined) {
        metadataUpdate.albumTitle = update.albumTitle;
      }
      updateData.metadata = metadataUpdate;
    }

    await this.db
      .update(albumRequests)
      .set(updateData)
      .where(and(eq(albumRequests.id, id), isNull(albumRequests.deletedAt)));

    logger.debug('Album request progress updated', {
      id,
      status: update.status,
      phase: update.phase,
      percentComplete: update.percentComplete,
      hasArtwork: !!update.albumArtworkUrl,
    });
  }

  async getProgress(id: string): Promise<AlbumRequestProgress | null> {
    const request = await this.findById(id);
    if (!request) return null;

    // Try to fetch album artwork - check multiple sources in order of preference
    let albumArtworkUrl: string | null = null;
    const metadata = request.metadata as Record<string, unknown> | null;
    const albumIdFromMetadata = metadata?.albumId as string | undefined;
    const resolvedAlbumId = request.albumId || albumIdFromMetadata;

    // 0. First check metadata for persisted artwork URL (set during progress updates)
    if (metadata?.albumArtworkUrl) {
      albumArtworkUrl = metadata.albumArtworkUrl as string;
    }

    // 1. Check album's artworkUrl from unified mus_albums table
    if (resolvedAlbumId && !albumArtworkUrl) {
      try {
        const [album] = await this.db
          .select({ artworkUrl: albums.artworkUrl })
          .from(albums)
          .where(and(eq(albums.id, resolvedAlbumId), isNull(albums.deletedAt)))
          .limit(1);

        if (album?.artworkUrl) {
          albumArtworkUrl = album.artworkUrl;
        }
      } catch (error) {
        logger.warn('Failed to fetch album artwork', {
          albumId: resolvedAlbumId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2. Fallback: Check first track's artworkUrl (for in-progress generation)
    // Album artworkUrl is only set at finalization, so during generation we need to
    // fetch artwork from the first completed track (unified tracks table)
    if (!albumArtworkUrl) {
      const albumToCheck = resolvedAlbumId;
      if (albumToCheck) {
        try {
          const [firstTrack] = await this.db
            .select({ artworkUrl: tracks.artworkUrl })
            .from(tracks)
            .where(and(eq(tracks.albumId, albumToCheck), isNull(tracks.deletedAt)))
            .orderBy(asc(tracks.trackNumber))
            .limit(1);

          if (firstTrack?.artworkUrl) {
            albumArtworkUrl = firstTrack.artworkUrl;
          }
        } catch (error) {
          logger.warn('Failed to fetch first track artwork', {
            albumId: albumToCheck,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const albumTitle = (metadata?.albumTitle as string) || null;

    return {
      id: request.id,
      userId: request.userId,
      status: request.status,
      phase: request.phase,
      subPhase: ((request as Record<string, unknown>).subPhase as string) || null,
      totalTracks: request.totalTracks,
      currentTrack: request.currentTrack,
      successfulTracks: request.successfulTracks,
      failedTracks: request.failedTracks,
      percentComplete: request.percentComplete,
      languageMode: request.languageMode,
      generatedLanguages: request.generatedLanguages || [],
      failedLanguages: request.failedLanguages || [],
      trackResults: (request.trackResults as unknown[]) || [],
      trackCardDetails: (metadata?.trackCardDetails as unknown[]) || [],
      errorMessage: request.errorMessage,
      chapterTitle: request.chapterTitle,
      albumTitle,
      albumId: request.albumId,
      albumArtworkUrl,
      visibility: (request.visibility as ContentVisibility) || CONTENT_VISIBILITY.PERSONAL,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
    };
  }
}
