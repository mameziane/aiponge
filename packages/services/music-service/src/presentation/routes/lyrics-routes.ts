/**
 * Unified Lyrics Routes
 * REST API endpoints for all lyrics management
 * Uses unified mus_lyrics table with visibility column for access control
 *
 * Consolidated API — visibility is a query/body parameter, not a URL path segment.
 * Authorization is determined by the record's actual visibility:
 *   - personal lyrics: owner-only access
 *   - shared lyrics: public read, privileged (librarian/admin) write
 */

import { Router } from 'express';
import { serviceAuthMiddleware, extractAuthContext, serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
import {
  contextIsPrivileged,
  CONTENT_VISIBILITY,
  VISIBILITY_FILTER,
  ContentVisibilitySchema,
  isContentPersonal,
  isContentPubliclyAccessible,
  CreateLyricsServiceSchema,
} from '@aiponge/shared-contracts';
import { UnifiedLyricsRepository } from '../../infrastructure/database/UnifiedLyricsRepository';
import type { NewLyrics } from '../../schema/music-schema';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-service-lyrics-routes');

const router = Router();

let lyricsRepository: UnifiedLyricsRepository | null = null;

function getRepository(): UnifiedLyricsRepository {
  if (!lyricsRepository) {
    const db = getDatabase();
    lyricsRepository = new UnifiedLyricsRepository(db);
  }
  return lyricsRepository;
}

function parseVisibilityQuery(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

/**
 * POST /api/lyrics
 * Create new lyrics
 * Visibility determined by body.visibility (defaults to 'personal')
 * Shared lyrics require privileged auth or internal service call
 */
router.post('/', async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    const userId = authContext.userId;
    const isInternalCall = req.headers['x-internal-service'] === 'music-service';

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const parseResult = CreateLyricsServiceSchema.safeParse({ ...req.body, userId: req.body.userId || userId });
    if (!parseResult.success) {
      ServiceErrors.badRequest(res, 'Invalid lyrics data', req, {
        fields: parseResult.error.errors,
      });
      return;
    }

    const data = parseResult.data;
    const visibility = data.visibility || CONTENT_VISIBILITY.PERSONAL;

    if (isContentPubliclyAccessible(visibility) && !isInternalCall && !contextIsPrivileged(authContext)) {
      ServiceErrors.forbidden(res, 'Librarian or admin access required for shared lyrics', req);
      return;
    }

    const repo = getRepository();
    const lyrics = await repo.create(
      {
        userId: data.userId || userId,
        content: data.content,
        title: data.title,
        entryId: data.entryId,
        style: data.style,
        mood: data.mood,
        language: data.language,
        themes: data.themes,
        hasStructureTags: data.hasStructureTags ?? (isContentPubliclyAccessible(visibility) ? true : undefined),
        aiProvider: data.aiProvider,
        aiModel: data.aiModel,
        generationPrompt: data.generationPrompt,
        metadata: data.metadata,
      },
      visibility
    );

    logger.info('Lyrics created', { id: lyrics.id, userId: data.userId || userId, visibility });
    sendCreated(res, lyrics);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to create lyrics', req);
  }
});

/**
 * GET /api/lyrics/user/:userId
 * List lyrics for a user
 * Query: ?visibility=personal|shared|all (defaults to 'personal')
 * Personal lyrics: owner-only. Shared lyrics: public read.
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const { userId } = extractAuthContext(req);
    const visibilityParam = parseVisibilityQuery(req.query.visibility as string);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const repo = getRepository();

    if (isContentPubliclyAccessible(visibilityParam)) {
      const lyrics = await repo.findByUserId(targetUserId, {
        visibility: VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE,
        limit,
      });
      return sendSuccess(res, lyrics);
    }

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }
    if (targetUserId !== userId) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    const lyricsList = await repo.findByUserId(userId, { visibility: VISIBILITY_FILTER.USER, limit });
    sendSuccess(res, lyricsList);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to get user lyrics', req);
  }
});

/**
 * GET /api/lyrics/language/:language
 * List lyrics by language
 * Query: ?visibility=shared|personal|all (defaults to 'shared')
 */
router.get('/language/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const visibilityParam = parseVisibilityQuery(req.query.visibility as string);
    const limit = parseInt(req.query.limit as string) || 50;

    const visibility = isContentPersonal(visibilityParam)
      ? VISIBILITY_FILTER.PERSONAL
      : VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE;
    const repo = getRepository();
    const lyrics = await repo.findByLanguage(language, { visibility, limit });

    sendSuccess(res, lyrics);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to get lyrics by language', req);
  }
});

/**
 * GET /api/lyrics/entry/:entryId
 * Get lyrics by source entry ID
 */
router.get('/entry/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const repo = getRepository();
    const lyrics = await repo.findByEntryId(entryId, VISIBILITY_FILTER.USER);

    if (!lyrics) {
      return sendSuccess(res, null);
    }

    if (lyrics.userId !== userId) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    sendSuccess(res, lyrics);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to get lyrics by entry', req);
  }
});

/**
 * POST /api/lyrics/admin/verify-reference
 * Admin endpoint: Verify lyrics reference exists
 * Used for cross-service integrity validation
 */
router.post('/admin/verify-reference', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const { referenceType, referenceId } = req.body;

    if (referenceType !== 'lyrics' || !referenceId) {
      ServiceErrors.badRequest(res, 'Invalid reference type or missing referenceId', req, {
        valid: false,
        exists: false,
      });
      return;
    }

    const repo = getRepository();
    const lyrics = await repo.findById(referenceId, VISIBILITY_FILTER.ALL);

    res.json({
      valid: true,
      exists: !!lyrics,
      referenceType,
      referenceId,
    });
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to verify lyrics reference', req);
  }
});

/**
 * GET /api/lyrics/:id
 * Get lyrics by ID with visibility-aware access control
 * Query: ?visibility=personal|shared|user
 *   - 'user' or 'personal': scoped to personal lyrics, requires owner auth
 *   - 'shared': scoped to shared lyrics, public access
 *   - omitted: smart lookup — tries shared first, then personal (for playback)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const visibilityParam = parseVisibilityQuery(req.query.visibility as string);
    const { userId } = extractAuthContext(req);

    const repo = getRepository();

    if (visibilityParam === 'user' || isContentPersonal(visibilityParam)) {
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required for personal lyrics', req);
        return;
      }

      const userLyrics = await repo.findById(id, VISIBILITY_FILTER.USER);
      if (!userLyrics) {
        ServiceErrors.notFound(res, 'Lyrics', req);
        return;
      }
      if (userLyrics.userId !== userId) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
      return sendSuccess(res, userLyrics);
    }

    if (isContentPubliclyAccessible(visibilityParam)) {
      const accessibleLyrics = await repo.findById(id, VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE);
      if (!accessibleLyrics) {
        ServiceErrors.notFound(res, 'Shared lyrics', req);
        return;
      }
      return sendSuccess(res, accessibleLyrics);
    }

    const accessibleLyrics = await repo.findById(id, VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE);
    if (accessibleLyrics) {
      return sendSuccess(res, accessibleLyrics);
    }

    if (!userId) {
      ServiceErrors.notFound(res, 'Lyrics', req);
      return;
    }

    const userLyrics = await repo.findById(id, VISIBILITY_FILTER.USER);
    if (userLyrics) {
      if (userLyrics.userId !== userId) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
      return sendSuccess(res, userLyrics);
    }

    ServiceErrors.notFound(res, 'Lyrics', req);
    return;
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to fetch lyrics', req);
  }
});

/**
 * PUT /api/lyrics/:id
 * Update lyrics — authorization determined by record's visibility
 * Personal lyrics: owner-only. Shared lyrics: privileged users only.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const authContext = extractAuthContext(req);
    const userId = authContext.userId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const repo = getRepository();
    const existing = await repo.findById(id, VISIBILITY_FILTER.ALL);

    if (!existing) {
      ServiceErrors.notFound(res, 'Lyrics', req);
      return;
    }

    if (isContentPubliclyAccessible(existing.visibility)) {
      if (!contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required', req);
        return;
      }
    } else {
      if (existing.userId !== userId) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
    }

    const updateSchema = CreateLyricsServiceSchema.partial().omit({ userId: true, visibility: true });
    const parseResult = updateSchema.safeParse(req.body);
    if (!parseResult.success) {
      ServiceErrors.badRequest(res, 'Invalid update data', req, {
        fields: parseResult.error.errors,
      });
      return;
    }

    const updated = await repo.update(id, parseResult.data as Partial<NewLyrics>);

    logger.info('Lyrics updated', { id, visibility: existing.visibility, updatedBy: userId });
    sendSuccess(res, updated);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to update lyrics', req);
  }
});

/**
 * PATCH /api/lyrics/:id/synced-lines
 * Update synced lines — authorization determined by record's visibility
 * Personal lyrics: owner-only. Shared lyrics: privileged or internal.
 */
router.patch('/:id/synced-lines', async (req, res) => {
  try {
    const { id } = req.params;
    const { syncedLines } = req.body;
    const isInternalCall = req.headers['x-internal-service'] === 'music-service';
    const authContext = extractAuthContext(req);
    const userId = authContext.userId;

    if (!isInternalCall && !userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    if (!syncedLines || !Array.isArray(syncedLines)) {
      ServiceErrors.badRequest(res, 'syncedLines must be an array', req);
      return;
    }

    const repo = getRepository();
    const existing = await repo.findById(id, VISIBILITY_FILTER.ALL);

    if (!existing) {
      ServiceErrors.notFound(res, 'Lyrics', req);
      return;
    }

    if (isContentPubliclyAccessible(existing.visibility)) {
      if (!isInternalCall && !contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required', req);
        return;
      }
    } else {
      if (existing.userId !== userId) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
    }

    const updated = await repo.updateSyncedLines(id, syncedLines);
    logger.info('Synced lines updated', { id, lineCount: syncedLines.length, visibility: existing.visibility });
    sendSuccess(res, updated);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to update synced lines', req);
  }
});

/**
 * DELETE /api/lyrics/:id
 * Delete lyrics — authorization determined by record's visibility
 * Personal lyrics: owner-only. Shared lyrics: privileged users only.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const authContext = extractAuthContext(req);
    const userId = authContext.userId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const repo = getRepository();
    const existing = await repo.findById(id, VISIBILITY_FILTER.ALL);

    if (!existing) {
      ServiceErrors.notFound(res, 'Lyrics', req);
      return;
    }

    if (isContentPubliclyAccessible(existing.visibility)) {
      if (!contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required', req);
        return;
      }
    } else {
      if (existing.userId !== userId) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
    }

    await repo.delete(id);
    logger.info('Lyrics deleted', { id, visibility: existing.visibility, deletedBy: userId });
    sendSuccess(res, null);
  } catch (error) {
    ServiceErrors.fromException(res, error, 'Failed to delete lyrics', req);
  }
});

export default router;
