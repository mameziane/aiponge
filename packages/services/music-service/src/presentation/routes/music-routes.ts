import { Router } from 'express';
import { MusicGenerationController } from '../controllers/MusicGenerationController';
import { MusicLibraryController } from '../controllers/MusicLibraryController';
import { AudioProcessingController } from '../controllers/AudioProcessingController';
import { MusicAnalyticsController } from '../controllers/MusicAnalyticsController';
import { MusicSessionController } from '../controllers/MusicSessionController';
import { safe } from '../middleware/safe';
import { validationMiddleware } from '../middleware/validation';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { authMiddleware } from '../middleware/auth';
import { serviceAuthMiddleware } from '@aiponge/platform-core';

export function createMusicRoutes(
  musicGenerationController: MusicGenerationController,
  musicLibraryController: MusicLibraryController,
  audioProcessingController: AudioProcessingController,
  musicAnalyticsController: MusicAnalyticsController
): Router {
  const router = Router();
  const sessionController = new MusicSessionController();

  const internalAuthMiddleware = serviceAuthMiddleware({
    required: !!process.env.INTERNAL_SERVICE_SECRET,
    trustGateway: true,
  });

  // ===== MUSIC GENERATION =====
  router.post(
    '/generate-track',
    internalAuthMiddleware,
    rateLimitMiddleware('music-generation', { windowMs: 60000, max: 10 }),
    safe((req, res) => musicGenerationController.generateTrack(req, res))
  );
  router.post(
    '/generate-album',
    internalAuthMiddleware,
    rateLimitMiddleware('album-generation', { windowMs: 60000, max: 3 }),
    safe((req, res) => musicGenerationController.generateAlbum(req, res))
  );
  router.post(
    '/generate-async',
    authMiddleware,
    safe((req, res) => sessionController.generateAsync(req, res))
  );

  // ===== ALBUM REQUEST PROGRESS =====
  router.get(
    '/album-requests/active',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => musicGenerationController.getActiveAlbumRequest(req, res))
  );
  router.get(
    '/album-requests/active/all',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => musicGenerationController.getAllActiveAlbumRequests(req, res))
  );
  router.get(
    '/album-requests/:id',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => musicGenerationController.getAlbumProgress(req, res))
  );

  // ===== SONG REQUEST PROGRESS =====
  router.get(
    '/song-requests/active',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => musicGenerationController.getActiveSongRequest(req, res))
  );
  router.get(
    '/song-requests/:id',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => musicGenerationController.getSongProgress(req, res))
  );

  // ===== AUDIO PROCESSING =====
  router.post(
    '/process',
    rateLimitMiddleware('audio-processing', { windowMs: 60000, max: 5 }),
    authMiddleware.required(),
    validationMiddleware('process-audio'),
    safe((req, res) => audioProcessingController.processAudio(req, res))
  );
  router.get(
    '/processing/:jobId',
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 60 }),
    safe((req, res) => audioProcessingController.getJobStatus(req, res))
  );
  router.post(
    '/processing/:jobId/cancel',
    authMiddleware.required(),
    safe((req, res) => audioProcessingController.cancelJob(req, res))
  );

  // ===== PLAYLISTS =====
  router.post(
    '/playlists',
    authMiddleware.required(),
    validationMiddleware('create-playlist'),
    safe((req, res) => musicLibraryController.createPlaylist(req, res))
  );
  router.get(
    '/playlists',
    authMiddleware.required(),
    safe((req, res) => musicLibraryController.getUserPlaylists(req, res))
  );
  router.patch(
    '/playlists/:id',
    authMiddleware.required(),
    validationMiddleware('update-playlist'),
    safe((req, res) => musicLibraryController.updatePlaylist(req, res))
  );
  router.delete(
    '/playlists/:id',
    authMiddleware.required(),
    safe((req, res) => musicLibraryController.deletePlaylist(req, res))
  );

  // ===== ANALYTICS =====
  router.get(
    '/analytics',
    authMiddleware.required(),
    safe((req, res) => musicAnalyticsController.getUserAnalytics(req, res))
  );
  router.get(
    '/popular',
    rateLimitMiddleware('popular-access', { windowMs: 60000, max: 100 }),
    safe((req, res) => musicAnalyticsController.getPopularMusic(req, res))
  );
  router.get(
    '/stats',
    authMiddleware.admin(),
    safe((req, res) => musicAnalyticsController.getSystemStats(req, res))
  );
  router.post(
    '/events',
    rateLimitMiddleware('event-tracking', { windowMs: 60000, max: 200 }),
    validationMiddleware('record-event'),
    safe((req, res) => musicAnalyticsController.trackEvent(req, res))
  );

  // ===== ADMIN =====
  router.post(
    '/admin/migrate/album-visibility',
    authMiddleware.admin(),
    safe((req, res) => sessionController.migrateAlbumVisibility(req, res))
  );

  // ===== SESSION / STATUS =====
  router.get(
    '/health',
    safe((req, res) => sessionController.getHealth(req, res))
  );
  router.get(
    '/version',
    safe((req, res) => sessionController.getVersion(req, res))
  );
  router.get(
    '/capabilities',
    safe((req, res) => sessionController.getCapabilities(req, res))
  );
  router.get(
    '/generation-jobs/:jobId/status',
    authMiddleware,
    safe((req, res) => sessionController.getGenerationJobStatus(req, res))
  );
  router.post(
    '/analyze-preferences',
    internalAuthMiddleware,
    rateLimitMiddleware('music-generation', { windowMs: 60000, max: 10 }),
    safe((req, res) => sessionController.analyzePreferences(req, res))
  );

  return router;
}

export default createMusicRoutes;
