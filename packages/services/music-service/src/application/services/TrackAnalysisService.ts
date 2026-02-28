import { sql } from 'drizzle-orm';
import { type DatabaseConnection, getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import { serializeError } from '@aiponge/platform-core';
import { MusicError, LibraryError } from '../errors';
import {
  CONTENT_VISIBILITY,
  isContentPersonal,
} from '@aiponge/shared-contracts';
import { getMusicVisibilityService } from '../services/MusicVisibilityService';
import { getMusicAccessRepository } from '../../infrastructure/database/MusicAccessRepository';

const logger = getLogger('music-service-track-analysis');

export class TrackAnalysisService {
  constructor(private readonly db: DatabaseConnection) {}

  async resolveAudioFilePath(
    fileUrl: string,
    path: typeof import('path'),
    fs: typeof import('fs/promises')
  ): Promise<{ resolvedPath: string; tempFilePath: string | null }> {
    const isRemoteUrl = fileUrl.startsWith('http://') || fileUrl.startsWith('https://');

    if (isRemoteUrl) {
      logger.info('Lyrics Timing Analysis - Downloading remote audio', { fileUrl: fileUrl.substring(0, 80) });

      const os = await import('os');
      const crypto = await import('crypto');
      const tempDir = os.tmpdir();
      const tempFileName = `whisper-${crypto.randomBytes(8).toString('hex')}.mp3`;
      const tempFilePath = path.join(tempDir, tempFileName);

      try {
        const audioResponse = await fetch(fileUrl, { signal: AbortSignal.timeout(120000) });
        if (!audioResponse.ok) {
          throw MusicError.internalError(`Failed to download audio for analysis: HTTP ${audioResponse.status}`);
        }

        const arrayBuffer = await audioResponse.arrayBuffer();
        await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));

        logger.debug('Lyrics Timing Analysis - Remote audio downloaded', {
          tempFilePath,
          sizeBytes: arrayBuffer.byteLength,
        });

        return { resolvedPath: tempFilePath, tempFilePath };
      } catch (downloadError) {
        try {
          await fs.unlink(tempFilePath);
        } catch {
          /* ignore cleanup errors */
        }
        logger.error('Lyrics Timing Analysis - Failed to download remote audio', {
          error: serializeError(downloadError),
        });
        throw MusicError.internalError('Failed to download audio file for analysis');
      }
    }

    if (fileUrl.startsWith('s3://') || fileUrl.startsWith('gs://') || fileUrl.startsWith('/api/')) {
      throw MusicError.validationError('fileUrl', 'Cloud storage paths require direct URL access for timing analysis');
    }

    if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('uploads/')) {
      return this.resolveLocalUploadsPath(fileUrl, path, fs);
    }

    throw MusicError.validationError('fileUrl', 'Audio file path format not supported for timing analysis');
  }

  private async resolveLocalUploadsPath(
    fileUrl: string,
    path: typeof import('path'),
    fs: typeof import('fs/promises')
  ): Promise<{ resolvedPath: string; tempFilePath: null }> {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const uploadsRoot = path.join(workspaceRoot, 'uploads');

    const relativePath = fileUrl.startsWith('/uploads/')
      ? fileUrl.substring('/uploads/'.length)
      : fileUrl.replace(/^\/+/, '');

    if (relativePath.includes('..') || relativePath.includes('\\')) {
      throw MusicError.validationError('audioPath', `Invalid audio path`);
    }

    const audioFilePath = path.join(uploadsRoot, relativePath);
    const resolvedPath = path.resolve(audioFilePath);
    const allowedRoot = path.resolve(uploadsRoot);

    if (!resolvedPath.startsWith(allowedRoot)) {
      throw MusicError.unauthorized(`Attempted path traversal`);
    }

    try {
      await fs.access(resolvedPath);
    } catch {
      throw MusicError.notFound('audio file', 'on server');
    }

    return { resolvedPath, tempFilePath: null };
  }

  async fetchLyricsForAnalysis(
    effectiveLyricsId: string,
    userId: string
  ): Promise<{
    lyricsData: { id: string; content: string; syncedLines?: unknown[]; clipId?: string | null };
    isUserLyrics: boolean;
  }> {
    const lyricsResult = await this.db.execute(sql`
      SELECT id, content, synced_lines as "syncedLines", clip_id as "clipId", 
             visibility, user_id as "userId"
      FROM mus_lyrics
      WHERE id = ${effectiveLyricsId}
      LIMIT 1
    `);
    const lyricsRow = lyricsResult.rows[0] as
      | { id: string; content: string; syncedLines?: unknown[]; clipId?: string | null; visibility?: string; userId?: string }
      | undefined;

    let lyricsData: { id: string; content: string; syncedLines?: unknown[]; clipId?: string | null } | undefined;
    let isUserLyrics = false;

    if (lyricsRow) {
      const isPersonal = isContentPersonal(lyricsRow.visibility ?? CONTENT_VISIBILITY.PERSONAL);
      if (isPersonal && lyricsRow.userId !== userId) {
        lyricsData = undefined;
      } else {
        lyricsData = lyricsRow;
        isUserLyrics = isPersonal;
      }
    }

    if (!lyricsData || !lyricsData.content) {
      throw LibraryError.validationError('lyricsContent', 'Lyrics content not found');
    }

    return { lyricsData, isUserLyrics };
  }

  async createLyricsTimingService() {
    const { LyricsTimingService } = await import('../../domains/ai-music/services/LyricsTimingService');
    const { getMusicApiLyricsTimelineClient } =
      await import('../../infrastructure/clients/MusicApiLyricsTimelineClient');

    const providersClient = getServiceRegistry().providersClient;
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
    return new LyricsTimingService({ providersClient, musicApiClient });
  }

  async fetchAccessibleTrack(
    trackId: string,
    userId: string
  ): Promise<{
    id: string;
    title: string;
    lyrics_id: string;
    file_url: string;
    visibility?: string;
    [key: string]: unknown;
  }> {
    const visibilityService = getMusicVisibilityService();
    const accessRepo = getMusicAccessRepository();
    const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);

    const track = await accessRepo.getAccessibleTrackForTimingAnalysis(trackId, userId, accessibleCreatorIds);

    if (!track) {
      logger.warn('Lyrics Timing Analysis - Track not found or access denied', { trackId, userId });
      throw MusicError.notFound('Track', trackId);
    }

    if (!track.lyrics_id) {
      throw MusicError.validationError('lyricsId', 'Track has no lyrics to analyze');
    }

    if (!track.file_url) {
      throw MusicError.validationError('fileUrl', 'Track has no audio file');
    }

    logger.debug('Lyrics Timing Analysis - Track validated', {
      trackId,
      title: track.title,
      lyricsId: track.lyrics_id,
      fileUrl: track.file_url,
    });

    return track as { id: string; title: string; lyrics_id: string; file_url: string; visibility?: string };
  }

  async persistAnalysisResults(
    trackId: string,
    effectiveLyricsId: string,
    analysisResult: { syncedLines?: unknown[]; rawTimeline?: unknown },
    effectiveClipId: string | undefined
  ): Promise<void> {
    const updatePayload = {
      syncedLines: JSON.stringify(analysisResult.syncedLines),
      timedLyricsJson: analysisResult.rawTimeline ? JSON.stringify(analysisResult.rawTimeline) : null,
      clipId: effectiveClipId || null,
    };

    await this.db.execute(sql`
        UPDATE mus_lyrics
        SET synced_lines = ${updatePayload.syncedLines}::jsonb,
            timed_lyrics_json = ${updatePayload.timedLyricsJson}::jsonb,
            clip_id = ${updatePayload.clipId},
            updated_at = NOW()
        WHERE id = ${effectiveLyricsId}
      `);

    logger.info('Lyrics Timing Analysis - Lyrics synced_lines updated');

    await this.db.execute(sql`
      UPDATE mus_tracks
      SET has_synced_lyrics = true,
          updated_at = NOW()
      WHERE id = ${trackId}
    `);
  }

  async cleanupTempFile(filePath: string | null): Promise<void> {
    if (!filePath) return;
    const fs = await import('fs/promises');
    try {
      await fs.unlink(filePath);
      logger.debug('Lyrics Timing Analysis - Temp file cleaned up', { tempFilePath: filePath });
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
  }
}
