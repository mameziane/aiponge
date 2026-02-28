/**
 * Server Setup - Music Service
 * Configures Express application with middleware and routes
 */

import express from 'express';
// CORS now handled centrally through SharedMiddleware
import path from 'path';
import fs from 'fs';

// Import all route modules
import catalogRoutes from '../../presentation/routes/catalog-routes';
import playlistRoutes from '../../presentation/routes/playlist-routes';
import streamingRoutes from '../../presentation/routes/streaming-routes';
import orchestrationRoutes from '../../presentation/routes/orchestration-routes';
import libraryRoutes from '../../presentation/routes/library-routes';
import providersRoutes from '../../presentation/routes/providers-routes';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();

const logger = getLogger('music-service-serversetup');

export class ServerSetup {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  private configureMiddleware(): void {
    // Basic middleware (CORS handled centrally through SharedMiddleware)
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static audio files (AI-generated music)
    this.app.use('/generated-music', express.static(path.join(__dirname, '../../../generated-music')));

    // ✅ REMOVED: Upload serving moved to storage-service only (single source of truth)
    // storage-service serves /uploads, API Gateway proxies it
  }

  private configureRoutes(): void {
    // Health endpoints now managed by main.ts with standardized HealthManager
    // Removed duplicate health endpoint to avoid conflicts

    // API Routes
    this.app.use('/api/catalog', catalogRoutes);
    this.app.use('/api/playlists', playlistRoutes);
    this.app.use('/api/streaming', streamingRoutes);
    this.app.use('/api/orchestration', orchestrationRoutes);
    this.app.use('/api/library', libraryRoutes);
    this.app.use('/api/providers', providersRoutes);

    this.configureAdditionalEndpoints();
  }

  private configureAdditionalEndpoints(): void {
    // Presets endpoint
    this.app.get('/api/presets', (req, res) => {
      try {
        const configPath = path.join(__dirname, '../../../musicapi-config.json');
        if (fs.existsSync(configPath)) {
          const configData = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(configData);
          res.json(config);
        } else {
          res.json({ presets: {} });
        }
      } catch (error) {
        logger.error('Error loading presets', {
          module: 'music_service_server_setup',
          operation: 'configureAdditionalEndpoints',
          error: serializeError(error),
          phase: 'presets_loading_failed',
        });
        ServiceErrors.fromException(res, error, 'Failed to load presets', req);
        return;
      }
    });
  }

  private configureErrorHandling(): void {
    // Error handling middleware
    this.app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Music Service Error', {
        module: 'music_service_server_setup',
        operation: 'configureErrorHandling',
        error: serializeError(error),
        requestPath: req.path,
        requestMethod: req.method,
        phase: 'error_handling',
      });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}
