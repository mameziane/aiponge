/**
 * Dynamic Router Service
 * Enhanced dynamic routing that integrates with shared service discovery infrastructure
 */

import { Request, Response, NextFunction } from 'express';
import {
  serviceRegistrationClient,
  type IServiceDiscoveryClient,
  type ServiceRegistration,
  HttpClient,
  createHttpClient,
  signUserIdHeader,
  ServiceLocator,
  serializeError,
} from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { GatewayConfig } from '../config/GatewayConfig';
import { randomUUID } from 'crypto';
import { ServiceErrors } from '../presentation/utils/response-helpers';
import { GatewayError } from '../errors';

const logger = getLogger('api-gateway-dynamicrouter');

export const API_VERSION_PREFIX = '/api/v1';

export interface RouteConfig {
  path: string;
  serviceName: string;
  rewritePath?: string;
  stripPrefix?: boolean;
  timeout?: number;
  retries?: number;
  requiresAuth?: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  headers?: Record<string, string>;
}

export interface RoutingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByService: Map<string, number>;
  errorsByService: Map<string, number>;
}

export class DynamicRouter {
  private discoveryClient: IServiceDiscoveryClient;
  private httpClient: HttpClient;
  private routes: Map<string, RouteConfig> = new Map();
  private metrics: RoutingMetrics;
  private routePatterns: Array<{ pattern: RegExp; config: RouteConfig }> = [];

  constructor() {
    // Initialize with shared service discovery infrastructure
    this.discoveryClient = serviceRegistrationClient;

    // Use longRunning config for dynamic router (may proxy to slower services)
    this.httpClient = createHttpClient({
      ...GatewayConfig.http.longRunning,
      retryDelay: 1000,
      serviceName: 'api-gateway',
    });

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByService: new Map(),
      errorsByService: new Map(),
    };

    this.initializeAIServicesRoutes();
    logger.debug('DynamicRouter initialized with shared service discovery');
  }

  /**
   * Initialize predefined routes for AI microservices
   */
  private initializeAIServicesRoutes(): void {
    // All routes use /api/v1/ prefix — the single canonical URL pattern.
    // buildTargetPath() strips the /v1 segment before forwarding to
    // microservices, which expose /api/<domain>/* internally.
    const aiServiceRoutes: RouteConfig[] = [
      // AI Config Service (Providers)
      {
        path: '/api/v1/providers/*',
        serviceName: 'ai-config-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 2,
      },

      // Analytics Service - Routes to user-service
      {
        path: '/api/v1/analytics/*',
        serviceName: 'user-service',
        stripPrefix: false,
        timeout: 15000,
      },

      // AI Content Service
      {
        path: '/api/v1/content/*',
        serviceName: 'ai-content-service',
        stripPrefix: true,
        timeout: 45000,
        retries: 1,
      },
      // Templates routes - both root and wildcard paths
      {
        path: '/api/v1/templates',
        serviceName: 'ai-config-service',
        stripPrefix: false,
        timeout: 30000,
      },
      {
        path: '/api/v1/templates/*',
        serviceName: 'ai-config-service',
        stripPrefix: false,
        timeout: 30000,
      },
      // Psychological Frameworks routes
      {
        path: '/api/v1/frameworks',
        serviceName: 'ai-config-service',
        stripPrefix: false,
        timeout: 15000,
      },
      {
        path: '/api/v1/frameworks/*',
        serviceName: 'ai-config-service',
        stripPrefix: false,
        timeout: 15000,
      },

      // Music Service (consolidated music + AI music)
      {
        path: '/api/v1/music/*',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 60000,
        retries: 1,
      },
      {
        path: '/api/v1/streaming/*',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 1,
      },
      {
        path: '/api/v1/catalog/*',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 1,
      },
      // Playlist routes - both root and wildcard paths
      {
        path: '/api/v1/playlists',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 1,
      },
      {
        path: '/api/v1/playlists/*',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 1,
      },
      {
        path: '/api/v1/library/*',
        serviceName: 'music-service',
        stripPrefix: false,
        timeout: 30000,
        retries: 1,
      },

      // AI Service
      {
        path: '/api/v1/ai/*',
        serviceName: 'ai-content-service',
        stripPrefix: true,
        timeout: 60000,
      },
      {
        path: '/api/v1/generate/*',
        serviceName: 'ai-content-service',
        stripPrefix: true,
        timeout: 60000,
      },

      // System Service
      {
        path: '/api/v1/system/*',
        serviceName: 'system-service',
        stripPrefix: true,
      },
      {
        path: '/api/v1/users/*',
        serviceName: 'user-service',
        stripPrefix: false,
      },
      {
        path: '/api/v1/context/*',
        serviceName: 'user-service',
        stripPrefix: false,
      },

      // Insights Service
      {
        path: '/api/v1/insights/*',
        serviceName: 'user-service',
        stripPrefix: false,
      },

      // Onboarding Routes (part of user-service)
      {
        path: '/api/v1/onboarding/*',
        serviceName: 'user-service',
        stripPrefix: false,
      },

      // Profile Routes (part of user-service)
      {
        path: '/api/v1/profiles/*',
        serviceName: 'user-service',
        stripPrefix: false,
      },
      {
        path: '/api/v1/entries/*',
        serviceName: 'user-service',
        stripPrefix: false,
        timeout: 30000,
      },
      {
        path: '/api/v1/analysis/*',
        serviceName: 'user-service',
        stripPrefix: false,
        timeout: 30000,
      },

      // Pattern Recognition Routes (part of user-service)
      {
        path: '/api/v1/patterns/*',
        serviceName: 'user-service',
        stripPrefix: false,
        timeout: 30000,
      },

      // Enhanced Profile Capabilities
      {
        path: '/api/v1/profiles/enhanced/*',
        serviceName: 'user-service',
        rewritePath: '/api/enhanced',
        stripPrefix: true,
        timeout: 30000,
      },

      // NOTE: Storage service routes are handled by the streaming proxy
      // in main.ts (/api/v1/storage/*, /uploads/*), NOT the DynamicRouter.

      // Health and System Routes (no /v1 — infrastructure, not API)
      {
        path: '/health/*',
        serviceName: 'system-service',
        stripPrefix: true,
        timeout: 15000,
      },
      {
        path: '/version',
        serviceName: 'system-service',
        stripPrefix: false,
        timeout: 5000,
      },

      // Service Management Routes
      {
        path: '/api/v1/services/*',
        serviceName: 'system-service',
        rewritePath: '/api/services',
        stripPrefix: true,
        timeout: 30000,
      },
    ];

    // Register all routes
    aiServiceRoutes.forEach(route => this.addRoute(route));

    logger.debug('🛣️ Initialized {} microservice routes with complete coverage', { data0: aiServiceRoutes.length });
    logger.debug('Coverage includes: AI services, Profile consolidation, Admin, Templates, Providers, Health');
  }

  /**
   * Add a new route configuration
   */
  addRoute(config: RouteConfig): void {
    const routeKey = config.path;
    this.routes.set(routeKey, config);

    // Create regex pattern for matching
    const pattern = this.pathToRegex(config.path);
    this.routePatterns.push({ pattern, config });

    // Sort patterns by specificity (more specific patterns first)
    this.routePatterns.sort((a, b) => {
      const specifityA = this.getPatternSpecificity(a.pattern);
      const specifityB = this.getPatternSpecificity(b.pattern);
      return specifityB - specifityA;
    });

    logger.debug('Added route: {} -> {}', { data0: config.path, data1: config.serviceName });
  }

  /**
   * Remove a route configuration
   */
  removeRoute(path: string): boolean {
    const removed = this.routes.delete(path);
    if (removed) {
      this.routePatterns = this.routePatterns.filter(p => p.config.path !== path);
      logger.info('🗑️ Removed route: {}', { data0: path });
    }
    return removed;
  }

  /**
   * Get route configuration for a path.
   * Routes are defined with /api/v1/ prefix — direct matching only.
   */
  getRouteConfig(path: string): RouteConfig | null {
    if (this.routes.has(path)) {
      return this.routes.get(path)!;
    }

    for (const { pattern, config } of this.routePatterns) {
      if (pattern.test(path)) {
        return config;
      }
    }

    return null;
  }

  /**
   * Main routing middleware
   */
  routeRequest() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${randomUUID()}`;

      try {
        const routeConfig = this.getRouteConfig(req.path);

        if (!routeConfig) {
          next();
          return;
        }

        logger.info('Routing request: ${req.method} ${req.path} -> ${routeConfig.serviceName}', {
          data: {
            requestId,
          },
        });

        const targetPath = this.buildTargetPath(req.path, routeConfig);

        // Discover service
        let service = await this.discoveryClient.discover(routeConfig.serviceName);

        // Fallback to static config in development mode when discovery returns null
        if (!service) {
          const port = ServiceLocator.getServicePort(routeConfig.serviceName);
          if (port) {
            logger.debug(`Using ServiceLocator fallback for ${routeConfig.serviceName} on port ${port}`);
            service = {
              name: routeConfig.serviceName,
              host: 'localhost',
              port: port,
              healthy: true,
            } as ServiceRegistration;
          }
        }

        if (!service) {
          this.recordError(routeConfig.serviceName);
          ServiceErrors.serviceUnavailable(res, `Service ${routeConfig.serviceName} is currently unavailable`, req);
          return;
        }

        // Execute service call using HttpClient with correct HTTP method
        const serviceUrl = `http://${service.host}:${service.port}${targetPath}`;

        // SECURITY: Only sign user ID if request was authenticated by jwtAuthMiddleware
        // The authenticated flag is set ONLY by jwtAuthMiddleware after successful JWT verification
        // This prevents attackers from injecting req.user or bypassing auth to get signed headers
        const isAuthenticated = res.locals.authenticated === true;
        const userId = isAuthenticated ? res.locals.userId : undefined;
        const userRole = isAuthenticated ? res.locals.userRole : undefined;

        // Build headers with signed user ID and role for internal service authentication
        // Only authenticated requests get signed headers - role is included in signature to prevent spoofing
        const userIdHeaders = userId ? signUserIdHeader(userId, userRole) : {};

        // SECURITY: Strip any client-supplied auth headers before forwarding
        // These will be replaced with our signed versions from authenticated context
        const {
          'x-user-id': _clientUserId,
          'x-user-role': _clientRole,
          'x-user-id-signature': _clientSig,
          'x-user-id-timestamp': _clientTs,
          'x-gateway-service': _clientGateway,
          ...safeHeaders
        } = req.headers as Record<string, string>;

        const headers = {
          ...safeHeaders,
          'x-request-id': requestId as string,
          'x-gateway-service': 'api-gateway',
          'x-original-path': req.path,
          // Add signed user-id headers for internal service authentication
          ...userIdHeaders,
          ...routeConfig.headers,
        };

        const config = {
          headers,
          timeout: routeConfig.timeout,
        };

        let response: { data: unknown; status: number; headers: Record<string, string>; ok: boolean };

        switch (req.method.toUpperCase()) {
          case 'GET':
            response = await this.httpClient.getWithResponse(serviceUrl, config);
            break;
          case 'POST':
            response = await this.httpClient.postWithResponse(serviceUrl, req.body, config);
            break;
          case 'PUT':
            response = await this.httpClient.putWithResponse(serviceUrl, req.body, config);
            break;
          case 'PATCH':
            response = await this.httpClient.patchWithResponse(serviceUrl, req.body, config);
            break;
          case 'DELETE':
            response = await this.httpClient.deleteWithResponse(serviceUrl, config);
            break;
          default:
            throw GatewayError.proxyError(serviceUrl, `Unsupported HTTP method: ${req.method}`);
        }

        // Extract status code and data from downstream response
        const responseData = response.data as Record<string, unknown> | null;
        const statusCode = response.status;

        // Check if response is actually empty (log ERROR if detected)
        // Skip check for small success responses like { success: true }
        const serializedResponse = JSON.stringify(responseData || '');
        const isEmptyObject =
          responseData && typeof responseData === 'object' && Object.keys(responseData).length === 0;
        const isSmallSuccessResponse = responseData?.success === true || responseData?.success === false;

        if (isEmptyObject && !isSmallSuccessResponse) {
          logger.error('[ROUTER] ⚠️ EMPTY RESPONSE DETECTED!', {
            requestId,
            serviceUrl,
            method: req.method,
            path: req.path,
            statusCode,
            responseData,
            serializedLength: serializedResponse.length,
            userAgent: req.get('user-agent')?.substring(0, 50),
          });
        }

        const duration = Date.now() - startTime;

        // Record metrics
        this.recordSuccess(routeConfig.serviceName, duration);

        // Add gateway headers
        res.setHeader('x-gateway-service', 'api-gateway');
        res.setHeader('x-target-service', routeConfig.serviceName);
        res.setHeader('x-request-id', requestId as string);
        res.setHeader('x-response-time', `${duration}ms`);
        res.setHeader('x-served-by', service.name);

        // Add deprecation headers if configured
        if (routeConfig.headers) {
          Object.entries(routeConfig.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        // Send response with original status code from downstream service
        res.status(statusCode).json(responseData);

        logger.info('Request completed: ${req.method} ${req.path} -> ${routeConfig.serviceName} (${duration}ms)', {
          data: {
            requestId,
            statusCode,
            service: service.name,
          },
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        const routeConfig = this.getRouteConfig(req.path);

        if (routeConfig) {
          this.recordError(routeConfig.serviceName);
        }

        // Check if error has response data from backend service (e.g., 4xx responses)
        const errorWithResponse = error as { context?: { status?: number; data?: unknown } };
        const hasBackendResponse = errorWithResponse?.context?.status && errorWithResponse?.context?.data;

        if (hasBackendResponse) {
          // Pass through backend service response (e.g., 409 Conflict, 400 Bad Request)
          const backendStatus = errorWithResponse.context!.status;
          const backendData = errorWithResponse.context!.data;

          logger.warn('Backend service returned error response', {
            method: req.method,
            path: req.path,
            requestId,
            backendStatus,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: `${duration}ms`,
            service: routeConfig?.serviceName,
          });

          if (!res.headersSent) {
            res.status(backendStatus as number).json(backendData);
          }
          return;
        }

        // For actual gateway errors (network issues, timeouts, etc.), return 500
        logger.error('Routing failed', {
          method: req.method,
          path: req.path,
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${duration}ms`,
          service: routeConfig?.serviceName,
        });

        if (!res.headersSent) {
          ServiceErrors.fromException(res, error, 'Gateway Error', req);
        }
      }
    };
  }

  /**
   * Build target path for service call.
   * Strips the /v1 version segment so microservices receive /api/<domain>/* paths.
   */
  private buildTargetPath(originalPath: string, config: RouteConfig): string {
    // Strip version prefix: /api/v1/xxx → /api/xxx (microservices don't use versioning)
    let targetPath = originalPath.replace(/^\/api\/v1\//, '/api/');

    // Apply rewrite path if specified
    if (config.rewritePath) {
      const pathSegments = targetPath.split('/').filter(s => s);
      const configPathUnversioned = config.path.replace(/^\/api\/v1\//, '/api/');
      const configSegments = configPathUnversioned.split('/').filter(s => s);

      const remainingSegments = pathSegments.slice(configSegments.length - 1); // -1 to account for *
      targetPath = `${config.rewritePath}/${remainingSegments.join('/')}`;
    }

    // Strip prefix if specified
    if (config.stripPrefix) {
      const configPathUnversioned = config.path.replace(/^\/api\/v1\//, '/api/');
      const pathPattern = configPathUnversioned.replace('/*', '');
      if (targetPath.startsWith(pathPattern)) {
        targetPath = targetPath.replace(pathPattern, '') || '/';
      }
    }

    if (!targetPath.startsWith('/')) {
      targetPath = `/${targetPath}`;
    }

    return targetPath;
  }

  /**
   * Convert path pattern to regex
   */
  private pathToRegex(path: string): RegExp {
    // Escape special regex characters except * and :
    const pattern = path
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/:([^/]+)/g, '([^/]+)');

    return new RegExp(`^${pattern}$`);
  }

  /**
   * Get pattern specificity for sorting
   */
  private getPatternSpecificity(pattern: RegExp): number {
    const source = pattern.source;
    let specificity = 0;

    // More specific patterns have higher scores
    specificity += (source.match(/[^.*]/g) || []).length; // Non-wildcard characters
    specificity -= (source.match(/\.\*/g) || []).length * 10; // Wildcards reduce specificity
    specificity += (source.match(/\//g) || []).length; // More path segments increase specificity

    return specificity;
  }

  /**
   * Record successful request
   */
  private recordSuccess(serviceName: string, duration: number): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + duration) /
      this.metrics.successfulRequests;

    // Update service-specific metrics
    const currentCount = this.metrics.requestsByService.get(serviceName) || 0;
    this.metrics.requestsByService.set(serviceName, currentCount + 1);
  }

  /**
   * Record failed request
   */
  private recordError(serviceName: string): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    // Update service-specific error metrics
    const currentErrors = this.metrics.errorsByService.get(serviceName) || 0;
    this.metrics.errorsByService.set(serviceName, currentErrors + 1);
  }

  /**
   * Get routing metrics
   */
  getMetrics(): RoutingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all available services from discovery
   */
  async getAvailableServices(): Promise<ServiceRegistration[]> {
    try {
      return await this.discoveryClient.listServices();
    } catch (error) {
      logger.error('Failed to discover services:', { error: serializeError(error) });
      return [];
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStats(serviceName: string): Promise<Record<string, unknown> | null> {
    try {
      const service = await this.discoveryClient.discover(serviceName);
      if (!service) {
        return null;
      }

      // Return basic service info - stats endpoint would need to be called separately
      return {
        name: service.name,
        host: service.host,
        port: service.port,
        url: `http://${service.host}:${service.port}`,
        metadata: service.metadata,
      };
    } catch (error) {
      logger.error('Failed to get stats for ${serviceName}:', {
        error: serializeError(error),
      });
      return null;
    }
  }

  /**
   * Check if discovery service is healthy
   */
  async isDiscoveryHealthy(): Promise<boolean> {
    try {
      // Check if we can list services
      await this.discoveryClient.listServices();
      return true;
    } catch (error) {
      logger.error('Discovery health check failed:', { error: serializeError(error) });
      return false;
    }
  }

  /**
   * Get all configured routes
   */
  getAllRoutes(): Array<{ path: string; config: RouteConfig }> {
    return Array.from(this.routes.entries()).map(([path, config]) => ({
      path,
      config,
    }));
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByService: new Map(),
      errorsByService: new Map(),
    };
    logger.info('Routing metrics cleared');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Service discovery client cleanup if needed
    logger.info('🧹 DynamicRouter resources cleaned up');
  }
}
