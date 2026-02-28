// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

// Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(20);

/**
 * Music Service - Phase 2a Consolidated Service
 * Unified Entry Point for Music Catalog, Generation, Processing, and Streaming
 */

import {
  createLogger,
  createOrchestrationBootstrap,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
  registerGlobalErrorHandlers,
  validateSchema,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  initAuditService,
  SimpleAuditPersister,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
} from '@aiponge/platform-core';

initSentry('music-service');
failFastValidation('music-service');
import { serviceAuthMiddleware, extractAuthContext, initResponseHelpers, initValidation } from '@aiponge/platform-core';
import express, { type Express } from 'express';
import type { DatabaseConnection } from './infrastructure/database/DatabaseConnectionFactory';
import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';

// Event subscribers
import { startStorageEventSubscriber } from './infrastructure/events/StorageEventSubscriber';
import { initializeGenerationQueue } from './application/services/GenerationQueueProcessor';

// Initialize ServiceLocator to load ports from services.config.ts
ServiceLocator.initialize();

// Register global error handlers to prevent silent crashes from unhandled promise rejections
registerGlobalErrorHandlers('service-specific');

// Configuration
const SERVICE_NAME = 'music-service';
const { ServiceErrors } = initResponseHelpers(SERVICE_NAME);
initValidation(SERVICE_NAME);
const defaultPort = ServiceLocator.getServicePort('music-service');
const PORT = Number(process.env.PORT || process.env.MUSIC_SERVICE_PORT || defaultPort);

// Initialize structured logger
const logger = createLogger(SERVICE_NAME);

/**
 * Start the Music Service
 */
async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting Music Service...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
      consolidation: 'Phase 2a - Music + AI Music',
    });

    // Create health manager
    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    // Create orchestration-aware bootstrap with combined capabilities
    const bootstrap = createOrchestrationBootstrap(SERVICE_NAME, PORT, {
      registration: {
        capabilities: [
          // Music Catalog & Streaming
          'music-streaming',
          'playlist-management',
          'audio-playback',
          'music-library',
          'music-catalog',
          'user-preferences',
          'streaming-analytics',
          // Music Generation
          'music_generation',
          'audio_processing',
          'music_template_management',
          'music_analytics',
          'lyrics_generation',
        ],
        features: {
          // Catalog features
          musicStreaming: 'High-quality music streaming and playback',
          playlistManagement: 'Playlist creation and management',
          musicCatalog: 'Music catalog browsing and search',
          musicLibrary: 'User music library management',
          // Generation features
          musicGeneration: 'AI-powered music generation',
          audioProcessing: 'Audio processing and conversion',
          lyricsGeneration: 'AI-generated lyrics',
        },
        endpoints: {
          // Catalog endpoints
          catalog: '/api/catalog',
          playlists: '/api/playlists',
          streaming: '/api/streaming',
          library: '/api/library',
          // Generation endpoints
          generate: '/api/music/generate',
          templates: '/api/music/templates',
          process: '/api/music/process',
        },
      },
      middleware: {
        cors: true,
        helmet: true,
        compression: true,
        requestLogger: true,
      },
    });

    logger.debug('✅ Loading routes...');

    // Import music catalog routes
    const catalogRoutes = await import('./presentation/routes/catalog-routes');
    const streamingRoutes = await import('./presentation/routes/streaming-routes');
    const libraryRoutes = await import('./presentation/routes/library-routes');
    const orchestrationRoutes = await import('./presentation/routes/orchestration-routes');
    const providersRoutes = await import('./presentation/routes/providers-routes');
    const musicApiRoutes = await import('./presentation/routes/music-api-routes');
    const lyricsRoutes = await import('./presentation/routes/lyrics-routes');
    // shared-lyrics-routes consolidated into lyrics-routes.ts (D7 refactoring)

    // Import AI music app (contains all AI music routes and controllers)
    // NOTE: app.ts already mounts playlist routes internally - no need to mount here
    const { createApp: createMusicApp } = await import('./presentation/app');
    const musicApp = await createMusicApp();

    // Schema validation in development mode
    if (process.env.NODE_ENV === 'development') {
      const { getSQLConnection } = await import('./infrastructure/database/DatabaseConnectionFactory');
      const schema = await import('./schema/music-schema');
      const validationResult = await validateSchema({
        serviceName: SERVICE_NAME,
        schema,
        sql: getSQLConnection(),
        failOnMismatch: false,
      });
      if (!validationResult.success) {
        logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
      }
    }

    // Initialize audit service with shared persister for cross-service audit logging
    {
      const { getDatabase: getDb } = await import('./infrastructure/database/DatabaseConnectionFactory');
      initAuditService(new SimpleAuditPersister(getDb()));
      logger.debug('Audit service initialized with SimpleAuditPersister');
    }

    // Start service
    await bootstrap.start({
      healthManager,
      customMiddleware: (app: express.Application) => {
        if (isSentryInitialized()) {
          app.use(createSentryCorrelationMiddleware());
        }
      },
      customRoutes: (app: express.Application) => {
        // Music catalog routes
        app.use('/api/catalog', catalogRoutes.default);
        // REMOVED: app.use('/api/playlists', ...) - already mounted in app.ts
        app.use('/api/streaming', streamingRoutes.default);
        app.use('/api/library', libraryRoutes.default);
        // /api/librarian/* consolidated into /api/library/* and /api/playlists/* with visibility-aware ABAC
        app.use('/api/lyrics', lyricsRoutes.default);
        // /api/lyrics/shared/* now handled by consolidated lyrics-routes.ts
        app.use('/api/orchestration', orchestrationRoutes.default);
        app.use('/api/providers', providersRoutes.default);
        app.use('/api/music-api', musicApiRoutes.default);

        // Mount AI music app with all its routes (includes /api/playlists)
        app.use('/', musicApp);

        // GDPR Article 17: User data deletion endpoint
        app.delete('/api/users/:userId/data', async (req, res) => {
          const { userId } = req.params;
          const { userId: requestedBy } = extractAuthContext(req);

          logger.info('GDPR: User data deletion request received', { userId, requestedBy });

          try {
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { eq } = await import('drizzle-orm');
            const {
              playlists,
              playlistFollowers,
              playlistActivities,
              playlistLikes,
              favoriteTracks,
              favoriteAlbums,
              followedCreators,
              recentlyPlayed,
              albums,
              tracks,
              trackFeedback,
              lyrics,
              albumRequests,
              songRequests,
              musicAnalytics,
              streamSessions,
              streamAnalytics,
            } = await import('./schema/music-schema');

            const db = getDatabase();

            // Phase 1: Extract audio file URLs before deletion for storage cleanup
            // Uses unified tracks table for all user content
            const tracksToDelete = await db
              .select({
                id: tracks.id,
                fileUrl: tracks.fileUrl,
                artworkUrl: tracks.artworkUrl,
              })
              .from(tracks)
              .where(eq(tracks.userId, userId));

            const audioUrls = tracksToDelete.filter(t => t.fileUrl).map(t => t.fileUrl as string);
            const artworkUrls = tracksToDelete.filter(t => t.artworkUrl).map(t => t.artworkUrl as string);

            logger.info('GDPR: Extracted asset URLs for cleanup', {
              userId,
              audioUrlCount: audioUrls.length,
              artworkUrlCount: artworkUrls.length,
            });

            // Phase 2: Delete all user data in proper order (child tables first)
            await db.transaction(async tx => {
              // Playlist-related tables (child tables first)
              await tx.delete(playlistActivities).where(eq(playlistActivities.userId, userId));
              await tx.delete(playlistFollowers).where(eq(playlistFollowers.userId, userId));
              await tx.delete(playlistLikes).where(eq(playlistLikes.userId, userId));

              // User library favorites, follows, and history
              await tx.delete(trackFeedback).where(eq(trackFeedback.userId, userId));
              await tx.delete(recentlyPlayed).where(eq(recentlyPlayed.userId, userId));
              await tx.delete(favoriteTracks).where(eq(favoriteTracks.userId, userId));
              await tx.delete(favoriteAlbums).where(eq(favoriteAlbums.userId, userId));
              await tx.delete(followedCreators).where(eq(followedCreators.userId, userId));

              // User lyrics
              await tx.delete(lyrics).where(eq(lyrics.userId, userId));

              // User-generated content (unified tables)
              await tx.delete(tracks).where(eq(tracks.userId, userId));
              await tx.delete(albums).where(eq(albums.userId, userId));
              await tx.delete(playlists).where(eq(playlists.userId, userId));

              // Generation tracking (song requests and album requests)
              await tx.delete(songRequests).where(eq(songRequests.userId, userId));
              await tx.delete(albumRequests).where(eq(albumRequests.userId, userId));

              // Analytics and streaming data
              await tx.delete(musicAnalytics).where(eq(musicAnalytics.userId, userId));
              await tx.delete(streamSessions).where(eq(streamSessions.userId, userId));
              await tx.delete(streamAnalytics).where(eq(streamAnalytics.userId, userId));
            });

            logger.info('GDPR: User data deletion completed', {
              userId,
              deletedTracks: tracksToDelete.length,
              assetUrlsForCleanup: audioUrls.length + artworkUrls.length,
            });

            res.json({
              success: true,
              userId,
              deletedAt: new Date().toISOString(),
              assetUrls: {
                audio: audioUrls,
                artwork: artworkUrls,
              },
            });
          } catch (error) {
            logger.error('GDPR: User data deletion failed', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
            ServiceErrors.internal(res, 'Failed to delete user data', undefined, req);
          }
        });

        // GDPR Article 20: User music data export endpoint
        app.get('/api/users/:userId/export', async (req, res) => {
          const { userId } = req.params;

          logger.info('GDPR: User music data export request received', { userId });

          try {
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { eq, count, isNull } = await import('drizzle-orm');
            const {
              playlists,
              favoriteTracks,
              tracks: tracksTable,
              albums: albumsTable,
              lyrics,
              playlistTracks,
            } = await import('./schema/music-schema');

            const db = getDatabase();

            // Query all user music data
            const userPlaylists = await db.select().from(playlists).where(eq(playlists.userId, userId));
            const userFavorites = await db.select().from(favoriteTracks).where(eq(favoriteTracks.userId, userId));
            const userTracks = await db.select().from(tracksTable).where(eq(tracksTable.userId, userId));
            const userAlbums = await db.select().from(albumsTable).where(eq(albumsTable.userId, userId));
            const userLyrics = await db.select().from(lyrics).where(eq(lyrics.userId, userId));

            // Query playlist track counts
            const playlistIds = userPlaylists.map(p => p.id);
            const playlistTrackCounts: Record<string, number> = {};

            if (playlistIds.length > 0) {
              const counts = await db
                .select({
                  playlistId: playlistTracks.playlistId,
                  trackCount: count(),
                })
                .from(playlistTracks)
                .where(isNull(playlistTracks.deletedAt))
                .groupBy(playlistTracks.playlistId);

              counts.forEach(c => {
                playlistTrackCounts[c.playlistId] = c.trackCount;
              });
            }

            logger.info('GDPR: User music data export completed', {
              userId,
              playlistCount: userPlaylists.length,
              favoriteCount: userFavorites.length,
              trackCount: userTracks.length,
              albumCount: userAlbums.length,
              lyricsCount: userLyrics.length,
            });

            res.json({
              success: true,
              musicData: {
                playlists: userPlaylists.map(p => ({
                  id: p.id,
                  name: p.name,
                  description: p.description || undefined,
                  visibility: p.visibility,
                  status: p.status,
                  trackCount: playlistTrackCounts[p.id] || 0,
                  createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : new Date().toISOString(),
                })),
                albums: userAlbums.map(a => ({
                  id: a.id,
                  title: a.title,
                  description: a.description || undefined,
                  visibility: a.visibility,
                  status: a.status,
                  createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date().toISOString(),
                })),
                favorites: userFavorites.map(f => ({
                  trackId: f.trackId,
                  addedAt: f.addedAt || new Date().toISOString(),
                })),
                generatedTracks: userTracks.map(t => ({
                  id: t.id,
                  title: t.title || 'Untitled',
                  createdAt: t.createdAt || new Date().toISOString(),
                })),
                lyrics: userLyrics.map(l => ({
                  id: l.id,
                  content: l.content,
                  language: l.language,
                  title: l.title || undefined,
                  style: l.style || undefined,
                  mood: l.mood || undefined,
                  createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : new Date().toISOString(),
                })),
              },
            });
          } catch (error) {
            logger.error('GDPR: User music data export failed', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
            ServiceErrors.internal(res, 'Failed to export music data', undefined, req);
          }
        });

        // Admin: Orphan scan endpoint (called by user-service for cross-service cleanup)
        app.post('/api/admin/orphan-scan', serviceAuthMiddleware({ required: true }), async (req, res) => {
          const dryRun = req.body.dryRun !== false;
          logger.info('Admin: Orphan scan requested', { dryRun });

          try {
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { sql } = await import('drizzle-orm');
            const db = getDatabase();

            const tablesToCheck = ['mus_playlists', 'mus_favorite_tracks', 'mus_tracks', 'mus_albums'];

            const results: { table: string; orphanedCount: number; cleanedCount: number; errors: string[] }[] = [];

            for (const tableName of tablesToCheck) {
              try {
                const countQuery = sql`
                  SELECT COUNT(*) as orphan_count 
                  FROM ${sql.identifier(tableName)} t
                  WHERE NOT EXISTS (
                    SELECT 1 FROM usr_accounts u WHERE u.id = t.user_id
                  )
                `;
                const countResult = await db.execute(countQuery);
                const resultRow = (countResult.rows?.[0] ?? undefined) as Record<string, unknown> | undefined;
                const orphanCount = parseInt(String(resultRow?.orphan_count ?? '0'), 10);

                let cleanedCount = 0;
                const errors: string[] = [];

                if (orphanCount > 0 && !dryRun) {
                  try {
                    const deleteQuery = sql`
                      DELETE FROM ${sql.identifier(tableName)} t
                      WHERE NOT EXISTS (
                        SELECT 1 FROM usr_accounts u WHERE u.id = t.user_id
                      )
                    `;
                    await db.execute(deleteQuery);
                    cleanedCount = orphanCount;
                  } catch (deleteError) {
                    errors.push(
                      `Delete failed: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`
                    );
                  }
                }

                if (orphanCount > 0) {
                  results.push({
                    table: tableName,
                    orphanedCount: orphanCount,
                    cleanedCount,
                    errors,
                  });
                }
              } catch (tableError) {
                logger.warn(`Failed to scan ${tableName} for orphans`, {
                  error: tableError instanceof Error ? tableError.message : String(tableError),
                });
              }
            }

            res.json({ success: true, dryRun, results });
          } catch (error) {
            logger.error('Orphan scan failed', { error: error instanceof Error ? error.message : String(error) });
            ServiceErrors.internal(res, 'Orphan scan failed', undefined, req);
          }
        });

        // Admin: Cross-reference check endpoint (validates references to user-service)
        app.post('/api/admin/cross-reference-check', serviceAuthMiddleware({ required: true }), async (req, res) => {
          logger.info('Admin: Cross-reference check requested');

          try {
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { isNotNull } = await import('drizzle-orm');
            const { tracks: tracksTable } = await import('./schema/music-schema');
            const db = getDatabase();

            const invalidReferences: Array<{ referenceType: string; referenceId: string; error: string }> = [];

            const tracksWithLyrics = await db
              .select({ id: tracksTable.id, lyricsId: tracksTable.lyricsId })
              .from(tracksTable)
              .where(isNotNull(tracksTable.lyricsId))
              .limit(500);

            if (tracksWithLyrics.length > 0) {
              const lyricsIds = tracksWithLyrics.map(t => t.lyricsId).filter(Boolean) as string[];

              try {
                const { signUserIdHeader, createServiceHttpClient } = await import('@aiponge/platform-core');
                const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
                const internalClient = createServiceHttpClient('internal');
                const response = await internalClient.postWithResponse<{
                  results?: Array<{ exists: boolean; referenceId: string }>;
                }>(
                  `${userServiceUrl}/admin/verify-references/batch`,
                  { references: lyricsIds.map(id => ({ referenceType: 'lyrics', referenceId: id })) },
                  { headers: { ...signUserIdHeader('system') }, timeout: 30000 }
                );

                if (response.ok) {
                  for (const result of response.data.results || []) {
                    if (!result.exists) {
                      invalidReferences.push({
                        referenceType: 'lyrics',
                        referenceId: result.referenceId,
                        error: 'Lyrics reference does not exist in user-service',
                      });
                    }
                  }
                }
              } catch (error) {
                logger.warn('Failed to validate lyrics references with user-service', {
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }

            res.json({
              success: true,
              valid: invalidReferences.length === 0,
              invalidReferences,
              checkedCounts: {
                lyricsReferences: tracksWithLyrics.length,
              },
            });
          } catch (error) {
            logger.error('Cross-reference check failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            ServiceErrors.internal(res, 'Cross-reference check failed', undefined, req);
          }
        });

        // Admin: Verify reference endpoint (for cross-service validation)
        app.post('/api/admin/verify-reference', serviceAuthMiddleware({ required: true }), async (req, res) => {
          const { referenceType, referenceId } = req.body;

          if (!referenceType || !referenceId) {
            ServiceErrors.badRequest(res, 'Missing referenceType or referenceId', req, { valid: false, exists: false });
            return;
          }

          try {
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { eq } = await import('drizzle-orm');
            const db = getDatabase();

            let exists = false;

            switch (referenceType) {
              case 'track': {
                const { tracks: tracksTable } = await import('./schema/music-schema');
                const [track] = await db
                  .select({ id: tracksTable.id })
                  .from(tracksTable)
                  .where(eq(tracksTable.id, referenceId))
                  .limit(1);
                exists = !!track;
                break;
              }
              case 'playlist': {
                const { playlists } = await import('./schema/music-schema');
                const [playlist] = await db
                  .select({ id: playlists.id })
                  .from(playlists)
                  .where(eq(playlists.id, referenceId))
                  .limit(1);
                exists = !!playlist;
                break;
              }
              case 'album': {
                const { albums: albumsTable } = await import('./schema/music-schema');
                const [album] = await db
                  .select({ id: albumsTable.id })
                  .from(albumsTable)
                  .where(eq(albumsTable.id, referenceId))
                  .limit(1);
                exists = !!album;
                break;
              }
              default:
                ServiceErrors.badRequest(res, `Unknown reference type: ${referenceType}`, req, {
                  valid: false,
                  exists: false,
                  referenceType,
                  referenceId,
                });
                return;
            }

            res.json({ valid: exists, exists, referenceType, referenceId });
          } catch (error) {
            ServiceErrors.internal(res, 'Validation failed', error, req);
          }
        });

        // Admin: Verify user deleted endpoint
        app.get(
          '/api/admin/verify-user-deleted/:userId',
          serviceAuthMiddleware({ required: true }),
          async (req, res) => {
            const userId = req.params.userId as string;

            try {
              const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
              const { eq } = await import('drizzle-orm');
              const { playlists, tracks: tracksTable } = await import('./schema/music-schema');
              const db = getDatabase();

              const tablesWithData: string[] = [];

              const playlistCount = await db.select().from(playlists).where(eq(playlists.userId, userId)).limit(1);
              if (playlistCount.length > 0) tablesWithData.push('mus_playlists');

              const trackCount = await db.select().from(tracksTable).where(eq(tracksTable.userId, userId)).limit(1);
              if (trackCount.length > 0) tablesWithData.push('mus_tracks');

              res.json({ success: true, userId, tablesWithData, fullyDeleted: tablesWithData.length === 0 });
            } catch (error) {
              ServiceErrors.internal(res, 'Verification failed', error, req);
            }
          }
        );

        logger.debug('🔍 All routes initialized');
        setupSentryErrorHandler(app as Express);
      },
      afterStart: async () => {
        contractRegistry.register({ name: 'music-service-api', version: CURRENT_CONTRACT_VERSION, deprecated: false });
        logger.debug('📍 Music service ready');
        registerShutdownHook(async () => {
          try {
            const { QueueManager } = await import('@aiponge/platform-core');
            if (QueueManager.isInitialized()) {
              await QueueManager.shutdown();
              logger.info('Generation queue shut down');
            }
          } catch (queueErr) {
            logger.warn('Failed to shut down generation queue', { error: queueErr });
          }
          const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
          await DatabaseConnectionFactory.close();
        });

        // Run stale request cleanup and database integrity check on startup
        try {
          const { runStartupCleanup } = await import('./application/services/StaleRequestCleanupService');
          const cleanupResult = await runStartupCleanup();

          const totalCleaned =
            cleanupResult.staleAlbumRequests + cleanupResult.staleSongRequests + cleanupResult.staleLibraryTracks;

          if (totalCleaned > 0) {
            logger.info('🧹 Cleaned up stale generation records', {
              staleAlbumRequests: cleanupResult.staleAlbumRequests,
              staleSongRequests: cleanupResult.staleSongRequests,
              staleLibraryTracks: cleanupResult.staleLibraryTracks,
            });
          }

          if (cleanupResult.errors.length > 0) {
            logger.warn('⚠️ Cleanup completed with warnings', {
              errors: cleanupResult.errors,
            });
          }
        } catch (cleanupError) {
          logger.warn('Startup cleanup failed (non-critical)', {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      },
    });

    setupGracefulShutdown(bootstrap.getServer());

    logger.info('🎉 Music Service started successfully!', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'running',
    });

    // Start event subscribers (fire-and-forget, non-blocking)
    startStorageEventSubscriber().catch(err => {
      logger.warn('Failed to start storage event subscriber (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Initialize async generation queue (WS1 - feature-flagged)
    try {
      const queueInitialized = initializeGenerationQueue();
      if (queueInitialized) {
        logger.info('Async music generation queue initialized');
      }
    } catch (err) {
      logger.warn('Failed to initialize generation queue (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (error) {
    const { correlationId } = logAndTrackError(
      error,
      'Music Service startup failed',
      {
        service: SERVICE_NAME,
        phase: 'startup_failure',
        port: PORT,
      },
      'MUSIC_SERVICE_STARTUP_FAILURE',
      500
    );

    logger.error('💥 Startup failed', {
      service: SERVICE_NAME,
      correlationId,
      exitCode: 1,
    });

    process.exit(1);
  }
}

// Start
main().catch(error => {
  const { correlationId } = logAndTrackError(
    error,
    'Unhandled error during Music Service startup',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_error',
      port: PORT,
    },
    'MUSIC_SERVICE_UNHANDLED_ERROR',
    500
  );

  logger.error('💥 Catastrophic failure', {
    service: SERVICE_NAME,
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
