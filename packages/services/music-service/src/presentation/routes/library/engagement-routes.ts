import express from 'express';
import { safe } from '../../middleware/safe';
import { EngagementController } from '../../controllers/EngagementController';
import { getDatabase } from '../../../infrastructure/database/DatabaseConnectionFactory';
import { GetUserLibraryUseCase } from '../../../application/use-cases/library/GetUserLibraryUseCase';

export function createEngagementRoutes(ctrl: EngagementController): express.Router {
  const router = express.Router();

  router.get(
    '/liked-tracks',
    safe((req, res) => ctrl.getLikedTracks(req, res))
  );
  router.post(
    '/track/:trackId/like',
    safe((req, res) => ctrl.likeTrack(req, res))
  );
  router.delete(
    '/track/:trackId/like',
    safe((req, res) => ctrl.unlikeTrack(req, res))
  );

  router.get(
    '/activity/calendar',
    safe((req, res) => ctrl.getActivityCalendar(req, res))
  );
  router.get(
    '/activity/day/:date',
    safe((req, res) => ctrl.getActivityDay(req, res))
  );

  router.post(
    '/share-to-public',
    safe((req, res) => ctrl.shareToPublic(req, res))
  );
  router.delete(
    '/unshare-from-public/:trackId',
    safe((req, res) => ctrl.unshareFromPublic(req, res))
  );

  router.delete(
    '/admin/shared-track/:trackId',
    safe((req, res) => ctrl.adminDeleteSharedTrack(req, res))
  );
  router.post(
    '/admin/move-to-public',
    safe((req, res) => ctrl.adminMoveToPublic(req, res))
  );

  router.get(
    '/liked-albums',
    safe((req, res) => ctrl.getLikedAlbums(req, res))
  );
  router.post(
    '/album/:albumId/like',
    safe((req, res) => ctrl.likeAlbum(req, res))
  );
  router.delete(
    '/album/:albumId/like',
    safe((req, res) => ctrl.unlikeAlbum(req, res))
  );

  router.patch(
    '/track/:trackId/favorite/tags',
    safe((req, res) => ctrl.updateFavoriteTags(req, res))
  );

  router.get(
    '/followed-creators',
    safe((req, res) => ctrl.getFollowedCreators(req, res))
  );
  router.post(
    '/creator/:creatorId/follow',
    safe((req, res) => ctrl.followCreator(req, res))
  );
  router.delete(
    '/creator/:creatorId/follow',
    safe((req, res) => ctrl.unfollowCreator(req, res))
  );

  router.patch(
    '/track/:trackId/favorite',
    safe((req, res) => ctrl.updateFavoriteTrack(req, res))
  );
  router.patch(
    '/album/:albumId/favorite',
    safe((req, res) => ctrl.updateFavoriteAlbum(req, res))
  );
  router.patch(
    '/creator/:creatorId/follow',
    safe((req, res) => ctrl.updateFollowedCreatorRating(req, res))
  );

  return router;
}

const controller = new EngagementController(getDatabase(), new GetUserLibraryUseCase());
const router = createEngagementRoutes(controller);

export default router;
