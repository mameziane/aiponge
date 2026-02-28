/**
 * Route Helper Utilities
 * Reusable patterns for route definition to eliminate duplication
 */

import type { Request, Response, RequestHandler, Router, NextFunction } from 'express';
import { ServiceLocator, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../../config/service-urls';
import {
  invalidateCachePattern,
  createResponseCacheMiddleware,
  CACHE_PRESETS,
} from '../../middleware/ResponseCacheMiddleware';
import { type ProxyPolicies, type ServiceId, ServiceManifest, PolicyRegistry } from '../../../config/PolicyRegistry';
import { GatewayConfig, HttpConfig } from '../../../config/GatewayConfig';
import { gatewayFetch } from '@services/gatewayFetch';

const proxyLogger = getLogger('api-gateway-proxy');

function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function parseErrorBody(
  response: { json(): Promise<unknown>; text(): Promise<string>; status: number },
  routeId: string
): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    const rawBody = await response.text().catch(() => '<unreadable>');
    proxyLogger.error(`${routeId} Non-JSON error response`, {
      status: response.status,
      rawBody: rawBody.slice(0, 500),
    });
    return {};
  }
}

// ============================================================================
// CACHE KEY REGISTRY
// ============================================================================
// Central registry of cache invalidation patterns grouped by domain.
// This provides a single source of truth for cache keys and ensures
// consistent invalidation across all routes.
// ============================================================================

/**
 * Cache invalidation patterns organized by domain.
 * Each pattern is a string that will be matched against cached keys.
 */
export const CACHE_KEYS = {
  // Library domain - tracks, playlists, explore
  library: {
    /** Invalidate a specific track: CACHE_KEYS.library.track(trackId) */
    track: (trackId: string) => `/api/app/library/track/${trackId}`,
    /** User's private library */
    private: '/api/app/library/private',
    /** Explore/discover feed */
    explore: '/api/app/library/explore',
    /** Shared library */
    shared: '/api/app/library/shared',
    /** All library caches for a track update */
    allForTrackUpdate: (trackId: string) => [
      `/api/app/library/track/${trackId}`,
      '/api/app/library/private',
      '/api/app/library/explore',
      '/api/app/library/shared',
    ],
  },

  // Store domain - credits, products
  store: {
    /** User's credit balance */
    credits: (userId: string) => `/api/app/store/credits/${userId}`,
    /** User's credit history */
    creditHistory: '/api/app/store/credits/history',
  },

  // Albums domain
  albums: {
    publicAlbums: '/api/app/library/public-albums',
    allForAlbumDelete: (albumId: string) => [
      '/api/app/library/public-albums',
      `/api/app/library/albums/${albumId}`,
      '/api/app/library/albums',
    ],
  },

  // Playlists domain
  playlists: {
    /** All playlists for a user */
    userPlaylists: (userId: string) => `/api/app/playlists/user/${userId}`,
    /** Specific playlist */
    playlist: (playlistId: string) => `/api/app/playlists/${playlistId}`,
    /** Playlist tracks */
    playlistTracks: (playlistId: string) => `/api/app/playlists/${playlistId}/tracks`,
  },
} as const;

/**
 * Invalidate multiple cache patterns in parallel
 */
export async function invalidateCachePatterns(patterns: string[]): Promise<void> {
  await Promise.all(patterns.map(p => invalidateCachePattern(p)));
}

// ============================================================================
// PROXY HANDLER TYPES
// ============================================================================

/**
 * Configuration for a proxy request to a downstream service
 */
export interface ProxyConfig {
  /** Target service name (e.g., 'user-service', 'music-service') */
  service: string | ServiceId;
  /** Path builder function - receives req and returns the downstream path */
  path: string | ((req: Request) => string);
  /** HTTP method (defaults to req.method) */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Log prefix for debugging (e.g., '[LIBRARY]') */
  logPrefix?: string;
  /** Custom body transformer - if not provided, uses req.body for non-GET requests */
  transformBody?: (req: Request, userId: string) => unknown;
  /** Custom response transformer - if not provided, returns response as-is */
  transformResponse?: (data: unknown, req: Request) => unknown;
  /** Success status code (defaults to 200, use 201 for POST creates) */
  successStatus?: number;
  /** Error message prefix for failed requests */
  errorMessage?: string;
  /** Whether to include x-user-id header (defaults to true) */
  includeUserId?: boolean;
  /** Additional headers to include */
  extraHeaders?: Record<string, string>;
  /** Forward Authorization header to downstream service (defaults to false) */
  forwardAuth?: boolean;
  /** Query string builder - if provided, appends to path */
  query?: (req: Request) => Record<string, string | number | undefined>;

  // ============================================================================
  // CACHE INVALIDATION (Declarative)
  // ============================================================================

  /**
   * Cache patterns to invalidate after a successful response.
   * Can be:
   * - Static string patterns: ['/api/app/library/private', '/api/app/library/explore']
   * - Dynamic function that receives req and returns patterns: (req) => CACHE_KEYS.library.allForTrackUpdate(req.params.trackId)
   *
   * @example
   * // Static patterns
   * invalidate: [CACHE_KEYS.library.private, CACHE_KEYS.library.explore]
   *
   * // Dynamic patterns based on request
   * invalidate: (req) => CACHE_KEYS.library.allForTrackUpdate(req.params.trackId)
   */
  invalidate?: string[] | ((req: Request) => string[]);

  // ============================================================================
  // POLICY LAYER (Cross-Cutting Concerns)
  // ============================================================================

  /**
   * Policy configuration for rate limiting, auth, logging, and caching.
   * If not specified, inherits from the service's default policies.
   * Set individual policies to `false` to disable them.
   *
   * @example
   * // Use service defaults
   * policies: undefined
   *
   * // Override specific policies
   * policies: {
   *   rateLimit: { preset: 'strict' },
   *   auth: { required: true, injectUserId: true },
   *   logging: { level: 'debug' },
   * }
   *
   * // Disable rate limiting for this route
   * policies: { rateLimit: false }
   */
  policies?: ProxyPolicies;

  /**
   * Pre-resolved policies (internal use by createPolicyRoute).
   * When provided, skips policy resolution to avoid double resolution.
   * @internal
   */
  _resolvedPolicies?: ProxyPolicies;
}

/**
 * Resolve policies for a proxy config.
 * Merges route-level policies with service-level defaults.
 */
function resolvePolicies(config: ProxyConfig): ProxyPolicies {
  const serviceId = config.service;

  const serviceDefaults = ServiceManifest.exists(serviceId)
    ? ServiceManifest.getDefaultPolicies(serviceId as ServiceId)
    : PolicyRegistry.getDefaultPolicies();

  if (!config.policies) {
    return serviceDefaults;
  }

  return {
    rateLimit:
      config.policies.rateLimit === false
        ? false
        : config.policies.rateLimit
          ? { ...(serviceDefaults.rateLimit as object), ...config.policies.rateLimit }
          : serviceDefaults.rateLimit,
    auth:
      config.policies.auth === false
        ? false
        : config.policies.auth
          ? { ...(serviceDefaults.auth as object), ...config.policies.auth }
          : serviceDefaults.auth,
    logging:
      config.policies.logging === false
        ? false
        : config.policies.logging
          ? { ...(serviceDefaults.logging as object), ...config.policies.logging }
          : serviceDefaults.logging,
    cache:
      config.policies.cache === false
        ? false
        : config.policies.cache
          ? { ...(serviceDefaults.cache as object), ...config.policies.cache }
          : serviceDefaults.cache,
  };
}

/**
 * Creates a proxy handler that forwards requests to a downstream service.
 * Eliminates boilerplate for common proxy patterns in API Gateway routes.
 *
 * Now includes policy-aware logging with latency tracking.
 *
 * @example
 * // Simple GET proxy with default policies
 * router.get('/', injectAuthenticatedUserId, createProxyHandler({
 *   service: 'user-service',
 *   path: (req) => `/api/profiles/${extractAuthContext(req).userId}`,
 *   logPrefix: '[PROFILES]',
 * }));
 *
 * // POST with body transformation and custom policies
 * router.post('/', injectAuthenticatedUserId, createProxyHandler({
 *   service: 'user-service',
 *   path: '/api/entries',
 *   successStatus: 201,
 *   transformBody: (req, userId) => ({ ...req.body, userId }),
 *   policies: { rateLimit: { preset: 'strict' } },
 * }));
 */
export function createProxyHandler(config: ProxyConfig): RequestHandler {
  // Use pre-resolved policies if provided (from createPolicyRoute), otherwise resolve now
  const policies = config._resolvedPolicies || resolvePolicies(config);
  const loggingPolicy = policies.logging;
  const logLevel = loggingPolicy ? loggingPolicy.level || 'info' : 'none';

  return wrapAsync(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const routeId = config.logPrefix || `[${config.service}]`;
    const requestId = (req.headers['x-request-id'] as string) || generateCorrelationId();
    let targetUrl = '(unresolved)';

    try {
      const { userId, role: userRole } = extractAuthContext(req);
      const serviceUrl = ServiceLocator.getServiceUrl(config.service);
      const method = config.method || req.method;

      // Build the target path
      let targetPath = typeof config.path === 'function' ? config.path(req) : config.path;

      // Append query string if provided
      if (config.query) {
        const queryParams = config.query(req);
        const queryString = Object.entries(queryParams)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&');
        if (queryString) {
          targetPath += (targetPath.includes('?') ? '&' : '?') + queryString;
        }
      }

      targetUrl = `${serviceUrl}${targetPath}`;

      if (logLevel === 'debug' || logLevel === 'info') {
        proxyLogger.info(`${routeId} ${method} ${targetPath}`, {
          userId,
          requestId,
          service: config.service,
        });
      }

      // Build headers
      const apiVersion = (req.baseUrl + req.path).match(/\/api\/v(\d+)\//)?.[1] || '1';
      const clientVersion = req.headers['accept-version'] as string;
      const headers: Record<string, string> = {
        'x-request-id': requestId,
        'x-api-version': clientVersion || apiVersion,
        'Content-Type': 'application/json',
        ...config.extraHeaders,
      };

      if (config.includeUserId !== false && userId) {
        headers['x-user-id'] = userId;
      }

      if (userRole) {
        headers['x-user-role'] = userRole;
      }

      // Forward x-forwarded-* headers for protocol and host information
      const forwardedProto = req.headers['x-forwarded-proto'] as string;
      if (forwardedProto) {
        headers['x-forwarded-proto'] = forwardedProto;
      }

      const forwardedHost = req.headers['x-forwarded-host'] as string;
      if (forwardedHost) {
        headers['x-forwarded-host'] = forwardedHost;
      }

      // Forward Authorization header for admin/privileged operations
      if (config.forwardAuth && req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
      }

      // Propagate timeout budget so downstream services can clamp their own timeouts
      const gatewayTimeout = HttpConfig.defaults.timeout || 60000;
      const elapsedMs = Date.now() - startTime;
      headers['x-timeout-remaining'] = String(gatewayTimeout - elapsedMs);

      // Build fetch options
      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && method !== 'HEAD') {
        const body = config.transformBody ? config.transformBody(req, userId) : req.body;
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await gatewayFetch(targetUrl, fetchOptions);

      if (!response.ok) {
        const latencyMs = Date.now() - startTime;
        const errorData = await parseErrorBody(response, routeId);
        const errorMsg = config.errorMessage || 'Request failed';

        const extractedMessage =
          (typeof errorData.message === 'string' && errorData.message) ||
          (typeof errorData.error === 'object' &&
          errorData.error !== null &&
          typeof (errorData.error as Record<string, unknown>).message === 'string'
            ? ((errorData.error as Record<string, unknown>).message as string)
            : undefined) ||
          (typeof errorData.error === 'string' && errorData.error) ||
          errorMsg;

        if (logLevel !== 'none') {
          proxyLogger.error(`${routeId} ${errorMsg}`, {
            status: response.status,
            error: errorData,
            requestId,
            latencyMs,
          });
        }

        res.status(response.status).json({
          success: false,
          message: extractedMessage,
          timestamp: new Date().toISOString(),
          requestId,
        });
        return;
      }

      let data = await response.json();

      if (config.transformResponse) {
        data = config.transformResponse(data, req);
      }

      // Declarative cache invalidation after successful response
      if (config.invalidate) {
        const patterns = typeof config.invalidate === 'function' ? config.invalidate(req) : config.invalidate;

        if (patterns.length > 0) {
          await invalidateCachePatterns(patterns);
          if (logLevel === 'debug') {
            proxyLogger.debug(`${routeId} Cache invalidated`, {
              patterns,
              requestId,
            });
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      if (logLevel === 'debug') {
        proxyLogger.debug(`${routeId} Response`, {
          status: config.successStatus || 200,
          requestId,
          latencyMs,
        });
      }

      res.status(config.successStatus || 200).json(data);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      proxyLogger.error(`${routeId} Network error`, {
        error: serializeError(error),
        targetUrl,
        requestId,
        latencyMs,
      });

      if (!res.headersSent) {
        StructuredErrors.externalService(res, config.service, { correlationId: requestId });
      }
    }
  });
}

/**
 * Wraps an async controller method for use in Express routes
 * Eliminates the need to manually wrap each route with void and type annotations
 *
 * @example
 * // Before:
 * router.get('/dashboard', (req: Request, res: Response): void => {
 *   void controller.getDashboard(req, res);
 * });
 *
 * // After:
 * router.get('/dashboard', wrapAsync(controller.getDashboard.bind(controller)));
 */
export function wrapAsync(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, _next: NextFunction): void => {
    fn(req, res).catch(error => {
      proxyLogger.error('Unhandled async error in route handler', {
        error: serializeError(error),
        method: req.method,
        path: req.path,
      });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { type: 'InternalError', code: 'INTERNAL_ERROR', message: 'Internal server error' },
          timestamp: new Date().toISOString(),
        });
      }
    });
  };
}

/**
 * Creates a route handler that wraps a controller method
 * Alternative syntax that doesn't require .bind()
 *
 * @example
 * router.get('/dashboard', createHandler((req, res) => controller.getDashboard(req, res)));
 */
export function createHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, _next: NextFunction): void => {
    fn(req, res).catch(error => {
      proxyLogger.error('Unhandled async error in route handler', {
        error: serializeError(error),
        method: req.method,
        path: req.path,
      });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { type: 'InternalError', code: 'INTERNAL_ERROR', message: 'Internal server error' },
          timestamp: new Date().toISOString(),
        });
      }
    });
  };
}

/**
 * Helper to create multiple routes with the same controller in a concise way
 *
 * @example
 * const routes = createRoutes(router, controller, {
 *   get: {
 *     '/dashboard': 'getDashboard',
 *     '/profile': 'getProfile',
 *   },
 *   post: {
 *     '/sessions/schedule': 'scheduleSession',
 *   },
 * });
 */
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type RouterMethod = (path: string, ...handlers: RequestHandler[]) => Router;

export function createRoutes<T>(
  router: Router,
  controller: T,
  routeMap: {
    [method in HttpMethod]?: {
      [path: string]: keyof T;
    };
  }
): void {
  Object.entries(routeMap).forEach(([method, paths]) => {
    Object.entries(paths as Record<string, keyof T>).forEach(([path, handlerName]) => {
      const handler = controller[handlerName];
      if (typeof handler === 'function') {
        const routerMethod = router[method as HttpMethod] as RouterMethod;
        routerMethod(path, wrapAsync(handler.bind(controller)));
      }
    });
  });
}

// ============================================================================
// POLICY-AWARE ROUTE BUILDER
// ============================================================================

import { rateLimitMiddleware } from '../../middleware/RateLimitMiddleware';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';

export interface PolicyRouteConfig extends ProxyConfig {
  middleware?: RequestHandler[];
}

/**
 * Materializes middleware array based on resolved policies.
 * This is the core of policy enforcement - converting declarative policies into actual middleware.
 *
 * MIDDLEWARE ORDER:
 * 1. Auth (if required) - Must run first if rate limiting uses per-user key
 * 2. Rate limiting - Can use x-user-id header after auth runs
 * 3. Response caching - For read endpoints
 */
function materializePolicyMiddleware(
  policies: ReturnType<typeof resolvePolicies>,
  config: ProxyConfig
): RequestHandler[] {
  const middleware: RequestHandler[] = [];

  // 1. Authentication middleware - runs FIRST to ensure x-user-id is set for per-user rate limiting
  // injectUserId can be true even when required is false (optional auth with per-user quotas)
  const authPolicy = policies.auth;
  if (authPolicy) {
    const shouldInject =
      authPolicy.injectUserId !== false && (authPolicy.required !== false || authPolicy.injectUserId === true);
    if (shouldInject) {
      middleware.push(injectAuthenticatedUserId);
    }
  }

  // 2. Rate limiting middleware (after auth so per-user limits work)
  const rateLimitPolicy = policies.rateLimit;
  if (rateLimitPolicy && rateLimitPolicy.preset !== 'none') {
    const rateLimitConfig = PolicyRegistry.getRateLimitConfig(rateLimitPolicy);
    if (rateLimitConfig.maxRequests > 0) {
      middleware.push(
        rateLimitMiddleware({
          windowMs: rateLimitConfig.windowMs,
          maxRequests: rateLimitConfig.maxRequests,
          keyType: rateLimitConfig.keyType,
          segment: rateLimitConfig.segment,
        })
      );
    }
  }

  // 3. Response caching middleware (applied last for read endpoints)
  const cachePolicy = policies.cache;
  if (cachePolicy && cachePolicy.enabled) {
    const gwCacheConfig = GatewayConfig.rateLimit.isRedisEnabled ? { redis: GatewayConfig.rateLimit.redis } : {};

    const cacheConfig = {
      ttlSeconds: Math.floor((cachePolicy.ttlMs || 120000) / 1000),
      staleWhileRevalidateSeconds: cachePolicy.staleWhileRevalidateMs
        ? Math.floor(cachePolicy.staleWhileRevalidateMs / 1000)
        : undefined,
      varyByHeaders: cachePolicy.varyByHeaders,
      ...gwCacheConfig,
    };
    middleware.push(createResponseCacheMiddleware(cacheConfig));
  }

  return middleware;
}

/**
 * Creates a complete route handler array with middleware based on policies.
 *
 * This is the recommended way to define routes with the policy layer.
 * It returns an array of middleware + handler that can be spread into router methods.
 *
 * POLICY ENFORCEMENT:
 * - rateLimit: Materializes rate limiting middleware with preset config
 * - auth: Injects user ID middleware if required
 * - cache: Adds response caching middleware if enabled
 * - logging: Controls log verbosity in the proxy handler
 *
 * @example
 * // Define a route with automatic auth, rate limiting, and logging
 * router.get('/private', ...createPolicyRoute({
 *   service: 'music-service',
 *   path: '/api/music/library/private',
 *   logPrefix: '[PRIVATE LIBRARY]',
 *   policies: {
 *     auth: { required: true, injectUserId: true },
 *     rateLimit: { preset: 'default' },
 *   },
 * }));
 *
 * // With additional custom middleware
 * router.post('/create', ...createPolicyRoute({
 *   service: 'music-service',
 *   path: '/api/music/create',
 *   middleware: [validateRequestBody],
 *   policies: { rateLimit: { preset: 'strict' } },
 * }));
 */
export function createPolicyRoute(config: PolicyRouteConfig): RequestHandler[] {
  const policies = resolvePolicies(config);
  const policyMiddleware = materializePolicyMiddleware(policies, config);
  const handlers: RequestHandler[] = [];

  // 1. Policy-derived middleware first (rate limit, auth, cache)
  handlers.push(...policyMiddleware);

  // 2. Custom middleware second (body validation, etc.)
  if (config.middleware) {
    handlers.push(...config.middleware);
  }

  // 3. Proxy handler last - pass resolved policies to avoid double resolution
  handlers.push(createProxyHandler({ ...config, _resolvedPolicies: policies }));

  return handlers;
}

/**
 * Get resolved policies for inspection/debugging.
 * Useful for understanding what policies will be applied to a route.
 */
export function getResolvedPolicies(config: ProxyConfig) {
  return resolvePolicies(config);
}

export {
  type ProxyPolicies,
  type RateLimitPolicy,
  type AuthPolicy,
  type LoggingPolicy,
  type CachePolicy,
  type ServiceId,
  PolicyRegistry,
  ServiceManifest,
} from '../../../config/PolicyRegistry';
