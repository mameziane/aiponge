/**
 * Music Service - Express App Factory
 * Properly wired AI Music functionality with all controllers and real routes
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { getLogger } from '../config/service-urls';
import { serializeError, createResilienceStatsHandler, getResponseHelpers } from '@aiponge/platform-core';

import { createHealthRoutes } from './routes/health-routes';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { loggingMiddleware } from './middleware/logging';
import { createMusicRoutes } from './routes/music-routes';
import libraryRoutes from './routes/library-routes';
import { createPlaylistRoutes } from './routes/playlist-routes';
import artworkRoutes from './routes/artwork-routes';

const { ServiceErrors } = getResponseHelpers();
import { createFeedbackRoutes } from './routes/feedback-routes';

import { DrizzleAudioProcessingJobRepository } from '../infrastructure/database/DrizzleAudioProcessingJobRepository';
import { DrizzlePlaylistRepository } from '../infrastructure/database/DrizzlePlaylistRepository';

import { getServiceRegistry } from '../infrastructure/ServiceFactory';
import { ProcessAudioUseCase } from '../application/use-cases/music/ProcessAudioUseCase';

import { MusicGenerationController } from './controllers/MusicGenerationController';
import { MusicLibraryController } from './controllers/MusicLibraryController';
import { AudioProcessingController } from './controllers/AudioProcessingController';
import { MusicAnalyticsController } from './controllers/MusicAnalyticsController';
import { adminMetricsController } from './controllers/AdminMetricsController';

import { AudioProcessingService } from '../domains/ai-music/services/AudioProcessingService';
import { PlaylistService } from '../application/services/PlaylistService';
import {
  startMusicEventSubscriber,
  stopMusicEventSubscriber,
  isMusicEventSubscriberReady,
} from '../infrastructure/events/MusicEventSubscriber';

const logger = getLogger('music-service-app');

/**
 * Creates Music Service Express app instance
 * Fully initialized with all AI music controllers and real routes
 */
export async function createApp(): Promise<Express> {
  const app = express();

  setupMiddleware(app);
  await setupRoutes(app);
  setupErrorHandling(app);

  return app;
}

function setupMiddleware(app: Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", 'https:'],
          frameSrc: ["'none'"],
        },
      },
    })
  );

  // Parse CORS origins from environment variable (comma-separated)
  // Production requires CORS_ALLOWED_ORIGINS to be set; fallback to localhost in development
  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : process.env.NODE_ENV === 'production'
      ? ['https://admin.aiponge.com', 'https://api.aiponge.com']
      : true;

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'X-Session-ID'],
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(loggingMiddleware(logger));

  // ✅ REMOVED: Upload serving moved to storage-service only (single source of truth)
  // storage-service serves /uploads, API Gateway proxies it
}

async function setupRoutes(app: Express): Promise<void> {
  const healthRoutes = createHealthRoutes();
  app.use('/', healthRoutes);

  app.get('/api/admin/resilience-stats', createResilienceStatsHandler('music-service'));

  const { db, analyticsClient } = getServiceRegistry();

  const audioJobRepo = new DrizzleAudioProcessingJobRepository(db);
  const playlistRepo = new DrizzlePlaylistRepository(db);

  const audioProcessingService = new AudioProcessingService();
  const playlistService = new PlaylistService(playlistRepo);

  try {
    await initializeEventSubscriber(playlistService);
  } catch (error) {
    logger.warn('Failed to initialize event subscriber, will continue without it:', {
      error: serializeError(error),
    });
  }

  const processAudioUseCase = new ProcessAudioUseCase(audioProcessingService, audioJobRepo, analyticsClient);

  const musicGenerationController = new MusicGenerationController(processAudioUseCase);

  const { DrizzleAlbumRequestRepository } = await import('../infrastructure/database/DrizzleAlbumRequestRepository');
  const albumRequestRepo = new DrizzleAlbumRequestRepository(db);
  musicGenerationController.setAlbumRequestRepository(albumRequestRepo);

  const { DrizzleSongRequestRepository } = await import('../infrastructure/database/DrizzleSongRequestRepository');
  const songRequestRepo = new DrizzleSongRequestRepository(db);
  musicGenerationController.setSongRequestRepository(songRequestRepo);

  const musicLibraryController = new MusicLibraryController(analyticsClient);

  const audioProcessingController = new AudioProcessingController(processAudioUseCase, audioJobRepo);

  const musicAnalyticsController = new MusicAnalyticsController(analyticsClient);

  const musicRoutes = createMusicRoutes(
    musicGenerationController,
    musicLibraryController,
    audioProcessingController,
    musicAnalyticsController
  );

  const playlistRoutes = createPlaylistRoutes(playlistService);

  // Direct test route for debugging
  const { createTestPlaylistsRoutes } = await import('./routes/test-playlists-direct');
  const testRoutes = createTestPlaylistsRoutes();

  // IMPORTANT: Mount more specific routes first!
  // /api/music/library must be before /api/music to avoid route shadowing
  app.use('/api/music/library', libraryRoutes);
  app.use('/api/music', musicRoutes);
  app.use('/api/music', artworkRoutes); // Artwork generation endpoint
  app.use('/api/playlists-test', testRoutes); // Test route

  // Feedback routes for user helpfulness tracking
  const feedbackRoutes = createFeedbackRoutes(db);
  app.use('/api/feedback', feedbackRoutes);

  // Admin metrics endpoint
  app.get('/admin/product-metrics', (req, res) => adminMetricsController.getProductMetrics(req, res));
  app.get('/admin/replay-rate', (req, res) => adminMetricsController.getReplayRate(req, res));

  app.use('/api/playlists', playlistRoutes);

  app.get('/', (req, res) => {
    res.json({
      service: 'music-service',
      version: process.env.npm_package_version || '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        ready: '/ready',
        musicGeneration: '/api/music/generate',
        musicLibrary: '/api/music/library',
        musicAnalytics: '/api/music/analytics',
        playlists: '/api/playlists',
      },
    });
  });

  app.use('*', (req, res) => {
    ServiceErrors.notFound(res, 'Endpoint', req);
  });
}

function setupErrorHandling(app: Express): void {
  app.use(errorHandlerMiddleware(logger));
}

export async function initializeEventSubscriber(_playlistService?: PlaylistService): Promise<void> {
  if (isMusicEventSubscriberReady()) {
    logger.info('Event subscriber already initialized');
    return;
  }

  await startMusicEventSubscriber();
}

export async function shutdownEventSubscriber(): Promise<void> {
  await stopMusicEventSubscriber();
}
