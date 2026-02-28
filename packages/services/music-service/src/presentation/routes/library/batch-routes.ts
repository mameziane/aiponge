import express from 'express';
import { getLogger } from '../../../config/service-urls';
import { TRACK_LIFECYCLE, canEditContent, buildContentAccessContext, TIER_IDS } from '@aiponge/shared-contracts';
import { extractAuthContext, serializeError, batchLimitMiddleware, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { getDatabase } from '../../../infrastructure/database/DatabaseConnectionFactory';
import { sql } from 'drizzle-orm';

const logger = getLogger('music-service-batch-routes');

const router = express.Router();

router.patch('/tracks/batch', batchLimitMiddleware(50), async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    const userId = authContext.userId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      ServiceErrors.badRequest(res, 'updates must be an array', req);
      return;
    }

    for (const item of updates) {
      if (!item.id || typeof item.id !== 'string') {
        ServiceErrors.badRequest(res, 'Each update must have a valid id', req);
        return;
      }
    }

    const trackIds = updates.map((u: { id: string }) => u.id);
    const db = getDatabase();

    const existingResult = await db.execute(sql`
      SELECT id, user_id, visibility
      FROM mus_tracks
      WHERE id = ANY(${trackIds}::uuid[])
        AND status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
    `);

    const existingTracks = new Map<string, { user_id: string; visibility: string }>();
    for (const row of (existingResult.rows || []) as { id: string; user_id: string; visibility: string }[]) {
      existingTracks.set(row.id, { user_id: row.user_id, visibility: row.visibility });
    }

    const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);

    for (const track of existingTracks.values()) {
      if (!canEditContent({ ownerId: track.user_id, visibility: track.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied: you do not have permission to edit all specified tracks', req);
        return;
      }
    }

    let updated = 0;
    let failed = 0;
    const errors: { id: string; error: string }[] = [];

    await db.transaction(async (tx) => {
      for (const item of updates) {
        if (!existingTracks.has(item.id)) {
          failed++;
          errors.push({ id: item.id, error: 'Track not found' });
          continue;
        }

        const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

        if (item.title && typeof item.title === 'string') {
          setParts.push(sql`title = ${item.title.trim()}`);
        }
        if (item.genres && Array.isArray(item.genres)) {
          const filtered = item.genres.filter((g: unknown) => typeof g === 'string' && g.length > 0);
          setParts.push(sql`genres = ${filtered}::text[]`);
        }
        if (item.tags && Array.isArray(item.tags)) {
          const filtered = item.tags.filter((t: unknown) => typeof t === 'string' && t.length > 0);
          setParts.push(sql`tags = ${filtered}::text[]`);
        }
        if (item.visibility && typeof item.visibility === 'string') {
          setParts.push(sql`visibility = ${item.visibility}`);
        }

        if (setParts.length <= 1) {
          failed++;
          errors.push({ id: item.id, error: 'No valid fields to update' });
          continue;
        }

        try {
          const setClauses = setParts.reduce((acc, part, i) => (i === 0 ? part : sql`${acc}, ${part}`));
          await tx.execute(sql`
            UPDATE mus_tracks
            SET ${setClauses}
            WHERE id = ${item.id}
          `);
          updated++;
        } catch (err) {
          failed++;
          errors.push({ id: item.id, error: err instanceof Error ? err.message : 'Update failed' });
        }
      }
    });

    logger.info('Batch track update completed', { updated, failed, userId });

    sendSuccess(res, { updated, failed, errors });
  } catch (error) {
    logger.error('Batch track update error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to batch update tracks', req);
  }
});

router.post('/favorites/batch', batchLimitMiddleware(50), async (req, res) => {
  try {
    const { userId } = extractAuthContext(req);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const { trackIds, action } = req.body;

    if (!Array.isArray(trackIds)) {
      ServiceErrors.badRequest(res, 'trackIds must be an array', req);
      return;
    }

    if (action !== 'add' && action !== 'remove') {
      ServiceErrors.badRequest(res, 'action must be "add" or "remove"', req);
      return;
    }

    const validTrackIds = trackIds.filter(
      (id: unknown): id is string => typeof id === 'string' && (id as string).length > 0
    );

    if (validTrackIds.length === 0) {
      ServiceErrors.badRequest(res, 'No valid track IDs provided', req);
      return;
    }

    const db = getDatabase();
    let processed = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      if (action === 'add') {
        for (const trackId of validTrackIds) {
          const existing = await tx.execute(sql`
            SELECT id FROM mus_favorite_tracks
            WHERE user_id = ${userId} AND track_id = ${trackId}
          `);

          if (existing.rows && existing.rows.length > 0) {
            skipped++;
            continue;
          }

          await tx.execute(sql`
            INSERT INTO mus_favorite_tracks (id, user_id, track_id, added_at)
            VALUES (gen_random_uuid(), ${userId}, ${trackId}, NOW())
          `);

          await tx.execute(sql`
            UPDATE mus_tracks
            SET like_count = COALESCE(like_count, 0) + 1,
                updated_at = NOW()
            WHERE id = ${trackId}
          `);
          processed++;
        }
      } else {
        for (const trackId of validTrackIds) {
          const existing = await tx.execute(sql`
            DELETE FROM mus_favorite_tracks
            WHERE user_id = ${userId} AND track_id = ${trackId}
            RETURNING id
          `);

          if (existing.rows && existing.rows.length > 0) {
            await tx.execute(sql`
              UPDATE mus_tracks
              SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0),
                  updated_at = NOW()
              WHERE id = ${trackId}
            `);
            processed++;
          } else {
            skipped++;
          }
        }
      }
    });

    logger.info('Batch favorite operation completed', { action, processed, skipped, userId });

    sendSuccess(res, { action, processed, skipped });
  } catch (error) {
    logger.error('Batch favorite error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to batch update favorites', req);
  }
});

export default router;
