/**
 * Library Track Routes - Track CRUD and operations
 * Split from library-routes.ts for maintainability
 *
 * Visibility-aware ABAC: All routes use centralized canViewContent/canEditContent/canDeleteContent
 * from content-access.ts. Librarian operations are handled through the same routes with
 * visibility=shared, eliminating the need for separate /api/librarian/shared-tracks routes.
 */

import express from 'express';
import { safe } from '../../middleware/safe';
import { TrackController } from '../../controllers/TrackController';
import { getDatabase } from '../../../infrastructure/database/DatabaseConnectionFactory';
import { GetUserLibraryUseCase } from '../../../application/use-cases/library/GetUserLibraryUseCase';
import { getServiceRegistry } from '../../../infrastructure/ServiceFactory';

export function createTrackRoutes(ctrl: TrackController): express.Router {
  const router = express.Router();

  router.get(
    '/tracks',
    safe((req, res) => ctrl.listTracks(req, res))
  );
  router.post(
    '/track',
    safe((req, res) => ctrl.createTrack(req, res))
  );
  router.post(
    '/track/:trackId/promote',
    safe((req, res) => ctrl.promoteTrack(req, res))
  );
  router.get(
    '/track/:trackId',
    safe((req, res) => ctrl.getTrack(req, res))
  );
  router.delete(
    '/track/:trackId',
    safe((req, res) => ctrl.deleteTrack(req, res))
  );

  router.get(
    '/explore',
    safe((req, res) => ctrl.getExploreFeed(req, res))
  );

  router.post(
    '/analyze-timing/:trackId',
    safe((req, res) => ctrl.analyzeTiming(req, res))
  );
  router.post(
    '/analyze-timing-batch',
    safe((req, res) => ctrl.analyzeTimingBatch(req, res))
  );

  router.post(
    '/track-play',
    safe((req, res) => ctrl.recordTrackPlay(req, res))
  );

  router.patch(
    '/tracks/bulk-update-creator-name',
    safe((req, res) => ctrl.bulkUpdateCreatorName(req, res))
  );
  router.patch(
    '/tracks/:trackId',
    safe((req, res) => ctrl.updateTrack(req, res))
  );
  router.patch(
    '/track/:trackId/artwork',
    safe((req, res) => ctrl.updateTrackArtwork(req, res))
  );
  router.patch(
    '/track/:trackId/synced-lyrics',
    safe((req, res) => ctrl.updateSyncedLyrics(req, res))
  );

  router.get(
    '/schedules/enabled',
    safe((req, res) => ctrl.getEnabledSchedules(req, res))
  );

  return router;
}

const controller = new TrackController(
  getDatabase(),
  new GetUserLibraryUseCase(),
  getServiceRegistry().userClient as import('../../../infrastructure/clients/UserServiceClient').UserServiceClient
);
const router = createTrackRoutes(controller);

export default router;
