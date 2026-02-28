/**
 * Admin Health Controller
 * Handles system health monitoring, metrics, diagnostics, and testing endpoints
 * Extracted from AdminAggregationController for better domain separation
 */

import { Request, Response } from 'express';
import { BaseAggregationController } from './BaseAggregationController';
import {
  serviceRegistrationClient,
  type IServiceDiscoveryClient,
  type ServiceRegistration,
  createHttpClient,
  type HttpClient,
  getServiceUrl,
  getServicePort,
  serializeError,
  errorMessage,
} from '@aiponge/platform-core';
import { ServiceErrors } from '../utils/response-helpers';
import { getOwnPort } from '../../config/service-urls';
import { GatewayConfig } from '../../config/GatewayConfig';
import { errorLogStore } from '../../services/ErrorLogStore';

type ServiceInstance = ServiceRegistration & { healthy?: boolean };

export class AdminHealthController extends BaseAggregationController {
  private readonly discoveryClient: IServiceDiscoveryClient;
  private readonly httpClient: HttpClient;

  constructor() {
    super('api-gateway-admin-health-controller');
    this.discoveryClient = serviceRegistrationClient;
    this.httpClient = createHttpClient({ ...GatewayConfig.http.defaults, serviceName: 'api-gateway' });

    this.logger.debug('AdminHealthController initialized');
  }

  /**
   * GET /api/admin/circuit-breaker-stats
   * Get circuit breaker statistics for all services
   */
  async getCircuitBreakerStatsEndpoint(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (_req: Request, res: Response) => {
      const stats = super.getCircuitBreakerStats();

      const summary = {
        totalBreakers: stats.length,
        openBreakers: stats.filter(s => s.state === 'open').length,
        halfOpenBreakers: stats.filter(s => s.state === 'half-open').length,
        closedBreakers: stats.filter(s => s.state === 'closed').length,
        totalFailures: stats.reduce((sum, s) => sum + s.failures, 0),
        totalSuccesses: stats.reduce((sum, s) => sum + s.successes, 0),
        totalTimeouts: stats.reduce((sum, s) => sum + s.timeouts, 0),
      };

      this.sendSuccessResponse(res, {
        summary,
        breakers: stats,
      });
    })(req, res);
  }

  /**
   * GET /api/admin/health-overview
   * Aggregate system health data from all services
   */
  async getSystemHealthOverview(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const services = await this.getAllServicesAsArray();
      const healthyServices = services.filter(s => s.healthy).length;
      const totalServices = services.length;
      const requestConfig = this.createRequestConfig(req);

      let systemMetrics: Record<string, unknown> = {};
      try {
        const url = `${getServiceUrl('system-service')}/health`;
        const response = await this.httpClient.get(url, requestConfig);
        systemMetrics = response as Record<string, unknown>;
      } catch (error) {
        this.logger.warn('Could not fetch system metrics', { error });
      }

      const data = {
        totalServices,
        activeServices: healthyServices,
        healthyServices,
        timestamp: new Date().toISOString(),
        ...systemMetrics,
      };

      this.sendSuccessResponse(res, data);
    })(req, res);
  }

  /**
   * GET /api/admin/service-metrics
   * Get performance metrics for all services
   */
  async getServiceMetrics(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const services = await this.getAllServicesAsArray();

      const metrics = {
        services: services,
        timestamp: new Date().toISOString(),
      };

      this.sendSuccessResponse(res, metrics);
    })(req, res);
  }

  /**
   * GET /api/admin/system-topology
   * Get abstracted system topology
   */
  async getSystemTopology(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const services = await this.getAllServicesAsArray();

      const topology = {
        services: services,
        timestamp: new Date().toISOString(),
      };

      this.sendSuccessResponse(res, topology);
    })(req, res);
  }

  /**
   * GET /api/admin/quality-metrics
   * Get system-wide quality metrics
   */
  async getQualityMetrics(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const services = await this.getAllServicesAsArray();
      const requestConfig = this.createRequestConfig(req);

      const analyticsService = await this.getServiceByName('ai-analytics-service');
      let qualityData = {};

      if (analyticsService) {
        try {
          const url = `${getServiceUrl('ai-analytics-service')}/api/quality/metrics`;
          const response = await this.httpClient.get(url, requestConfig);
          qualityData = response as Record<string, unknown>;
        } catch (error) {
          this.logger.warn('Could not fetch AI quality metrics', { error });
        }
      }

      const qualityMetrics = {
        timestamp: new Date().toISOString(),
        services: services,
        aiQuality: qualityData || null,
      };

      this.sendSuccessResponse(res, qualityMetrics);
    })(req, res);
  }

  /**
   * GET /api/admin/system-diagnostics
   * Get detailed system diagnostics
   */
  async getSystemDiagnostics(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const services = await this.getAllServicesAsArray();

      // Check database connection using Neon HTTP
      let databaseStatus = { connected: false, latencyMs: 0, error: '', driver: 'neon-http' };
      try {
        const dbStart = Date.now();
        const { neon } = await import('@neondatabase/serverless');
        let dbUrl = process.env.DATABASE_URL || '';
        // Ensure SSL mode is set for Neon connections
        if (dbUrl && !dbUrl.includes('sslmode=')) {
          dbUrl += dbUrl.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
        } else if (dbUrl && dbUrl.includes('sslmode=require')) {
          dbUrl = dbUrl.replace('sslmode=require', 'sslmode=verify-full');
        }
        const sql = neon(dbUrl);
        await sql`SELECT 1`;
        databaseStatus = {
          connected: true,
          latencyMs: Date.now() - dbStart,
          error: '',
          driver: 'neon-http',
        };
      } catch (err) {
        databaseStatus = {
          connected: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
          driver: 'neon-http',
        };
      }

      // Check Redis connection
      let redisStatus = { connected: false, latencyMs: 0, error: '' };
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        redisStatus = {
          connected: false,
          latencyMs: 0,
          error: 'REDIS_URL environment variable not configured',
        };
      } else {
        try {
          const redisStart = Date.now();
          const RedisClient = (await import('ioredis')).default;
          const client = new RedisClient(redisUrl);
          await client.ping();
          await client.disconnect();
          redisStatus = {
            connected: true,
            latencyMs: Date.now() - redisStart,
            error: '',
          };
        } catch (err) {
          redisStatus = {
            connected: false,
            latencyMs: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      }

      const diagnostics = {
        timestamp: new Date().toISOString(),
        services: services,
        database: databaseStatus,
        redis: redisStatus,
      };

      this.sendSuccessResponse(res, diagnostics);
    })(req, res);
  }

  /**
   * GET /api/admin/test-endpoints
   * Get list of available test endpoints
   */
  async getTestEndpoints(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const endpoints = [
        {
          name: 'System Health',
          endpoint: '/health',
          method: 'GET',
          description: 'Check overall system health',
        },
        {
          name: 'Admin Health Overview',
          endpoint: '/api/admin/health-overview',
          method: 'GET',
          description: 'Comprehensive health metrics',
        },
        {
          name: 'Service Metrics',
          endpoint: '/api/admin/service-metrics',
          method: 'GET',
          description: 'Service performance metrics',
        },
      ];

      this.sendSuccessResponse(res, endpoints);
    })(req, res);
  }

  /**
   * POST /api/admin/test-endpoint
   * Test a specific endpoint for debugging
   */
  async testEndpoint(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const { method = 'GET', endpoint, body } = req.body;

      if (!endpoint) {
        ServiceErrors.badRequest(res, 'Endpoint is required', req);
        return;
      }

      try {
        const url = `http://localhost:${getOwnPort()}${endpoint}`;
        const correlationId = this.createRequestConfig(req).headers!['x-correlation-id'] as string;

        let testResponse;
        if (method.toUpperCase() === 'GET') {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-correlation-id': correlationId,
            },
          });
          testResponse = await response.json();
        } else if (method.toUpperCase() === 'POST') {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-correlation-id': correlationId,
            },
            body: JSON.stringify(body || {}),
          });
          testResponse = await response.json();
        }

        this.sendSuccessResponse(res, testResponse);
      } catch (error) {
        this.logger.error('Test endpoint failed', { endpoint, error });
        ServiceErrors.internal(res, 'Test endpoint failed', error, req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/recent-errors
   * Get recent errors with correlation IDs for admin debugging
   */
  async getRecentErrors(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const { correlationId, path, statusCode, limit } = req.query;

      const errors = errorLogStore.getErrors({
        correlationId: correlationId as string,
        path: path as string,
        statusCode: statusCode ? parseInt(statusCode as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
      });

      const stats = errorLogStore.getStats();

      this.sendSuccessResponse(res, {
        errors,
        stats,
        timestamp: new Date().toISOString(),
      });
    })(req, res);
  }

  /**
   * GET /api/admin/errors/:correlationId
   * Get a specific error by correlation ID
   */
  async getErrorByCorrelationId(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const correlationId = req.params.correlationId;

      if (!correlationId || typeof correlationId !== 'string') {
        ServiceErrors.badRequest(res, 'Correlation ID is required', req);
        return;
      }

      const error = errorLogStore.getByCorrelationId(correlationId);

      if (!error) {
        ServiceErrors.notFound(res, 'Error', req);
        return;
      }

      this.sendSuccessResponse(res, error);
    })(req, res);
  }

  /**
   * GET /api/admin/error-stats
   * Get error statistics
   */
  async getErrorStats(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const stats = errorLogStore.getStats();
      this.sendSuccessResponse(res, stats);
    })(req, res);
  }

  // ============================================================================
  // HEALTH MONITORING ENDPOINTS (Proxy to system-service monitoring module)
  // ============================================================================

  /**
   * GET /api/admin/monitoring-config
   * Get monitoring scheduler configuration
   */
  async getMonitoringConfig(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const url = `${getServiceUrl('system-service')}/api/monitoring/config`;
        const requestConfig = this.createRequestConfig(req);
        const response = await this.httpClient.get(url, requestConfig);

        if (response && typeof response === 'object' && 'data' in response) {
          this.sendSuccessResponse(res, (response as { data: unknown }).data);
        } else {
          this.sendSuccessResponse(res, response);
        }
      } catch (error) {
        this.logger.error('Failed to fetch monitoring config', { error });
        ServiceErrors.internal(res, 'Failed to fetch monitoring config', error, req);
      }
    })(req, res);
  }

  /**
   * POST /api/admin/monitoring-config
   * Update monitoring scheduler configuration (enable/disable)
   */
  async updateMonitoringConfig(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const url = `${getServiceUrl('system-service')}/api/monitoring/config`;
        const requestConfig = this.createRequestConfig(req);
        const response = await this.httpClient.post(url, req.body, requestConfig);

        if (response && typeof response === 'object' && 'data' in response) {
          this.sendSuccessResponse(res, (response as { data: unknown }).data);
        } else {
          this.sendSuccessResponse(res, response);
        }
      } catch (error) {
        this.logger.error('Failed to update monitoring config', { error });
        ServiceErrors.internal(res, 'Failed to update monitoring config', error, req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/monitoring-health-summary
   * Get health check summary with issue counts
   */
  async getMonitoringHealthSummary(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const url = `${getServiceUrl('system-service')}/api/monitoring/health-summary`;
        const requestConfig = this.createRequestConfig(req);
        const response = await this.httpClient.get(url, requestConfig);

        // Transform backend response to match frontend HealthSummary interface
        if (response && typeof response === 'object' && 'data' in response) {
          const data = (
            response as {
              data: {
                summary?: Record<string, number>;
                hasIssues?: boolean;
                recentChecks?: Array<{ timestamp?: string }>;
              };
            }
          ).data;
          const summary = data.summary || {};
          const recentChecks = data.recentChecks || [];

          // Get last check time from recent checks or use current time
          const lastCheckTime = recentChecks.length > 0 && recentChecks[0].timestamp ? recentChecks[0].timestamp : null;

          // Transform to match HealthSummary interface expected by frontend
          const healthSummary = {
            totalChecks: summary.total || 0,
            healthyChecks: summary.healthy || 0,
            unhealthyChecks: summary.unhealthy || 0,
            unknownChecks: summary.unknown || 0,
            lastCheckTime,
            criticalIssues: summary.unhealthy || 0,
            warningIssues: summary.degraded || 0,
          };

          this.sendSuccessResponse(res, healthSummary);
        } else {
          // Return default empty summary
          this.sendSuccessResponse(res, {
            totalChecks: 0,
            healthyChecks: 0,
            unhealthyChecks: 0,
            unknownChecks: 0,
            lastCheckTime: null,
            criticalIssues: 0,
            warningIssues: 0,
          });
        }
      } catch (error) {
        this.logger.error('Failed to fetch monitoring health summary', { error });
        ServiceErrors.internal(res, 'Failed to fetch monitoring health summary', error, req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/monitoring-issues
   * Get active monitoring issues (health check failures + alerts)
   */
  async getMonitoringIssues(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const url = `${getServiceUrl('system-service')}/api/monitoring/issues`;
        const requestConfig = this.createRequestConfig(req);
        const response = await this.httpClient.get(url, requestConfig);

        // Transform the response to match frontend MonitoringIssue[] array
        if (response && typeof response === 'object' && 'data' in response) {
          const data = (response as { data: { issues?: Array<Record<string, unknown>> } }).data;
          const issues = (data.issues || []).map((issue, index) => ({
            id: `issue-${index}-${Date.now()}`,
            type: issue.type === 'alert' ? 'alert' : 'health_check',
            severity: issue.severity || 'warning',
            source: (issue.title as string) || 'Health Check',
            message: (issue.message as string) || 'Unknown issue',
            timestamp: (issue.timestamp as string) || new Date().toISOString(),
          }));

          // Return array directly as frontend expects MonitoringIssue[]
          this.sendSuccessResponse(res, issues);
        } else {
          // Return empty array if no data
          this.sendSuccessResponse(res, []);
        }
      } catch (error) {
        this.logger.error('Failed to fetch monitoring issues', { error });
        ServiceErrors.internal(res, 'Failed to fetch monitoring issues', error, req);
      }
    })(req, res);
  }

  async getAggregatedResilienceStats(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const resilienceServices = ['ai-content-service', 'music-service', 'ai-config-service'];

      const requestConfig = this.createRequestConfig(req);
      let hasAlerts = false;
      let highestSeverity: 'ok' | 'warning' | 'critical' = 'ok';

      const fetchPromises = resilienceServices.map(async serviceName => {
        try {
          const url = `${getServiceUrl(serviceName)}/api/admin/resilience-stats`;
          const response = await this.httpClient.get(url, requestConfig);
          const data = ((response as Record<string, unknown>)?.data ?? response) as Record<string, unknown>;

          const normalizedAlerts = ((data?.alerts || []) as Array<Record<string, unknown>>).map((a: Record<string, unknown>) => ({
            type: (((a.component as string) || (a.type as string)) || 'unknown').replace(/-/g, '_'),
            severity: (a.level as string) || (a.severity as string) || 'warning',
            message: (a.message as string) || '',
          }));

          const normalizedBulkheads = ((data?.bulkheads || []) as Array<Record<string, unknown>>).map((bh: Record<string, unknown>) => ({
            name: bh.name,
            maxConcurrent: bh.maxConcurrent || 1,
            maxQueue: bh.maxQueue || 1,
            activeConcurrent: bh.running ?? bh.activeConcurrent ?? 0,
            activeQueue: bh.queued ?? bh.activeQueue ?? 0,
            concurrentUtilization: Number(bh.utilizationPercent ?? 0) / 100,
            queueUtilization: Number(bh.queueUtilizationPercent ?? 0) / 100,
            totalUtilization: Math.max(Number(bh.utilizationPercent ?? 0) / 100, Number(bh.queueUtilizationPercent ?? 0) / 100),
          }));

          if (normalizedAlerts.length > 0) {
            hasAlerts = true;
            for (const alert of normalizedAlerts) {
              if (alert.severity === 'critical') highestSeverity = 'critical';
              else if (alert.severity === 'warning' && highestSeverity !== 'critical') highestSeverity = 'warning';
            }
          }

          return {
            service: serviceName,
            status: 'reachable',
            circuitBreakers: data?.circuitBreakers || [],
            bulkheads: normalizedBulkheads,
            alerts: normalizedAlerts,
          };
        } catch (error) {
          this.logger.warn(`Failed to fetch resilience stats from ${serviceName}`, {
            error: error instanceof Error ? serializeError(error) : String(error),
          });
          return { service: serviceName, status: 'unreachable', error: errorMessage(error) };
        }
      });

      const serviceResults = await Promise.all(fetchPromises);

      const gatewayStats = super.getCircuitBreakerStats();
      const gatewayEntry: Record<string, unknown> = {
        service: 'api-gateway',
        status: 'reachable',
        circuitBreakers: gatewayStats.map(s => ({
          name: s.name,
          state: s.state,
          failures: s.failures,
          successes: s.successes,
          timeouts: s.timeouts,
        })),
        bulkheads: [],
        alerts: gatewayStats
          .filter(s => s.state === 'open' || s.state === 'half-open')
          .map(s => ({
            type: 'circuit_breaker' as const,
            severity: (s.state === 'open' ? 'critical' : 'warning') as 'critical' | 'warning',
            message:
              s.state === 'open'
                ? `Circuit breaker "${s.name}" is OPEN (${s.failures} failures)`
                : `Circuit breaker "${s.name}" is HALF-OPEN, testing recovery`,
          })),
      };

      if (gatewayEntry.alerts && (gatewayEntry.alerts as Array<unknown>).length > 0) {
        hasAlerts = true;
        highestSeverity = 'critical';
      }

      this.sendSuccessResponse(res, {
        timestamp: new Date().toISOString(),
        overallStatus: highestSeverity,
        hasAlerts,
        services: [gatewayEntry, ...serviceResults],
      });
    })(req, res);
  }

  // Private helper methods for service discovery

  private async getAllServicesAsArray(): Promise<ServiceInstance[]> {
    try {
      const services = await this.discoveryClient.listServices();

      if (services.length === 0) {
        this.logger.info('No services registered, seeding from ServiceLocator');
        await this.seedServicesFromServiceLocator();
        return await this.discoveryClient.listServices();
      }

      return services.map((s: ServiceRegistration) => ({
        ...s,
        healthy: true,
      }));
    } catch (error) {
      this.logger.warn('Failed to list services', { error });
      return [];
    }
  }

  private async seedServicesFromServiceLocator(): Promise<void> {
    try {
      const serviceNames = [
        'api-gateway',
        'system-service',
        'storage-service',
        'user-service',
        'ai-config-service',
        'ai-analytics-service',
        'ai-content-service',
        'music-service',
      ];

      for (const serviceName of serviceNames) {
        try {
          const port = getServicePort(serviceName);

          await this.discoveryClient.register({
            name: serviceName,
            host: 'localhost',
            port: port,
            healthCheckPath: '/health',
            metadata: {
              seeded: true,
              seedTime: new Date().toISOString(),
            },
          });
        } catch (error) {
          this.logger.debug(`Skipping service ${serviceName}`, { error });
        }
      }

      this.logger.info('Seeded services from ServiceLocator');
    } catch (error) {
      this.logger.error('Failed to seed services', { error });
    }
  }

  private async getServiceByName(serviceName: string): Promise<ServiceInstance | null> {
    try {
      const allInstances = await this.discoveryClient.discover(serviceName);
      if (Array.isArray(allInstances) && allInstances.length > 0) {
        const healthyInstance = allInstances.find((inst: ServiceInstance) => inst.healthy !== false);
        return healthyInstance || allInstances[0];
      } else if (allInstances && !Array.isArray(allInstances)) {
        return allInstances as ServiceInstance;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to discover service', { serviceName, error });
      return null;
    }
  }
}

export const adminHealthController = new AdminHealthController();
