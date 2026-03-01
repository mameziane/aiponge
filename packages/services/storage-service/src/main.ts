// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

import { findWorkspaceRoot } from '@aiponge/platform-core';
const WORKSPACE_ROOT = findWorkspaceRoot();

// FINAL FIX: Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(15);

/**
 * Storage Service - Refactored with Local Platform Pattern
 * Microservice bootstrap and startup logic
 */

import {
  createLogger,
  createOrchestrationBootstrap,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
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
  DomainError,
  extractAuthContext,
} from '@aiponge/platform-core';

initSentry('storage-service');
failFastValidation('storage-service');
import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';
import express, { Express, Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { StorageService } from './application/services/StorageService';
import { DrizzleStorageRepository } from './infrastructure/repositories/DrizzleStorageRepository';
import {
  StorageProviderFactory,
  StorageConfiguration,
  StorageProviderType,
} from './infrastructure/providers/StorageProviderFactory';
import { createDrizzleRepository, getDbFactory } from './infrastructure/database/DatabaseConnectionFactory';
import {
  UploadFileUseCase,
  DownloadFileUseCase,
  ListFilesUseCase,
  FileSearchUseCase,
  FileAnalyticsUseCase,
} from './application/use-cases';
import { ServiceErrors } from './presentation/utils/response-helpers';
import { eq } from 'drizzle-orm';
// Use existing platform logging - correlation ID support already exists

// Initialize ServiceLocator to load ports from services.config.ts
ServiceLocator.initialize();

// Configuration
const SERVICE_NAME = 'storage-service';
const defaultPort = ServiceLocator.getServicePort('storage-service');
const PORT = Number(process.env.PORT || process.env.STORAGE_SERVICE_PORT || defaultPort);

// Initialize structured logger
const logger = createLogger(SERVICE_NAME);

/**
 * Create storage routes
 */
// Configure multer for multipart file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'audio/mp3',
      'audio/wav',
      'audio/mpeg',
      'application/pdf',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

function createStorageRoutes(
  uploadUseCase: UploadFileUseCase,
  downloadUseCase: DownloadFileUseCase,
  listUseCase: ListFilesUseCase,
  searchUseCase: FileSearchUseCase,
  analyticsUseCase: FileAnalyticsUseCase,
  storageService: StorageService
): express.Router {
  const router = express.Router();

  // Upload file endpoint - supports both multipart/form-data and JSON base64
  router.post('/api/storage/upload', upload.single('file'), async (req, res) => {
    try {
      const { userId: headerUserId } = extractAuthContext(req);
      const userId = headerUserId || req.body.userId;

      let fileBuffer: Buffer;
      let originalName: string;
      let contentType: string;

      // Check if it's a multipart upload (from mobile app)
      if (req.file) {
        fileBuffer = req.file.buffer;
        originalName = req.file.originalname;
        contentType = req.file.mimetype;
        logger.debug('Multipart file upload received', {
          originalName,
          contentType,
          size: fileBuffer.length,
          userId,
          category: req.body.category,
        });
      }
      // Fallback to JSON base64 upload
      else if (req.body.file && req.body.originalName) {
        fileBuffer = Buffer.from(req.body.file, 'base64');
        originalName = req.body.originalName;
        contentType = req.body.contentType || 'application/octet-stream';
        logger.debug('Base64 file upload received', { originalName, contentType, userId });
      } else {
        ServiceErrors.badRequest(
          res,
          'No file provided. Use multipart/form-data with "file" field or JSON with base64 "file" and "originalName"',
          req,
          { code: 'NO_FILE' }
        );
        return;
      }

      // Parse tags if provided as JSON string
      let tags: string[] = [];
      if (req.body.tags) {
        try {
          tags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
        } catch {
          tags = [];
        }
      }

      const result = await uploadUseCase.execute({
        file: fileBuffer,
        originalName,
        contentType,
        userId: userId,
        isPublic: req.body.isPublic === 'true' || req.body.isPublic === true,
        tags,
        expiresIn: req.body.expiresIn ? parseInt(req.body.expiresIn) : undefined,
        category: req.body.category || undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          fileId: result.fileId,
          url: result.publicUrl,
          originalName,
          storageLocation: result.storageLocation,
        },
      });
    } catch (error) {
      logger.error('Upload failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Upload failed', req);
      return;
    }
  });

  // Download external file endpoint
  router.post('/api/storage/download-external', async (req, res) => {
    try {
      const { taskId, externalUrl, metadata, destinationPath } = req.body;

      if (!taskId || !externalUrl) {
        ServiceErrors.badRequest(res, 'taskId and externalUrl are required', req);
        return;
      }

      const result = await storageService.downloadExternalFile({
        taskId,
        externalUrl,
        metadata,
        destinationPath,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Download external file failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Download external file failed', req);
      return;
    }
  });

  // Download file endpoint with conditional GET support
  router.get('/api/storage/download/:fileId', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);

      const result = await downloadUseCase.execute({
        fileId: req.params.fileId,
        userId,
      });

      // ⚡ SECURITY + PERFORMANCE: Cache headers based on file visibility
      // 🔒 Private files: Use 'private' cache control to prevent CDN leaks
      // 🌐 Public files: Use 'public' for CDN caching = 90% bandwidth reduction
      const isImage = result.contentType?.startsWith('image/');
      const isAudio = result.contentType?.startsWith('audio/');

      let maxAge = 86400; // Default: 1 day for other files
      if (isImage) {
        maxAge = 31536000; // 1 year for images (artwork rarely changes)
      } else if (isAudio) {
        maxAge = 2592000; // 30 days for music files
      }

      // Compute ETag for cache validation
      const etag = result.checksum || req.params.fileId;

      // 🔒 CRITICAL: Use 'private' for user-specific files, 'public' only for truly public files
      // This prevents CDN from serving private files to unauthorized users
      const cacheVisibility = result.isPublic ? 'public' : 'private';
      const cacheControl = `${cacheVisibility}, max-age=${maxAge}`;

      // ⚡ CONDITIONAL GET: Handle If-None-Match / If-Modified-Since for 304 responses
      // Only check conditional requests for public files (private files don't benefit from CDN caching)
      if (result.isPublic) {
        const clientETag = req.headers['if-none-match'];
        const clientModifiedSince = req.headers['if-modified-since'];

        let notModified = false;

        // Check ETag match (preferred method)
        if (clientETag && etag) {
          const cleanClientETag = clientETag.replace(/^"|"$/g, ''); // Remove quotes
          const cleanServerETag = etag.replace(/^"|"$/g, '');
          notModified = cleanClientETag === cleanServerETag;
        }

        // Check Last-Modified if ETag didn't match and we have modification time
        if (!notModified && clientModifiedSince && result.lastModified) {
          const clientDate = new Date(clientModifiedSince);
          const serverDate = result.lastModified;
          // File not modified if server time <= client time (truncate to seconds)
          notModified = Math.floor(serverDate.getTime() / 1000) <= Math.floor(clientDate.getTime() / 1000);
        }

        // Return 304 Not Modified if client has valid cached version
        if (notModified) {
          res.status(304); // Not Modified
          res.setHeader('Cache-Control', cacheControl);
          if (etag) res.setHeader('ETag', `"${etag}"`);
          if (result.lastModified) res.setHeader('Last-Modified', result.lastModified.toUTCString());
          res.end();
          return;
        }
      }

      // Send full response with cache headers
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.originalName}"`);
      res.setHeader('Content-Length', result.size.toString());
      res.setHeader('Cache-Control', cacheControl);

      // Add Vary header for private files to prevent cache confusion
      if (!result.isPublic) {
        res.setHeader('Vary', 'X-User-Id');
      }

      if (etag) {
        res.setHeader('ETag', `"${etag}"`);
      }

      if (result.lastModified) {
        res.setHeader('Last-Modified', result.lastModified.toUTCString());
      }

      res.send(result.data);
    } catch (error) {
      logger.error('Download failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Download failed', req);
      return;
    }
  });

  // List files endpoint
  router.get('/api/storage/files', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);

      const result = await listUseCase.execute({
        userId,
        contentType: req.query.contentType as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        ownedOnly: req.query.ownedOnly === 'true',
      });

      res.json({
        success: true,
        files: result.files,
        total: result.total,
        hasMore: result.hasMore,
      });
    } catch (error) {
      logger.error('File listing failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'File listing failed', req);
      return;
    }
  });

  // Search files endpoint
  router.get('/api/storage/search', async (req, res) => {
    try {
      res.json({
        message: 'File search functionality',
        service: SERVICE_NAME,
        endpoint: 'GET /api/storage/search',
        query: req.query.q || '',
        results: [],
        status: 'ready',
      });
    } catch (error) {
      logger.error('Search failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Search failed', req);
      return;
    }
  });

  // Analytics endpoint
  router.get('/api/storage/analytics', async (req, res) => {
    try {
      res.json({
        message: 'Storage analytics functionality',
        service: SERVICE_NAME,
        endpoint: 'GET /api/storage/analytics',
        analytics: {
          totalFiles: 0,
          totalSize: 0,
          storageUsage: '0%',
        },
        status: 'ready',
      });
    } catch (error) {
      logger.error('Analytics failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Analytics failed', req);
      return;
    }
  });

  // GDPR Article 20: User data export endpoint
  router.get('/api/users/:userId/export', async (req, res) => {
    const { userId } = req.params;

    logger.info('GDPR: User data export request received', { userId });

    try {
      // Import the files table schema
      const { files: filesTable } = await import('./schema/storage-schema');
      const db = getDbFactory().getDatabase();

      // Query all files for this user
      const userFiles = await db
        .select({
          id: filesTable.id,
          originalName: filesTable.originalName,
          contentType: filesTable.contentType,
          fileSize: filesTable.fileSize,
          publicUrl: filesTable.publicUrl,
          category: filesTable.category,
          status: filesTable.status,
          createdAt: filesTable.createdAt,
          deletedAt: filesTable.deletedAt,
        })
        .from(filesTable)
        .where(eq(filesTable.userId, userId));

      logger.info('GDPR: User data export completed', {
        userId,
        fileCount: userFiles.length,
      });

      res.json({
        success: true,
        files: {
          metadata: userFiles,
        },
      });
    } catch (error) {
      logger.error('GDPR: User data export failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      ServiceErrors.fromException(res, error, 'User data export failed', req);
      return;
    }
  });

  // GDPR Article 17: User files deletion endpoint
  router.delete('/api/users/:userId/files', async (req, res) => {
    const { userId } = req.params;
    const { userId: requestedBy } = extractAuthContext(req);
    const { additionalAssetUrls = [] } = req.body || {};

    logger.info('GDPR: User files deletion request received', {
      userId,
      requestedBy,
      additionalAssetUrlCount: additionalAssetUrls?.length || 0,
    });

    try {
      // Step 1: Delete user-owned files tracked in database
      const files = await listUseCase.execute({
        userId,
        ownedOnly: true,
        limit: 1000,
        offset: 0,
      });

      const deleteResults = await Promise.allSettled(
        files.files.map(file => storageService.deleteFile({ fileId: file.id, userId }))
      );
      const deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
      for (const result of deleteResults) {
        if (result.status === 'rejected') {
          logger.warn('Failed to delete file', {
            userId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }

      // Step 2: Delete additional asset files by URL (e.g., music artwork, library covers)
      let additionalDeletedCount = 0;
      if (Array.isArray(additionalAssetUrls) && additionalAssetUrls.length > 0) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const uploadsRoot = path.resolve(WORKSPACE_ROOT, 'uploads');

        const validPaths: string[] = [];
        for (const assetUrl of additionalAssetUrls) {
          if (typeof assetUrl !== 'string' || !assetUrl) continue;

          if (path.isAbsolute(assetUrl)) {
            logger.warn('GDPR delete: rejected absolute path', { assetUrl, userId });
            continue;
          }

          let filePath: string;
          if (assetUrl.startsWith('/uploads/')) {
            filePath = path.join(WORKSPACE_ROOT, assetUrl.substring(1));
          } else if (assetUrl.startsWith('uploads/')) {
            filePath = path.join(WORKSPACE_ROOT, assetUrl);
          } else {
            filePath = path.join(WORKSPACE_ROOT, 'uploads', assetUrl);
          }

          const resolvedPath = path.resolve(filePath);
          if (!resolvedPath.startsWith(uploadsRoot + path.sep) && resolvedPath !== uploadsRoot) {
            logger.warn('GDPR delete: path traversal attempt blocked', {
              assetUrl,
              resolvedPath,
              uploadsRoot,
              userId,
            });
            continue;
          }

          validPaths.push(resolvedPath);
        }

        const assetResults = await Promise.allSettled(validPaths.map(resolvedPath => fs.unlink(resolvedPath)));
        for (const result of assetResults) {
          if (result.status === 'fulfilled') {
            additionalDeletedCount++;
          } else if ((result.reason as { code?: string })?.code !== 'ENOENT') {
            logger.warn('Failed to delete additional asset file', {
              userId,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }
      }

      logger.info('GDPR: User files deletion completed', {
        userId,
        deletedCount,
        totalFiles: files.total,
        additionalDeletedCount,
        additionalAssetUrlsRequested: additionalAssetUrls?.length || 0,
      });
      res.json({
        success: true,
        userId,
        deletedCount,
        additionalDeletedCount,
        deletedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('GDPR: User files deletion failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      ServiceErrors.internal(res, 'Failed to delete user files', undefined, req);
    }
  });

  return router;
}

/**
 * Start the Storage Service using shared bootstrap pattern
 */
async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting Storage Service...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Initialize ServiceLocator for this service
    ServiceLocator.initialize();

    // Create health manager for service monitoring
    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    // Create enhanced orchestration-aware bootstrap
    const bootstrap = createOrchestrationBootstrap(SERVICE_NAME, PORT, {
      registration: {
        capabilities: [
          'file-upload',
          'file-download',
          'file-management',
          'file-search',
          'file-analytics',
          'background-processing',
          'storage-abstraction',
        ],
        features: {
          upload: 'Secure file upload with validation',
          download: 'File download and streaming',
          management: 'File organization and metadata management',
          search: 'Advanced file search capabilities',
          analytics: 'File usage and storage analytics',
          backgroundProcessing: 'Asynchronous file processing',
          storageProviders: 'Multiple storage provider support',
        },
        endpoints: {
          upload: '/api/storage/upload',
          download: '/api/storage/download',
          files: '/api/storage/files',
          search: '/api/storage/search',
          analytics: '/api/storage/analytics',
        },
      },
      middleware: {
        cors: true,
        helmet: false, // Disabled - using custom helmet with media-src CSP below
        compression: true,
        requestLogger: true,
      },
    });

    // Initialize storage dependencies with cleanup tracking
    // Use Neon HTTP for persistent file tracking (populates stg_files table)
    const dbFactory = getDbFactory();

    // Test database connection
    try {
      const healthResult = await dbFactory.healthCheck();
      if (healthResult.status === 'healthy') {
        logger.info('✅ Neon HTTP database connection established for storage-service', {
          latencyMs: healthResult.latencyMs,
          driver: healthResult.driver,
        });
      } else {
        throw new DomainError('Database health check failed', 503);
      }
    } catch (dbError) {
      logger.error('❌ Failed to connect to database', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      throw dbError;
    }

    // Initialize audit service with shared persister for cross-service audit logging
    {
      const db = getDbFactory().getDatabase();
      initAuditService(new SimpleAuditPersister(db));
      logger.debug('Audit service initialized with SimpleAuditPersister');
    }

    // Create repository using DI factory pattern
    const repository = createDrizzleRepository(DrizzleStorageRepository);
    const uploadsBasePath = resolve(WORKSPACE_ROOT, 'uploads');
    const storageProvider = (process.env.STORAGE_PROVIDER || 'local') as StorageProviderType;

    const storageConfig: StorageConfiguration = {
      provider: storageProvider,
      basePath: uploadsBasePath,
      baseUrl: process.env.STORAGE_BASE_URL || '',
    };

    if (storageProvider === 's3') {
      // Support both Railway Storage Bucket env vars and standard AWS env vars
      // Railway provides: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, ENDPOINT
      // AWS provides: AWS_S3_BUCKET, AWS_S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
      storageConfig.s3 = {
        bucket: process.env.BUCKET || process.env.AWS_S3_BUCKET || '',
        region: process.env.REGION || process.env.AWS_S3_REGION || '',
        accessKeyId: process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
        endpoint: process.env.ENDPOINT || process.env.AWS_S3_ENDPOINT || undefined,
      };
    } else if (storageProvider === 'gcs') {
      storageConfig.gcs = {
        projectId: process.env.GCS_PROJECT_ID || '',
        bucketName: process.env.GCS_BUCKET_NAME || '',
      };
    } else if (storageProvider === 'cloudinary') {
      storageConfig.cloudinary = {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      };
    } else if (storageProvider === 'cdn') {
      storageConfig.cdn = {
        cdnDomain: process.env.CDN_DOMAIN || '',
        origin: process.env.CDN_ORIGIN || '',
      };
    }

    const storageProviderFactory = StorageProviderFactory.getInstance();
    // IMPORTANT: Update default config explicitly because the singleton may have been
    // created at module-import time with 'local' defaults before env vars were read
    storageProviderFactory.updateDefaultConfig(storageConfig);
    const provider = await storageProviderFactory.createAndInitializeProvider();

    logger.info('Storage provider initialized', {
      service: SERVICE_NAME,
      provider: storageProvider,
      hasEndpoint: !!storageConfig.s3?.endpoint,
      phase: 'initialization',
    });

    const storageService = new StorageService(provider, repository, undefined, undefined);

    const uploadUseCase = new UploadFileUseCase(provider, repository);
    const downloadUseCase = new DownloadFileUseCase(provider, repository);
    const listUseCase = new ListFilesUseCase(repository);
    const searchUseCase = new FileSearchUseCase(repository, provider);
    const analyticsUseCase = new FileAnalyticsUseCase(repository);

    // Mount storage routes
    const storageRouter = createStorageRoutes(
      uploadUseCase,
      downloadUseCase,
      listUseCase,
      searchUseCase,
      analyticsUseCase,
      storageService
    );

    // Status endpoint
    const statusRouter = express.Router();
    statusRouter.get('/api/storage/status', (req, res) => {
      res.json({
        service: SERVICE_NAME,
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        description: 'Storage Service with file management, upload, download, and analytics',
        storageProvider: 'local',
        endpoints: {
          upload: '/api/storage/upload',
          download: '/api/storage/download',
          files: '/api/storage/files',
          search: '/api/storage/search',
          analytics: '/api/storage/analytics',
        },
      });
    });

    // Schema validation in development mode
    if (process.env.NODE_ENV === 'development') {
      const schema = await import('./schema/storage-schema');
      const validationResult = await validateSchema({
        serviceName: SERVICE_NAME,
        schema,
        sql: getDbFactory().getSQLConnection(),
        failOnMismatch: false,
      });
      if (!validationResult.success) {
        logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
      }
    }

    // Start the service with enhanced orchestration support
    await bootstrap.start({
      healthManager,
      customMiddleware: (bootstrapApp: Express) => {
        if (isSentryInitialized()) {
          bootstrapApp.use(createSentryCorrelationMiddleware());
        }
        // Override helmet with proper CSP for media files
        bootstrapApp.use(
          helmet({
            contentSecurityPolicy: {
              directives: {
                defaultSrc: ["'self'"],
                mediaSrc: ["'self'", 'blob:', 'data:', 'https:'], // Allow audio/video
                imgSrc: ["'self'", 'blob:', 'data:', 'https:'], // Allow images
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", 'https:'],
                fontSrc: ["'self'", 'https:', 'data:'],
                connectSrc: ["'self'"],
              },
            },
            // CRITICAL: Allow cross-origin resource access for proxied media files
            crossOriginResourcePolicy: { policy: 'cross-origin' },
          })
        );
        logger.debug('🔒 Custom helmet CSP + CORP configured for media files');
      },
      customRoutes: (bootstrapApp: Express) => {
        const uploadsDir = resolve(WORKSPACE_ROOT, 'uploads');

        /** Set cache and CORS headers for media files */
        function setMediaHeaders(res: Response, filePath: string): void {
          const isAudio = /\.(mp3|wav|ogg|m4a)$/.test(filePath);
          const isImage = /\.(png|jpg|jpeg|webp|gif)$/.test(filePath);

          // Set Content-Type for audio files
          const audioTypes: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
          };
          for (const [ext, type] of Object.entries(audioTypes)) {
            if (filePath.endsWith(ext)) res.setHeader('Content-Type', type);
          }

          let maxAge = 86400; // 1 day default
          if (isImage)
            maxAge = 31536000; // 1 year for artwork
          else if (isAudio) maxAge = 2592000; // 30 days for music

          res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range');
        }

        if (storageProvider === 's3') {
          // S3 proxy: fetch files from S3 bucket and serve them
          // Railway/Tigris buckets are private, so we proxy through the backend
          bootstrapApp.get('/uploads/*', async (req, res) => {
            try {
              const s3Key = req.path.replace(/^\/uploads\//, '');
              if (!s3Key || s3Key.includes('..')) {
                res.status(400).json({ error: 'Invalid path' });
                return;
              }

              const result = await provider.download(s3Key);
              if (!result.success || !result.data) {
                res.status(404).json({ error: 'File not found' });
                return;
              }

              // Set media headers
              setMediaHeaders(res, s3Key);
              if (result.contentType) {
                res.setHeader('Content-Type', result.contentType);
              }
              if (result.size) {
                res.setHeader('Content-Length', result.size.toString());
              }

              res.send(result.data);
            } catch (error) {
              logger.error('S3 proxy download failed', {
                path: req.path,
                error: error instanceof Error ? error.message : String(error),
              });
              res.status(500).json({ error: 'File download failed' });
            }
          });
          logger.info('📁 S3 proxy configured for /uploads/* routes');
        } else {
          // Local filesystem: serve static files directly
          bootstrapApp.use(
            '/uploads',
            express.static(uploadsDir, {
              etag: true,
              lastModified: true,
              setHeaders: (staticRes: Response, filePath: string) => {
                setMediaHeaders(staticRes, filePath);
              },
            })
          );
          logger.info('📁 Serving uploads from local filesystem', { uploadsDir });
        }

        // Register all routes
        bootstrapApp.use('/', storageRouter);
        bootstrapApp.use('/', statusRouter);
        setupSentryErrorHandler(bootstrapApp);
      },
      beforeStart: async () => {
        logger.debug('📁 Initializing storage service dependencies...');
        // Any pre-startup dependencies can be initialized here
      },
      afterStart: async () => {
        contractRegistry.register({
          name: 'storage-service-api',
          version: CURRENT_CONTRACT_VERSION,
          deprecated: false,
        });
      },
    });

    setupGracefulShutdown(bootstrap.getServer());
    registerShutdownHook(async () => {
      logger.info('🔌 Closing database connections...');
      const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
      await DatabaseConnectionFactory.close();
      logger.info('✅ Database connections closed successfully');
    });

    logger.info('🎉 Storage Service started successfully!', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'running',
      orchestrationEnabled: true,
    });
  } catch (error) {
    logger.error('❌ Failed to start Storage Service', {
      service: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      phase: 'startup-failed',
    });

    process.exit(1);
  }
}

/**
 * Global error handlers for production reliability
 */
// ✅ Global error handlers now managed centrally by platform-core bootstrap
// No need for individual service error handler registration

// Error handlers now managed by platform-core bootstrap

// Start the service
main().catch(error => {
  const { error: _wrappedError, correlationId } = logAndTrackError(
    error,
    'Unhandled error during Storage service startup - file storage system failure',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_startup_error',
      context: 'top_level_promise_rejection',
      port: PORT,
    },
    'STORAGE_SERVICE_UNHANDLED_STARTUP_ERROR',
    500 // Critical - storage infrastructure failure
  );

  logger.error('💥 Storage service catastrophic failure - file storage unavailable', {
    service: SERVICE_NAME,
    phase: 'catastrophic_failure_exit',
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
