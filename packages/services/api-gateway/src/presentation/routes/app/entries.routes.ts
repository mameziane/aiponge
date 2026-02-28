/**
 * Entries Routes
 * CRUD operations for book entries with validation and ownership verification
 * The API endpoints and response payloads use "entries" terminology throughout.
 */

import { Router } from 'express';
import { ServiceLocator, createLogger, extractAuthContext, getValidation } from '@aiponge/platform-core';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
const { validateBody, validateQuery } = getValidation();
import {
  CreateEntrySchema,
  UpdateEntrySchema,
  BatchAnalyzeSchema,
  PaginationSchema,
  AddEntryImageSchema,
  ReorderEntryImagesSchema,
} from '@aiponge/shared-contracts';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { safetyScreeningMiddleware } from '../../middleware/SafetyScreeningMiddleware';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const entrySafetyMiddleware = safetyScreeningMiddleware({
  blockOnCrisis: false,
  requireAcknowledgmentOnHigh: false,
});

const logger = createLogger('entries-routes');
const router: Router = Router();

// Type definitions for service responses
interface ServiceErrorDetails {
  message?: string;
  type?: string;
  code?: string;
  details?: Record<string, unknown>;
  originalError?: string;
  service?: string;
}

interface ServiceErrorResponse {
  success?: boolean;
  message?: string;
  error?: string | ServiceErrorDetails;
  timestamp?: string;
}

interface EntryEntity {
  id: string;
  userId: string;
  content: string;
  type?: string;
  moodContext?: string;
  chapterId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface EntriesListResponse {
  success?: boolean;
  data?: {
    entries?: EntryEntity[];
    pagination?: { total?: number; hasMore?: boolean };
    analytics?: Record<string, unknown>;
  };
}

interface EntryDetailResponse {
  success?: boolean;
  data?: {
    entry?: EntryEntity;
    illustrations?: unknown[];
  };
}

/**
 * Extract complete error information from service responses
 * Supports the new structured error format with full details propagation
 */
function extractErrorDetails(
  errorData: ServiceErrorResponse | null | undefined,
  fallback: string
): {
  message: string;
  code?: string;
  type?: string;
  details?: Record<string, unknown>;
  service?: string;
} {
  if (!errorData) return { message: fallback };

  // New structured error format: { success: false, error: { message, code, type, details } }
  if (errorData.error && typeof errorData.error === 'object') {
    const errorObj = errorData.error;
    return {
      message: errorObj.message || fallback,
      code: errorObj.code,
      type: errorObj.type,
      details: {
        ...errorObj.details,
        ...(errorObj.originalError && { originalError: errorObj.originalError }),
      },
      service: errorObj.service,
    };
  }

  if (typeof errorData.message === 'string' && errorData.message.trim()) {
    return { message: errorData.message };
  }

  if (typeof errorData.error === 'string' && errorData.error.trim()) {
    return { message: errorData.error };
  }

  return { message: fallback };
}

/**
 * Extract error message from various backend error formats
 */
function extractErrorMessage(errorData: ServiceErrorResponse | null | undefined, fallback: string): string {
  return extractErrorDetails(errorData, fallback).message;
}

// ================================================
// ENTRIES API - Database-backed with validation
// ================================================

/**
 * GET /api/app/entries
 * Get user's entries with pagination
 * Query params: limit (default: 50), offset (default: 0)
 * Automatically uses authenticated userId from x-user-id header
 */
router.get(
  '/',
  injectAuthenticatedUserId,
  validateQuery(PaginationSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const bookId = req.query.bookId as string | undefined;

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const queryParams = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (bookId) {
      queryParams.append('bookId', bookId);
    }
    const response = await gatewayFetch(`${userServiceUrl}/api/entries/${userId}?${queryParams.toString()}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRIES LIST]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch entries',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as EntriesListResponse;
    const entries = data.data?.entries || [];
    const total = data.data?.pagination?.total || entries.length;
    const hasMore = data.data?.pagination?.hasMore ?? false;

    sendSuccess(res, {
        entries,
        total,
        limit,
        offset,
        hasMore,
      });
  })
);

/**
 * GET /api/app/entries/:entryId
 * Get a single entry by ID
 * Validates user owns the entry
 */
router.get(
  '/:entryId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/id/${entryId}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRIES GET]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Entry not found',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as EntryDetailResponse;
    const entryData = data.data?.entry || (data as unknown as { data: EntryEntity }).data;

    // Verify ownership
    if (entryData.userId !== userId) {
      ServiceErrors.forbidden(res, "Unauthorized: Cannot access other users' entries", req);
      return;
    }

    sendSuccess(res, entryData);
  })
);

/**
 * POST /api/app/entries
 * Create a new entry with validation
 * Body: { content: string, type?: string, moodContext?: string, ... }
 * userId is automatically injected from authenticated user
 */
router.post(
  '/',
  injectAuthenticatedUserId,
  entrySafetyMiddleware,
  validateBody(CreateEntrySchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify({
        ...req.body,
        userId,
      }),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRIES CREATE]') as ServiceErrorResponse;
      const errorDetails = extractErrorDetails(errorData, 'Failed to create entry');
      res.status(response.status).json({
        success: false,
        error: {
          type: errorDetails.type || 'InternalError',
          code: errorDetails.code || 'CREATE_ENTRY_FAILED',
          message: errorDetails.message,
          details: errorDetails.details,
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as EntryDetailResponse;
    sendCreated(res, data.data?.entry || data.data);
  })
);

/**
 * PATCH /api/app/entries/:id
 * Update an entry
 * Body: { content?: string, type?: string, ... }
 * Validates user owns the entry
 */
router.patch(
  '/:id',
  injectAuthenticatedUserId,
  entrySafetyMiddleware,
  validateBody(UpdateEntrySchema),
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    // First verify the entry belongs to the user
    const getResponse = await gatewayFetch(`${userServiceUrl}/api/entries/id/${id}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!getResponse.ok) {
      ServiceErrors.notFound(res, 'Entry', req);
      return;
    }

    const existingEntry = (await getResponse.json()) as EntryDetailResponse;
    const entryData = existingEntry.data?.entry || (existingEntry as unknown as { data: EntryEntity }).data;

    if (entryData.userId !== userId) {
      ServiceErrors.forbidden(res, "Unauthorized: Cannot update other users' entries", req);
      return;
    }

    // Update the entry
    const updateResponse = await gatewayFetch(`${userServiceUrl}/api/entries/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!updateResponse.ok) {
      const errorData = await parseErrorBody(updateResponse, '[ENTRIES UPDATE]') as ServiceErrorResponse;
      res.status(updateResponse.status).json({
        success: false,
        message: errorData.message || 'Failed to update entry',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await updateResponse.json()) as EntryDetailResponse;
    sendSuccess(res, data.data?.entry || data.data);
  })
);

/**
 * DELETE /api/app/entries/:id
 * Delete an entry
 * Validates user owns the entry
 */
router.delete(
  '/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    // First verify the entry belongs to the user
    const getResponse = await gatewayFetch(`${userServiceUrl}/api/entries/id/${id}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!getResponse.ok) {
      ServiceErrors.notFound(res, 'Entry', req);
      return;
    }

    const existingEntry = (await getResponse.json()) as EntryDetailResponse;
    const entryData = existingEntry.data?.entry || (existingEntry as unknown as { data: EntryEntity }).data;

    if (entryData.userId !== userId) {
      ServiceErrors.forbidden(res, "Unauthorized: Cannot delete other users' entries", req);
      return;
    }

    // Delete the entry
    const deleteResponse = await gatewayFetch(`${userServiceUrl}/api/entries/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!deleteResponse.ok) {
      const errorData = await parseErrorBody(deleteResponse, '[ENTRIES DELETE]') as ServiceErrorResponse;
      res.status(deleteResponse.status).json({
        success: false,
        message: errorData.message || 'Failed to delete entry',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    sendSuccess(res, {
        id,
        message: 'Entry deleted successfully',
      });
  })
);

/**
 * PATCH /api/app/entries/batch
 * Batch update multiple entries
 * Body: { entryIds: string[], updates: object }
 */
router.patch(
  '/batch',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/batch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

/**
 * DELETE /api/app/entries/batch
 * Batch delete multiple entries
 * Body: { entryIds: string[] }
 */
router.delete(
  '/batch',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/batch`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

/**
 * POST /api/app/entries/batch-analyze
 * Analyze multiple entries using user-service
 * Body: { entryIds: string[], analysisTypes: string[], language?: string }
 * userId is automatically injected from authenticated user
 */
router.post(
  '/batch-analyze',
  injectAuthenticatedUserId,
  validateBody(BatchAnalyzeSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/analyze/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify({
        userId,
        entryIds: req.body.entryIds,
        analysisTypes: req.body.analysisTypes,
        language: req.body.language || 'en', // Pass language code, backend maps to name
      }),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRIES BATCH ANALYZE]') as ServiceErrorResponse & { timestamp?: string };
      const errorMessage = extractErrorMessage(errorData, 'Failed to analyze entries');
      const errorObj = typeof errorData.error === 'object' ? errorData.error : null;
      res.status(response.status).json({
        success: false,
        error: {
          type: errorObj?.type || 'BatchAnalyzeError',
          code: errorObj?.code || 'BATCH_ANALYZE_FAILED',
          message: errorMessage,
        },
        timestamp: errorData.timestamp || new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    res.json(data);
  })
);

// ================================================
// ENTRY IMAGES API - Multiple images per entry (max 4)
// ================================================

interface EntryImageEntity {
  id: string;
  entryId: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

interface EntryImagesResponse {
  image?: EntryImageEntity;
  images?: EntryImageEntity[];
  data?: {
    images?: EntryImageEntity[];
  };
  count?: number;
  maxAllowed?: number;
  message?: string;
}

/**
 * GET /api/app/entries/:entryId/images
 * Get all images for an entry
 */
router.get(
  '/:entryId/images',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/${entryId}/illustrations`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRY IMAGES GET]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: extractErrorMessage(errorData, 'Failed to get entry images'),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const responseData = (await response.json()) as { success: boolean; data: EntryImagesResponse };
    sendSuccess(res, responseData.data);
  })
);

/**
 * POST /api/app/entries/:entryId/images
 * Add an image to an entry (max 4 per entry)
 * Body: { url: string }
 */
router.post(
  '/:entryId/images',
  injectAuthenticatedUserId,
  validateBody(AddEntryImageSchema),
  wrapAsync(async (req, res) => {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/${entryId}/illustrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRY IMAGES ADD]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: extractErrorMessage(errorData, 'Failed to add entry image'),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const responseData = (await response.json()) as { success: boolean; data: EntryImagesResponse };
    sendCreated(res, responseData.data);
  })
);

/**
 * DELETE /api/app/entries/:entryId/images/:imageId
 * Remove an image from an entry
 */
router.delete(
  '/:entryId/images/:imageId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { entryId, imageId } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/${entryId}/illustrations/${imageId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRY IMAGES DELETE]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: extractErrorMessage(errorData, 'Failed to remove entry image'),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const responseData = (await response.json()) as { success: boolean; data: EntryImagesResponse };
    sendSuccess(res, responseData.data);
  })
);

/**
 * PATCH /api/app/entries/:entryId/images/reorder
 * Reorder images within an entry
 * Body: { imageIds: string[] }
 */
router.patch(
  '/:entryId/images/reorder',
  injectAuthenticatedUserId,
  validateBody(ReorderEntryImagesSchema),
  wrapAsync(async (req, res) => {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/entries/${entryId}/illustrations/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[ENTRY IMAGES REORDER]') as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: extractErrorMessage(errorData, 'Failed to reorder entry images'),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const responseData = (await response.json()) as { success: boolean; data: EntryImagesResponse };
    sendSuccess(res, responseData.data);
  })
);

export default router;
