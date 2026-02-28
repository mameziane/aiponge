import express, { Request, Response } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { getSQLConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { CONTENT_VISIBILITY, PLAYLIST_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('test-playlists-direct');

export function createTestPlaylistsRoutes() {
  const router = express.Router();

  router.get('/direct-test', async (req: Request, res: Response) => {
    try {
      logger.info('🧪 DIRECT TEST ROUTE HIT');

      const sql = getSQLConnection();
      const result = (await sql`
        SELECT id, name, visibility, total_tracks 
        FROM mus_playlists 
        WHERE visibility IN (${CONTENT_VISIBILITY.PUBLIC}, ${CONTENT_VISIBILITY.SHARED}) AND status = ${PLAYLIST_LIFECYCLE.ACTIVE}
        ORDER BY updated_at DESC
        LIMIT 5
      `) as Record<string, unknown>[];

      logger.info(`✅ Fetched ${result.length} playlists`);

      sendSuccess(res, {
        playlists: result,
        total: result.length,
      });
    } catch (error) {
      logger.error('Direct test failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Direct test failed', req);
      return;
    }
  });

  return router;
}
