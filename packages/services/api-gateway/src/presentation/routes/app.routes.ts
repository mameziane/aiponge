/**
 * App API Routes
 * Mobile-facing API endpoints under /api/app/* namespace
 *
 * Route Naming Convention:
 * - All mobile-facing routes use /api/app/* prefix
 * - Use plural nouns for collections: /entries, /insights, /chapters
 * - Use singular noun for user's own resource: /profile
 * - Nested resources: /profile/preferences, /profile/wellness
 *
 * Key Route Modules:
 * - /profile      - User profile, preferences, wellness (profile.routes.ts)
 * - /entries      - Book entries (entries.routes.ts)
 * - /music        - Music generation (music.routes.ts)
 * - /library      - Music library (library.routes.ts)
 * - /credits      - Credit balance/transactions (credits.routes.ts)
 * - /onboarding   - Onboarding flow (inline routes below)
 */

import { Router } from 'express';
import { appController } from '../controllers';
import { wrapAsync, parseErrorBody } from './helpers/routeHelpers';
import {
  ServiceLocator,
  serializeError,
  extractAuthContext,
  createRedisCache,
  getValidation,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
const { validateQuery } = getValidation();
import { PaginationSchema, CACHE } from '@aiponge/shared-contracts';
import { injectAuthenticatedUserId } from '../middleware/authorizationMiddleware';
import { jwtAuthMiddleware } from '../middleware/jwtAuthMiddleware';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { sendStructuredError, createStructuredError } from '@aiponge/shared-contracts';
import { gatewayFetch } from '@services/gatewayFetch';

// Domain-specific route modules
import entriesRouter from './app/entries.routes';
import musicRouter from './app/music.routes';
import libraryRouter from './app/library.routes';
import playlistsRouter from './app/playlists.routes';
import creditsRouter from './app/credits.routes';
import profileRouter from './app/profile.routes';
import lyricsRouter from './app/lyrics.routes';
import subscriptionsRouter from './app/subscriptions.routes';
import reflectionsRouter from './app/reflections.routes';
import guestConversionRouter from './app/guest-conversion.routes';
import reportsRouter from './app/reports.routes';
import activityRouter from './app/activity.routes';
import storeRouter from './app/store.routes';
import quoteRouter from './app/quote.routes';
import initRouter from './app/init.routes';
import remindersRouter from './app/reminders.routes';
import organizationsRouter from './app/organizations.routes';
import privacyRouter from './app/privacy.routes';
import libraryPublicRouter from './app/library-public.routes';
import lyricsPublicRouter from './app/lyrics-public.routes';
import configRouter from './app/config.routes';
import catalogRouter from './app/catalog.routes';
import safetyRouter from './app/safety.routes';
import patternsRouter from './app/patterns.routes';
import moodCheckinsRouter from './app/mood-checkins.routes';
import narrativesRouter from './app/narratives.routes';
import creatorMembersRouter from './app/creator-members.routes';
import { savedLibraryRouter, libraryBooksRouter, contentLibraryRouter, booksGenerateRouter } from './app/books.routes';
import { ProvidersServiceClient } from '../../clients/ProvidersServiceClient';

const logger = getLogger('api-gateway-app.routes');

const router: Router = Router();

// ================================================
// SHARED TYPE DEFINITIONS FOR API RESPONSES
// ================================================

/** Standard error response from downstream services */
interface ServiceErrorResponse {
  message?: string;
  error?: string;
  code?: string;
}

/** Generic API response wrapper for downstream service responses */
interface ServiceResponse<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  total?: number;
  hasMore?: boolean;
}

/** Insight entity from user-service */
interface InsightEntity {
  id: string;
  userId: string;
  content: string;
  category?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Chapter entity from user-service */
interface ChapterEntity {
  id: string;
  userId: string;
  title: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
}

/** AI content generation response */
interface ContentGenerationResponse {
  success: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
}

// ================================================
// MUSIC PREFERENCES ANALYSIS CACHE (Redis-backed)
// ================================================
const preferencesRedisCache = createRedisCache({
  serviceName: 'api-gateway',
  keyPrefix: 'aiponge:preferences:analysis:',
});
const PREFERENCES_CACHE_TTL_SECONDS = Math.floor(CACHE.MEDIUM_TTL_MS / 1000);

function hashMusicPreferences(text: string): string {
  const normalized = text.trim().toLowerCase();
  return `${normalized.length}_${normalized.slice(0, 20)}_${normalized.slice(-20)}`;
}

// Mount public library routes BEFORE JWT middleware (for guest access to public content)
router.use('/library', libraryPublicRouter);

// Mount public lyrics routes BEFORE JWT middleware (for guest access to shared library lyrics)
// This enables progressive onboarding where guests can view lyrics from public tracks
router.use('/lyrics', lyricsPublicRouter);

// Mount public config routes (platform defaults available to all users including guests)
router.use('/config', configRouter);

// Mount static metadata catalog routes (public, CDN-cacheable)
router.use('/catalog', catalogRouter);

// Mount public subscription config route BEFORE JWT middleware (needed before login)
router.get(
  '/subscriptions/config',
  wrapAsync(async (req, res) => {
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await gatewayFetch(`${userServiceUrl}/api/subscriptions/config`, {
      headers: { 'x-request-id': requestId },
    });
    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[SUBSCRIPTIONS CONFIG]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch subscription config',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
    const data = (await response.json()) as Record<string, unknown>;
    res.json(data);
  })
);

// Apply JWT authentication to all member routes
// This verifies JWT tokens and sets x-user-id header for downstream services
router.use(jwtAuthMiddleware);

/**
 * NOTE: Profile routes have been moved to profile.routes.ts
 * GET /profile route moved to profile.routes.ts to prevent conflicts
 */

/**
 * GET /api/app/test-openai-credits
 * Test if OpenAI providers are available via centralized ProviderProxy
 * Routes through ai-config-service for consistent provider health checks
 */
router.get(
  '/test-openai-credits',
  wrapAsync(async (req, res) => {
    const providersClient = new ProvidersServiceClient();

    const results = {
      imageGeneration: { available: false, error: '' },
      textGeneration: { available: false, error: '' },
    };

    // Test text generation via ProviderProxy (openai-llm provider)
    try {
      const textTest = await providersClient.testProvider('openai-llm');
      if (textTest.success) {
        results.textGeneration.available = true;
      } else {
        results.textGeneration.error = textTest.error || 'Provider test failed';
      }
    } catch (error) {
      results.textGeneration.error = error instanceof Error ? error.message : 'Provider service error';
    }

    // Test image generation via ProviderProxy (openai-dalle provider)
    try {
      const imageTest = await providersClient.testProvider('openai-dalle');
      if (imageTest.success) {
        results.imageGeneration.available = true;
      } else {
        results.imageGeneration.error = imageTest.error || 'Provider test failed';
      }
    } catch (error) {
      results.imageGeneration.error = error instanceof Error ? error.message : 'Provider service error';
    }

    logger.info('Provider availability test completed via ProviderProxy', {
      imageAvailable: results.imageGeneration.available,
      textAvailable: results.textGeneration.available,
    });

    sendSuccess(res, results);
  })
);

/**
 * GET /api/app/dashboard
 * Aggregates app dashboard data from multiple services
 * Combines profile, entries, and insights
 */
router.get('/dashboard', wrapAsync(appController.getDashboardData.bind(appController)));

/**
 * GET /api/app/activity-feed
 * Aggregates recent activity across entries, insights, and music
 * Query params:
 *  - limit: number of items per category (default: 20)
 */
router.get('/activity-feed', wrapAsync(appController.getActivityFeed.bind(appController)));

/**
 * GET /api/app/insights-overview
 * Aggregates insights with analytics
 * Provides insights grouped by category with trend analysis
 */
router.get('/insights-overview', wrapAsync(appController.getInsightsOverview.bind(appController)));

// ================================================
// INSIGHTS API - Database-backed
// ================================================

/**
 * GET /api/insights
 * Get user's insights with pagination
 * Query params: limit (default: 50), offset (default: 0)
 */
router.get(
  '/insights',
  injectAuthenticatedUserId,
  validateQuery(PaginationSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await gatewayFetch(`${userServiceUrl}/api/insights/${userId}?limit=${limit}&offset=${offset}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[INSIGHTS]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch insights',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<
      { insights?: InsightEntity[]; total?: number; hasMore?: boolean } | InsightEntity[]
    > & { insights?: InsightEntity[] };

    // Standardize response format
    let insights: InsightEntity[] = [];
    let total = 0;
    let hasMore = false;

    if (data.data && !Array.isArray(data.data) && Array.isArray(data.data.insights)) {
      insights = data.data.insights;
      total = data.data.total || insights.length;
      hasMore = data.data.hasMore !== undefined ? data.data.hasMore : false;
    } else if (Array.isArray(data.insights)) {
      insights = data.insights;
      total = data.total || insights.length;
      hasMore = data.hasMore !== undefined ? data.hasMore : insights.length === limit;
    } else if (Array.isArray(data.data)) {
      insights = data.data;
      total = insights.length;
      hasMore = insights.length === limit;
    } else if (Array.isArray(data)) {
      insights = data as unknown as InsightEntity[];
      total = insights.length;
      hasMore = insights.length === limit;
    }

    sendSuccess(res, {
      insights,
      total,
      limit,
      offset,
      hasMore,
    });
  })
);

/**
 * GET /api/app/insights/entry/:entryId
 * Get insights for a specific entry
 */
router.get(
  '/insights/entry/:entryId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { entryId } = req.params;

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await gatewayFetch(`${userServiceUrl}/api/insights/entry/${entryId}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[INSIGHTS ENTRY]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch insights for entry',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<{ insights?: InsightEntity[] }> & {
      insights?: InsightEntity[];
    };
    const insights = data.data?.insights || data.insights || [];

    sendSuccess(res, { insights });
  })
);

/**
 * POST /api/app/insights
 * Create a new insight for an entry
 * Body: { entryId, content, type?, category?, title? }
 */
router.post(
  '/insights',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { entryId, content, type = 'reflection', category = 'general', title } = req.body;

    if (!content?.trim()) {
      ServiceErrors.badRequest(res, 'Insight content is required', req);
      return;
    }

    const insightTitle = title || `Insight - ${new Date().toLocaleDateString()}`;

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await gatewayFetch(`${userServiceUrl}/api/insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify({
        userId,
        entryId,
        content,
        type,
        category,
        title: insightTitle,
      }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[INSIGHTS CREATE]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to create insight',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<InsightEntity>;

    sendCreated(res, data.data || data);
  })
);

// ================================================
// CONTENT GENERATION API - Proxy to AI Content Service
// ================================================

/**
 * POST /api/app/content/generate
 * Generate AI content (lyrics, insights, reflections, etc.)
 * Body: { userId, prompt, contentType, options }
 *
 * OPTIMIZATION: Caches music preference analysis results for 1 hour
 */
router.post(
  '/content/generate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { prompt, contentType } = req.body;

    // Check cache for music preference analysis
    if (contentType === 'analysis' && prompt && typeof prompt === 'string') {
      const preferencesMatch = prompt.match(/User Preferences: "(.+?)"/);
      if (preferencesMatch) {
        const musicPreferences = preferencesMatch[1];
        const cacheKey = hashMusicPreferences(musicPreferences);
        const cachedStr = await preferencesRedisCache.get(cacheKey);

        if (cachedStr) {
          try {
            const cached = JSON.parse(cachedStr) as ContentGenerationResponse;
            logger.debug('Returning cached music preferences analysis', { userId, cacheKey });
            res.json({ ...cached, cached: true });
            return;
          } catch {
            await preferencesRedisCache.del(cacheKey);
          }
        }
      }
    }

    // Cache miss or not a cacheable request - call AI service
    const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const AI_TIMEOUT_MS = 120000; // 2 minutes for AI content generation

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let response: Response;
    try {
      response = await gatewayFetch(`${aiContentServiceUrl}/api/content/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          ...req.body,
          userId, // Ensure userId is from authenticated header
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      logger.error('[CONTENT GENERATE] AI service request failed', {
        userId,
        requestId,
        errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        timeoutMs: AI_TIMEOUT_MS,
      });
      sendStructuredError(
        res,
        504,
        createStructuredError(
          'TIMEOUT',
          'TimeoutError',
          isTimeout ? 'AI service request timed out' : 'AI service unavailable',
          {
            service: 'api-gateway',
            correlationId: requestId,
            details: { error: fetchError instanceof Error ? fetchError.message : 'Unknown error' },
          }
        )
      );
      return;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CONTENT GENERATE]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to generate content',
        error: errorData.error,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ContentGenerationResponse;

    // Cache music preference analysis results in Redis
    if (contentType === 'analysis' && prompt && data.success) {
      const preferencesMatch = prompt.match(/User Preferences: "(.+?)"/);
      if (preferencesMatch) {
        const musicPreferences = preferencesMatch[1];
        const cacheKey = hashMusicPreferences(musicPreferences);
        await preferencesRedisCache.set(cacheKey, JSON.stringify(data), PREFERENCES_CACHE_TTL_SECONDS);
        logger.debug('Cached music preferences analysis', { userId, cacheKey });
      }
    }

    res.json(data);
  })
);

// ================================================
// MOUNT DOMAIN-SPECIFIC ROUTE MODULES
// ================================================
// Note: Safety screening is attached directly to content routes (entries, books, reflections)
// for deterministic coverage. See individual route files for middleware placement.

// Mount domain routers - these handle all CRUD operations for their respective resources
router.use('/init', initRouter); // Composite startup endpoint for performance
router.use('/entries', entriesRouter); // Primary endpoint for book entries
router.use('/library', libraryRouter); // Library discovery and exploration
router.use('/music', musicRouter);
router.use('/playlists', playlistsRouter);
router.use('/credits', creditsRouter); // Credit balance and transactions
router.use('/store', storeRouter); // Credit store, checkout, and gift purchases
router.use('/profile', profileRouter); // User profile management
router.use('/lyrics', lyricsRouter); // AI-generated lyrics management
router.use('/subscriptions', subscriptionsRouter); // Subscription usage tracking
router.use('/reflections', reflectionsRouter); // AI reflection questions and insights (Future feature)
router.use('/guest-conversion', guestConversionRouter); // Guest user conversion tracking
router.use('/reports', reportsRouter); // Insights reports generation and download
router.use('/activity', activityRouter); // User activity calendar and history
router.use('/safety', safetyRouter); // Safety/risk assessment for therapeutic content
router.use('/quote', quoteRouter); // AI-generated personalized quotes
router.use('/reminders', remindersRouter); // Book reminders for personal book habits
router.use('/books/generate', booksGenerateRouter); // AI-powered book blueprint generation
router.use('/library/user', savedLibraryRouter); // Saved library: user's saved/followed books
router.use('/library/books', libraryBooksRouter); // Unified library: book details and chapters
router.use('/library', contentLibraryRouter); // Content library: book-types, chapters, entries, write operations
router.use('/privacy', privacyRouter); // GDPR privacy endpoints (data export/deletion)
router.use('/creator-members', creatorMembersRouter); // Creator-member following and invitations
router.use('/patterns', patternsRouter); // User behavioral pattern recognition
router.use('/mood-checkins', moodCheckinsRouter); // Mood check-in management
router.use('/narratives', narrativesRouter); // Personal narrative management
router.use('/organizations', organizationsRouter); // Organization management

// ================================================
// CHAPTERS API - Database-backed
// ================================================

/**
 * GET /api/app/chapters
 * Get user's entry chapters
 * Automatically uses authenticated userId from x-user-id header
 */
router.get(
  '/chapters',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const bookId = req.query.bookId as string | undefined;

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const queryParams = bookId ? `?bookId=${bookId}` : '';
    const targetUrl = `${userServiceUrl}/api/chapters/${userId}${queryParams}`;

    logger.debug('GET /api/app/chapters', { userId, bookId, userServiceUrl, targetUrl });

    const response = await gatewayFetch(targetUrl, {
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch chapters',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<ChapterEntity[]>;

    // Normalize response to frontend contract: { success: true, data: EntryChapter[] }
    let chapters: ChapterEntity[] = [];
    if (data.success && Array.isArray(data.data)) {
      chapters = data.data;
    } else if (Array.isArray(data.data)) {
      chapters = data.data;
    } else if (Array.isArray(data)) {
      chapters = data as unknown as ChapterEntity[];
    }

    logger.debug('Chapters response', {
      responseStatus: response.status,
      dataKeys: Object.keys(data),
      dataSuccess: data.success,
      dataIsArray: Array.isArray(data),
      dataDataIsArray: Array.isArray(data.data),
      chaptersCount: chapters.length,
    });

    sendSuccess(res, chapters);
  })
);

/**
 * POST /api/app/chapters
 * Create a new entry chapter
 * Body: { title: string, sortOrder?: number }
 * userId is automatically injected from authenticated user
 */
router.post(
  '/chapters',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/chapters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS CREATE]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to create chapter',
        error: errorData.error,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<ChapterEntity> & { chapter?: ChapterEntity };

    // Unwrap and normalize: return the chapter entity
    const chapter = data.data || data.chapter || data;

    sendCreated(res, chapter);
  })
);

/**
 * PATCH /api/app/chapters/:id
 * Update a chapter
 * Body: { title?: string, sortOrder?: number }
 * Validates user owns the chapter
 */
router.patch(
  '/chapters/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/chapters/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS UPDATE]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to update chapter',
        error: errorData.error,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<ChapterEntity> & { chapter?: ChapterEntity };

    // Unwrap and normalize: return the updated chapter
    const chapter = data.data || data.chapter || data;

    sendSuccess(res, chapter);
  })
);

/**
 * DELETE /api/app/chapters/:id
 * Delete a chapter
 * Validates user owns the chapter
 */
router.delete(
  '/chapters/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/chapters/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS DELETE]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to delete chapter',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    sendSuccess(res, {
      id,
      message: 'Chapter deleted successfully',
    });
  })
);

/**
 * GET /api/app/chapters/snapshot/:id
 * Get a chapter snapshot with its entries
 * Returns: { id, title, bookId, entries: [...], createdAt, updatedAt }
 */
router.get(
  '/chapters/snapshot/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/chapters/snapshot/${id}`, {
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS SNAPSHOT]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to get chapter snapshot',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<unknown>;

    sendSuccess(res, data.data || data);
  })
);

/**
 * POST /api/app/chapters/assign
 * Assign entries to a chapter
 * Body: { entryIds: string[], chapterId: string | null }
 */
router.post(
  '/chapters/assign',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/chapters/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CHAPTERS ASSIGN]')) as ServiceErrorResponse;
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to assign entries',
        error: errorData.error,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<unknown>;

    // Normalize response: ensure consistent success envelope
    sendSuccess(res, { message: data.message || 'Entries assigned successfully' });
  })
);

// ================================================
// ONBOARDING API
// ================================================

/**
 * GET /api/app/onboarding/status
 * Check if user has completed onboarding initialization
 * Returns: { success: boolean, onboardingCompleted: boolean, userId: string }
 */
router.get(
  '/onboarding/status',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized. Authentication required.', req);
      return;
    }

    try {
      const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
      const response = await gatewayFetch(`${userServiceUrl}/api/onboarding/status`, {
        method: 'GET',
        headers: {
          'x-user-id': userId,
          'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
        },
      });

      if (!response.ok) {
        const errorData = (await parseErrorBody(response, '[ONBOARDING STATUS]')) as ServiceErrorResponse & {
          code?: string;
        };
        res.status(response.status).json({
          success: false,
          message: errorData.message || errorData.error || 'Failed to get onboarding status',
          code: errorData.code || 'INTERNAL_ERROR',
          onboardingCompleted: false,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const data = (await response.json()) as ServiceResponse<unknown>;
      res.json(data);
    } catch (error) {
      logger.error('Failed to get onboarding status', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get onboarding status', req);
      return;
    }
  })
);

/**
 * POST /api/app/onboarding/complete
 * Complete user onboarding with preferences and create default personal book
 * Body: { wellnessGoals: string[], preferences: object, book: { title: string, description: string } }
 */
router.post(
  '/onboarding/complete',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { wellnessGoals, preferences, book, journal } = req.body;
    // Frontend sends 'journal' but backend expects 'book' - normalize
    const bookData = book || journal;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Unauthorized. Authentication required.', req);
      return;
    }

    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await gatewayFetch(`${userServiceUrl}/api/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify({ wellnessGoals, preferences, book: bookData }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[ONBOARDING COMPLETE]')) as ServiceErrorResponse & {
        code?: string;
      };
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to complete onboarding',
        code: errorData.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = (await response.json()) as ServiceResponse<unknown>;
    res.json(data);
  })
);

export { router as appRoutes };
