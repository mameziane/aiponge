/**
 * Unreferenced File Detection Service
 * Scans storage for files not referenced in any database table
 * and marks them as orphaned for eventual cleanup
 */

import { eq, sql, and } from 'drizzle-orm';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import * as schema from '../../schema/storage-schema';
import { getLogger } from '../../config/service-urls';
import { STORAGE_FILE_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('unreferenced-file-detection');

export interface DetectionConfig {
  batchSize: number;
  dryRun?: boolean;
  categories?: string[]; // Filter by category: avatar, track, track-artwork, playlist-artwork, general
  maxIterations?: number; // Maximum number of batches to process (default: unlimited)
}

export interface DetectionResult {
  scannedCount: number;
  unreferencedCount: number;
  markedOrphanedCount: number;
  errors: string[];
  unreferencedFiles: Array<{
    id: string;
    storagePath: string;
    category: string | null;
    createdAt: Date;
  }>;
  paginationComplete: boolean; // Whether all files were scanned
}

/**
 * SQL query to find all referenced file URLs across the database
 * Comprehensive coverage of all tables/columns that store file URLs
 * Uses UNION ALL for best performance, DISTINCT at the end for deduplication
 *
 * Reference sources:
 * - User avatars (usr_accounts.profile->>'avatarUrl')
 * - Album covers (mus_albums.cover_image_url)
 * - Track files and artwork (mus_tracks.file_url, artwork_url) - consolidated table includes all tracks
 * - Playlist covers (mus_playlists.cover_image_url)
 * - File versions (stg_versions.storage_path, public_url)
 *
 */
const REFERENCED_URLS_QUERY = sql`
  SELECT DISTINCT url FROM (
    -- User avatars from profile JSONB
    SELECT profile->>'avatarUrl' as url FROM usr_accounts
      WHERE profile->>'avatarUrl' IS NOT NULL AND profile->>'avatarUrl' != ''
    UNION ALL
    -- Album cover images
    SELECT cover_image_url as url FROM mus_albums WHERE cover_image_url IS NOT NULL AND cover_image_url != ''
    UNION ALL
    -- Track audio files (includes both shared and personal tracks via visibility)
    SELECT file_url as url FROM mus_tracks WHERE file_url IS NOT NULL AND file_url != ''
    UNION ALL
    -- Track artwork (includes both shared and personal tracks via visibility)
    SELECT artwork_url as url FROM mus_tracks WHERE artwork_url IS NOT NULL AND artwork_url != ''
    UNION ALL
    -- Playlist cover images
    SELECT cover_image_url as url FROM mus_playlists WHERE cover_image_url IS NOT NULL AND cover_image_url != ''
    UNION ALL
    -- File versions storage paths (these are related files that should be kept)
    SELECT storage_path as url FROM stg_versions WHERE storage_path IS NOT NULL AND storage_path != ''
    UNION ALL
    -- File versions public URLs
    SELECT public_url as url FROM stg_versions WHERE public_url IS NOT NULL AND public_url != ''
  ) referenced_urls WHERE url IS NOT NULL
`;

export class UnreferencedFileDetectionService {
  private readonly defaultConfig: DetectionConfig = {
    batchSize: 500,
    dryRun: false,
  };

  constructor(private _db: DatabaseConnection) {}

  /**
   * Detect files in storage that are not referenced anywhere in the database
   * Paginates through all active files to ensure complete coverage
   */
  async detectUnreferencedFiles(config?: Partial<DetectionConfig>): Promise<DetectionResult> {
    const cfg = { ...this.defaultConfig, ...config };

    const result: DetectionResult = {
      scannedCount: 0,
      unreferencedCount: 0,
      markedOrphanedCount: 0,
      errors: [],
      unreferencedFiles: [],
      paginationComplete: false,
    };

    try {
      logger.info('Starting unreferenced file detection', {
        batchSize: cfg.batchSize,
        dryRun: cfg.dryRun,
        categories: cfg.categories,
        maxIterations: cfg.maxIterations,
      });

      // Step 1: Get all referenced URLs from across the database (one-time load)
      const referencedUrls = await this.loadReferencedUrls();
      logger.info('Found referenced files', { count: referencedUrls.size });

      // Step 2: Paginate through all active files using offset-based pagination
      // Note: Offset pagination is stable for a single scan when ordered by a consistent column
      let offset = 0;
      let iteration = 0;
      let hasMore = true;

      while (hasMore) {
        // Check max iterations limit
        if (cfg.maxIterations && iteration >= cfg.maxIterations) {
          logger.info('Reached max iterations limit', { iteration, maxIterations: cfg.maxIterations });
          break;
        }

        // Build where conditions
        const whereConditions = [eq(schema.files.status, STORAGE_FILE_LIFECYCLE.ACTIVE)];

        if (cfg.categories && cfg.categories.length > 0) {
          whereConditions.push(
            sql`${schema.files.category} IN (${sql.join(
              cfg.categories.map(c => sql`${c}`),
              sql`, `
            )})`
          );
        }

        // Fetch batch with offset pagination, ordered by createdAt for consistency
        const activeFiles = await this._db
          .select({
            id: schema.files.id,
            storagePath: schema.files.storagePath,
            publicUrl: schema.files.publicUrl,
            category: schema.files.category,
            createdAt: schema.files.createdAt,
          })
          .from(schema.files)
          .where(and(...whereConditions))
          .orderBy(schema.files.createdAt, schema.files.id)
          .limit(cfg.batchSize)
          .offset(offset);

        if (activeFiles.length === 0) {
          hasMore = false;
          result.paginationComplete = true;
          break;
        }

        result.scannedCount += activeFiles.length;
        logger.info('Processing batch', {
          iteration,
          batchSize: activeFiles.length,
          offset,
          totalScanned: result.scannedCount,
        });

        // Process each file in the batch
        for (const file of activeFiles) {
          const isReferenced = referencedUrls.has(file.storagePath);

          if (!isReferenced) {
            result.unreferencedCount++;
            result.unreferencedFiles.push({
              id: file.id,
              storagePath: file.storagePath,
              category: file.category,
              createdAt: file.createdAt,
            });

            if (!cfg.dryRun) {
              try {
                await this._db
                  .update(schema.files)
                  .set({
                    status: STORAGE_FILE_LIFECYCLE.ORPHANED,
                    orphanedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.files.id, file.id));

                result.markedOrphanedCount++;
                logger.debug('Marked unreferenced file as orphaned', {
                  id: file.id,
                  path: file.storagePath,
                  category: file.category,
                });
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`Failed to mark ${file.storagePath}: ${errorMsg}`);
                logger.error('Failed to mark file as orphaned', { id: file.id, error: errorMsg });
              }
            } else {
              logger.debug('[DRY RUN] Would mark as orphaned', {
                id: file.id,
                path: file.storagePath,
                category: file.category,
              });
            }
          }
        }

        // Check if we got a full batch (more records may exist)
        if (activeFiles.length < cfg.batchSize) {
          hasMore = false;
          result.paginationComplete = true;
        } else {
          offset += cfg.batchSize;
          iteration++;
        }
      }

      logger.info('Detection completed', {
        scanned: result.scannedCount,
        unreferenced: result.unreferencedCount,
        markedOrphaned: result.markedOrphanedCount,
        paginationComplete: result.paginationComplete,
        dryRun: cfg.dryRun,
      });

      return result;
    } catch (error) {
      logger.error('Detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Load all referenced URLs into a Set for efficient lookup
   */
  private async loadReferencedUrls(): Promise<Set<string>> {
    const referencedUrlsResult = await this._db.execute(REFERENCED_URLS_QUERY);
    const referencedUrls = new Set<string>();

    for (const row of referencedUrlsResult.rows) {
      const url = (row as { url: string }).url;
      if (url) {
        const storagePath = this.extractStoragePath(url);
        if (storagePath) {
          referencedUrls.add(storagePath);
        }
      }
    }

    return referencedUrls;
  }

  /**
   * Get statistics about file references
   */
  async getFileReferenceStats(): Promise<{
    totalActiveFiles: number;
    referencedCount: number;
    potentiallyUnreferenced: number;
    byCategory: Record<string, { active: number; orphaned: number }>;
  }> {
    // Get all referenced URLs (reuses the shared method)
    const referencedUrls = await this.loadReferencedUrls();

    // Get file counts by status
    const stats = await this._db.execute(sql`
      SELECT 
        category,
        COUNT(*) FILTER (WHERE status = ${STORAGE_FILE_LIFECYCLE.ACTIVE}) as active_count,
        COUNT(*) FILTER (WHERE status = ${STORAGE_FILE_LIFECYCLE.ORPHANED}) as orphaned_count
      FROM stg_files
      GROUP BY category
    `);

    const byCategory: Record<string, { active: number; orphaned: number }> = {};
    let totalActive = 0;

    for (const row of stats.rows) {
      const r = row as { category: string; active_count: string; orphaned_count: string };
      const category = r.category || 'uncategorized';
      byCategory[category] = {
        active: parseInt(r.active_count) || 0,
        orphaned: parseInt(r.orphaned_count) || 0,
      };
      totalActive += byCategory[category].active;
    }

    // Check how many active files are actually referenced
    const activeFiles = await this._db
      .select({ storagePath: schema.files.storagePath })
      .from(schema.files)
      .where(eq(schema.files.status, STORAGE_FILE_LIFECYCLE.ACTIVE));

    let referencedCount = 0;
    for (const file of activeFiles) {
      if (referencedUrls.has(file.storagePath)) {
        referencedCount++;
      }
    }

    return {
      totalActiveFiles: totalActive,
      referencedCount,
      potentiallyUnreferenced: totalActive - referencedCount,
      byCategory,
    };
  }

  private extractStoragePath(fileUrl: string): string | null {
    if (!fileUrl) return null;

    // Remove query strings and fragments first (handles presigned URLs, CDN links)
    const cleanUrl = fileUrl.split('?')[0].split('#')[0];

    try {
      // Case 1: Already a bare storage path (e.g., "user/avatars/file.jpg")
      if (!cleanUrl.startsWith('/') && !cleanUrl.startsWith('http')) {
        return cleanUrl;
      }

      // Case 2: Relative URL (e.g., "/uploads/user/avatars/file.jpg")
      if (cleanUrl.startsWith('/uploads/')) {
        return cleanUrl.replace('/uploads/', '');
      }

      // Case 3: Absolute URL (e.g., "https://domain/uploads/user/avatars/file.jpg")
      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }

      // Case 4: Path starting with / but no /uploads prefix
      if (cleanUrl.startsWith('/')) {
        return cleanUrl.substring(1);
      }

      return cleanUrl;
    } catch {
      // Fallback: try to extract anything after /uploads/
      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }
      return null;
    }
  }
}
