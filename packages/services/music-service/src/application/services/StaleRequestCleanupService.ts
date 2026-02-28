/**
 * Stale Request Cleanup Service
 *
 * Primary purpose: Clean up stuck generation REQUEST records (mus_album_requests, mus_song_requests)
 * that remain in 'processing' or 'queued' status after a service restart.
 *
 * This runs on service startup to prevent the frontend from polling for generations
 * that will never complete because the in-memory state was lost during restart.
 *
 * Also detects (but does not remediate) database integrity issues for monitoring.
 */

import { sql } from 'drizzle-orm';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { createLogger } from '@aiponge/platform-core';
import { CONTENT_VISIBILITY, TRACK_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = createLogger('stale-request-cleanup');

export interface CleanupResult {
  staleAlbumRequests: number;
  staleSongRequests: number;
  staleLibraryTracks: number;
  errors: string[];
}

const STALE_THRESHOLD_MINUTES = 30;

export class StaleRequestCleanupService {
  private db = getDatabase();

  async runCleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      staleAlbumRequests: 0,
      staleSongRequests: 0,
      staleLibraryTracks: 0,
      errors: [],
    };

    logger.debug('Starting stale request cleanup...', {
      thresholdMinutes: STALE_THRESHOLD_MINUTES,
    });

    try {
      result.staleAlbumRequests = await this.cleanupStaleAlbumRequests();
    } catch (error) {
      const msg = `Failed to cleanup stale album requests: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(msg);
      result.errors.push(msg);
    }

    try {
      result.staleSongRequests = await this.cleanupStaleSongRequests();
    } catch (error) {
      const msg = `Failed to cleanup stale song requests: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(msg);
      result.errors.push(msg);
    }

    try {
      result.staleLibraryTracks = await this.cleanupStaleLibraryTracks();
    } catch (error) {
      const msg = `Failed to cleanup stale library tracks: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(msg);
      result.errors.push(msg);
    }

    const totalCleaned = result.staleAlbumRequests + result.staleSongRequests + result.staleLibraryTracks;

    if (totalCleaned > 0) {
      logger.info('Cleanup completed', {
        staleAlbumRequests: result.staleAlbumRequests,
        staleSongRequests: result.staleSongRequests,
        staleLibraryTracks: result.staleLibraryTracks,
      });
    } else {
      logger.debug('No stale records found');
    }

    return result;
  }

  /**
   * Mark album generation requests stuck in processing/queued as failed.
   * These are the tracking records that frontend polls.
   */
  private async cleanupStaleAlbumRequests(): Promise<number> {
    const staleRequestsResult = await this.db.execute(sql`
      UPDATE mus_album_requests 
      SET status = 'failed',
          error_message = 'Generation interrupted - service restart detected. Please try again.',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE status IN ('processing', 'queued')
        AND created_at < NOW() - INTERVAL '${sql.raw(String(STALE_THRESHOLD_MINUTES))} minutes'
      RETURNING id
    `);

    const count = staleRequestsResult.rows.length;

    if (count > 0) {
      logger.info(`Marked ${count} stale album requests as failed`, {
        requestIds: staleRequestsResult.rows.map((r: Record<string, unknown>) => r.id as string),
      });
    }

    return count;
  }

  /**
   * Mark song generation requests stuck in processing/queued as failed.
   */
  private async cleanupStaleSongRequests(): Promise<number> {
    const staleRequestsResult = await this.db.execute(sql`
      UPDATE mus_song_requests 
      SET status = 'failed',
          error_message = 'Generation interrupted - service restart detected. Please try again.',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE status IN ('processing', 'queued')
        AND created_at < NOW() - INTERVAL '${sql.raw(String(STALE_THRESHOLD_MINUTES))} minutes'
      RETURNING id
    `);

    const count = staleRequestsResult.rows.length;

    if (count > 0) {
      logger.info(`Marked ${count} stale song requests as failed`, {
        requestIds: staleRequestsResult.rows.map((r: Record<string, unknown>) => r.id as string),
      });
    }

    return count;
  }

  /**
   * Archive library tracks stuck in 'processing' status.
   * Per schema: mus_tracks status includes 'processing' for in-flight generation.
   */
  private async cleanupStaleLibraryTracks(): Promise<number> {
    const staleTracksResult = await this.db.execute(sql`
      UPDATE mus_tracks 
      SET status = ${TRACK_LIFECYCLE.ARCHIVED}, updated_at = NOW()
      WHERE status = ${TRACK_LIFECYCLE.PROCESSING}
        AND created_at < NOW() - INTERVAL '${sql.raw(String(STALE_THRESHOLD_MINUTES))} minutes'
      RETURNING id
    `);

    const count = staleTracksResult.rows.length;

    if (count > 0) {
      logger.info(`Archived ${count} stale library tracks`, {
        trackIds: staleTracksResult.rows.map((r: Record<string, unknown>) => r.id as string),
      });
    }

    return count;
  }

  /**
   * Verify database integrity - detection only, no remediation.
   * Reports issues for monitoring/alerting purposes.
   */
  async verifyDatabaseIntegrity(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check for orphaned personal tracks (unified mus_tracks with missing albums)
      const orphanedUserTracksResult = await this.db.execute(sql`
        SELECT COUNT(*) as count FROM mus_tracks t
        JOIN mus_albums a_check ON t.album_id = a_check.id AND a_check.visibility = ${CONTENT_VISIBILITY.PERSONAL}
        WHERE t.album_id IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM mus_albums a WHERE a.id = t.album_id)
      `);
      const orphanedUserTracksCount = Number((orphanedUserTracksResult.rows[0] as Record<string, unknown>)?.count || 0);

      if (orphanedUserTracksCount > 0) {
        issues.push(`Found ${orphanedUserTracksCount} user tracks with missing albums`);
      }

      const orphanedLibraryTracksResult = await this.db.execute(sql`
        SELECT COUNT(*) as count FROM mus_tracks t
        WHERE t.album_id IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM mus_albums a WHERE a.id = t.album_id)
      `);
      const orphanedLibraryTracksCount = Number((orphanedLibraryTracksResult.rows[0] as Record<string, unknown>)?.count || 0);

      if (orphanedLibraryTracksCount > 0) {
        issues.push(`Found ${orphanedLibraryTracksCount} library tracks with missing albums`);
      }

      const stuckRequestsResult = await this.db.execute(sql`
        SELECT COUNT(*) as count FROM mus_album_requests 
        WHERE status IN ('processing', 'queued')
        AND created_at < NOW() - INTERVAL '30 minutes'
      `);
      const stuckRequestsCount = Number((stuckRequestsResult.rows[0] as Record<string, unknown>)?.count || 0);

      if (stuckRequestsCount > 0) {
        issues.push(`Found ${stuckRequestsCount} stale album requests still in processing/queued state`);
      }
    } catch (error) {
      issues.push(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (issues.length > 0) {
      logger.warn('Database integrity issues detected', { issues });
    } else {
      logger.debug('Database integrity check passed');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

export async function runStartupCleanup(): Promise<CleanupResult> {
  const service = new StaleRequestCleanupService();
  const result = await service.runCleanup();

  const integrityResult = await service.verifyDatabaseIntegrity();
  if (!integrityResult.valid) {
    for (const issue of integrityResult.issues) {
      logger.warn('Integrity issue detected', { issue });
    }
  }

  return result;
}
