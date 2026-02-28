/**
 * LibraryController - HTTP controller for shared/private music library operations
 * Handles RESTful endpoints for accessing shared tracks and user-uploaded tracks
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { GetUserLibraryUseCase, LibrarySource } from '../../application/use-cases/library/GetUserLibraryUseCase';
import { LibrarySourceSchema, LIBRARY_SOURCE } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

const logger = getLogger('library-controller');

// Request validation schema - using passthrough to allow unknown query params
const libraryQuerySchema = z
  .object({
    source: LibrarySourceSchema.optional().default(LIBRARY_SOURCE.SHARED),
    limit: z.coerce.number().min(1).max(500).optional(),
    offset: z.coerce.number().min(0).optional(),
    section: z.enum(['favorites', 'recent', 'downloads', 'playlists']).optional(),
    search: z.string().optional(), // Search query for title
    genre: z.string().optional(), // Filter by genre (API parameter)
    genreFilter: z.string().optional(), // Filter by genre (frontend parameter alias)
    language: z.string().optional(), // Filter by language (ISO 639-1 code)
    languageFilter: z.string().optional(), // Filter by language (frontend naming)
    userLanguages: z.string().optional(), // Comma-separated list of languages (user's preferred + English)
  })
  .passthrough();

export class LibraryController {
  constructor(private readonly getUserLibraryUseCase: GetUserLibraryUseCase) {}

  /**
   * Get user's music library (shared, private, or all)
   * GET /api/library?source=shared|private|all
   */
  async getLibrary(req: Request, res: Response): Promise<void> {
    try {
      // Get userId from authenticated request (should be set by auth middleware)
      const { userId } = extractAuthContext(req);

      // Validate query parameters
      const queryParams = libraryQuerySchema.parse(req.query);

      // Shared library is accessible without authentication
      // Private library requires authentication
      if (!userId && queryParams.source !== LIBRARY_SOURCE.SHARED) {
        ServiceErrors.unauthorized(res, 'User ID is required for private library access', req);
        return;
      }

      logger.debug('Getting library for user {}, source: {}', {
        data0: userId,
        data1: queryParams.source,
      });

      // Parse userLanguages from comma-separated string to array
      const userLanguagesArray = queryParams.userLanguages
        ? queryParams.userLanguages
            .split(',')
            .map(l => l.trim())
            .filter(l => l.length > 0)
        : undefined;

      // Execute use case (support both naming conventions for genre/language)
      // For shared library access without auth, use 'anonymous' as placeholder
      const effectiveUserId = userId || (queryParams.source === LIBRARY_SOURCE.SHARED ? 'anonymous' : '');
      const result = await this.getUserLibraryUseCase.execute({
        userId: effectiveUserId,
        source: queryParams.source as LibrarySource,
        section: queryParams.section,
        limit: queryParams.limit,
        offset: queryParams.offset,
        search: queryParams.search,
        genre: queryParams.genre || queryParams.genreFilter,
        language: queryParams.language || queryParams.languageFilter,
        userLanguages: userLanguagesArray,
      });

      sendSuccess(res, {
        tracks: result.items,
        total: result.totalCount,
        hasMore: result.hasMore,
        source: result.source,
        statistics: result.statistics,
      });
    } catch (error) {
      logger.error('Get library error', {
        module: 'library_controller',
        operation: 'getLibrary',
        error: serializeError(error),
      });

      if (error instanceof z.ZodError) {
        logger.error('Zod validation failed for library query', {
          zodErrors: error.errors,
          receivedQuery: req.query,
        });
        ServiceErrors.badRequest(res, 'Invalid request parameters', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Get library error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Failed to get library', req);
        return;
      }
    }
  }
}
