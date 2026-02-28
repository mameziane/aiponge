import express from 'express';
import { safe } from '../middleware/safe';
import { PlaylistController } from '../controllers/PlaylistController';
import { PlaylistService } from '../../application/services/PlaylistService';
import { SmartPlaylistEngine } from '../../application/services/SmartPlaylistEngine';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { batchLimitMiddleware } from '@aiponge/platform-core';

export function createPlaylistRoutes(playlistService: PlaylistService): express.Router {
  const router = express.Router();
  const db = getDatabase();
  const smartPlaylistEngine = new SmartPlaylistEngine(db);
  const controller = new PlaylistController(db, playlistService, smartPlaylistEngine);

  router.get(
    '/test',
    safe((req, res) => controller.test(req, res))
  );

  router.get(
    '/search',
    safe((req, res) => controller.searchPlaylists(req, res))
  );
  router.get(
    '/public/all',
    safe((req, res) => controller.getPublicPlaylists(req, res))
  );

  router.get(
    '/smart/:userId',
    safe((req, res) => controller.getSmartPlaylists(req, res))
  );
  router.get(
    '/smart/:userId/:smartKey/tracks',
    safe((req, res) => controller.getSmartPlaylistTracks(req, res))
  );

  router.post(
    '/migrate/:userId',
    safe((req, res) => controller.migrateToSmartPlaylists(req, res))
  );

  router.get(
    '/user/:userId',
    safe((req, res) => controller.getUserPlaylists(req, res))
  );

  router.get(
    '/:playlistId',
    safe((req, res) => controller.getPlaylist(req, res))
  );
  router.post(
    '/',
    safe((req, res) => controller.createPlaylist(req, res))
  );
  router.patch(
    '/:playlistId',
    safe((req, res) => controller.updatePlaylist(req, res))
  );
  router.delete(
    '/:playlistId',
    safe((req, res) => controller.deletePlaylist(req, res))
  );

  router.get(
    '/:playlistId/tracks',
    safe((req, res) => controller.getPlaylistTracks(req, res))
  );
  router.post(
    '/:playlistId/tracks',
    safe((req, res) => controller.addTrackToPlaylist(req, res))
  );
  router.delete(
    '/:playlistId/tracks/:trackId',
    safe((req, res) => controller.removeTrackFromPlaylist(req, res))
  );
  router.post(
    '/:playlistId/tracks/batch',
    batchLimitMiddleware(100),
    safe((req, res) => controller.batchUpdateTracks(req, res))
  );

  router.post(
    '/:playlistId/generate-artwork',
    safe((req, res) => controller.generateArtwork(req, res))
  );

  router.get(
    '/:playlistId/followers',
    safe((req, res) => controller.getFollowers(req, res))
  );
  router.post(
    '/:playlistId/follow',
    safe((req, res) => controller.followPlaylist(req, res))
  );
  router.delete(
    '/:playlistId/follow',
    safe((req, res) => controller.unfollowPlaylist(req, res))
  );

  router.post(
    '/:playlistId/like',
    safe((req, res) => controller.likePlaylist(req, res))
  );
  router.delete(
    '/:playlistId/like',
    safe((req, res) => controller.unlikePlaylist(req, res))
  );

  return router;
}

export default createPlaylistRoutes;
