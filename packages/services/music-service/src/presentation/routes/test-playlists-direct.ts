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

      const pool = getSQLConnection();
      const queryResult = await pool.query(
        `SELECT id, name, visibility, total_tracks
        FROM mus_playlists
        WHERE visibility IN ($1, $2) AND status = $3
        ORDER BY updated_at DESC
        LIMIT 5`,
        [CONTENT_VISIBILITY.PUBLIC, CONTENT_VISIBILITY.SHARED, PLAYLIST_LIFECYCLE.ACTIVE]
      );

      logger.info(`Fetched ${queryResult.rows.length} playlists`);

      sendSuccess(res, {
        playlists: queryResult.rows,
        total: queryResult.rows.length,
      });
    } catch (error) {
      logger.error('Direct test failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Direct test failed', req);
      return;
    }
  });

  return router;
}
