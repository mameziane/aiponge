/**
 * Storage Routes
 * HTTP route definitions for storage service
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { StorageController } from '../controllers/StorageController';
import { ServiceErrors } from '../utils/response-helpers';
import { createLogger, serializeError } from '@aiponge/platform-core';
import { sendStructuredError, createStructuredError } from '@aiponge/shared-contracts';

const logger = createLogger('storage-routes');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/avi',
      'audio/mp3',
      'audio/wav',
      'application/pdf',
      'text/plain',
      'application/json',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

// Rate limiting
const uploadLimit = rateLimit({
  windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW || '900000'),
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '10'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many upload requests, please try again later',
    },
  },
});

const generalLimit = rateLimit({
  windowMs: parseInt(process.env.GENERAL_RATE_LIMIT_WINDOW || '900000'),
  max: parseInt(process.env.GENERAL_RATE_LIMIT_MAX || '100'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});

export function createStorageRoutes(controller: StorageController): Router {
  // TypeScript optimized
  const router = Router();

  // Apply general rate limiting to all routes
  router.use(generalLimit);

  // File upload
  router.post('/upload', uploadLimit, upload.single('file'), controller.uploadFile);

  // File download
  router.get('/download/:fileId', controller.downloadFile);
  router.get(
    '/download/path/*',
    (req, res, next) => {
      req.params.filePath = req.params[0];
      next();
    },
    controller.downloadFile
  );

  // File management
  router.delete('/files/:fileId', controller.deleteFile);
  router.get('/files', controller.listFiles);
  router.get('/files/:fileId/metadata', controller.getFileMetadata);

  // External file download
  router.post('/download-external', controller.downloadExternalFile);

  // Signed URLs
  router.post('/files/:fileId/signed-url', controller.generateSignedUrl);

  // Health and stats
  router.get('/health', controller.healthCheck);

  // Admin operations
  router.post('/admin/cleanup-expired', controller.cleanupExpiredFiles);

  // Orphan file management
  router.post('/files/mark-orphaned', controller.markFileAsOrphaned);
  router.post('/files/mark-orphaned-batch', controller.markFilesAsOrphanedBatch);

  // Unreferenced file detection
  router.post('/admin/detect-unreferenced', controller.detectUnreferencedFiles);
  router.get('/admin/file-reference-stats', controller.getFileReferenceStats);
  router.get('/admin/orphaned-stats', controller.getOrphanedFilesStats);

  // Error handling middleware
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        sendStructuredError(
          res,
          413,
          createStructuredError('PAYLOAD_TOO_LARGE', 'ValidationError', 'File size exceeds the maximum limit', {
            details: { code: 'FILE_TOO_LARGE' },
          })
        );
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        sendStructuredError(
          res,
          400,
          createStructuredError('VALIDATION_ERROR', 'ValidationError', 'Only one file can be uploaded at a time', {
            details: { code: 'TOO_MANY_FILES' },
          })
        );
        return;
      }
    }

    if (error instanceof Error && error.message === 'File type not allowed') {
      sendStructuredError(
        res,
        400,
        createStructuredError('VALIDATION_ERROR', 'ValidationError', 'File type not allowed', {
          details: { code: 'INVALID_FILE_TYPE' },
        })
      );
      return;
    }

    logger.error('An unexpected error occurred', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'An unexpected error occurred', req);
    return;
  });

  return router;
}
