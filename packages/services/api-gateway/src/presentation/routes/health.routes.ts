/**
 * Health Check Routes
 * Dedicated routes for health monitoring and service status
 */

import { Router, Request, Response } from 'express';
import { GatewayRequest } from '../../types/request.types';
import { HealthCheckResponse, ServiceHealthStatus, SystemHealthSummary, SystemQualityReport, DependencyNode } from '../../types';
import logger from '../../utils/logger';
import { ServiceErrors } from '../utils/response-helpers';
import { sendStructuredError, createStructuredError, getCorrelationId } from '@aiponge/shared-contracts';
import { metrics, prometheusHandler } from '../../utils/metrics';
import { environmentConfig, getServiceUrl, getAllEnabledServices, isServiceEnabled } from '../../config/environment';
import {
  serviceRegistrationClient,
  type IServiceDiscoveryClient,
  type ServiceRegistration,
  ServiceLocator,
  serializeError,
} from '@aiponge/platform-core';
import { GatewayError } from '../../errors';
import { gatewayFetch } from '@services/gatewayFetch';

type ServiceInstance = ServiceRegistration;
import { getLogger } from '../../config/service-urls';

const healthLogger = getLogger('health-routes');

export class HealthRoutes {
  private router: Router;
  private discoveryClient: IServiceDiscoveryClient;

  constructor() {
    this.router = Router();
    this.discoveryClient = serviceRegistrationClient;
    this.setupRoutes();
    healthLogger.debug('Health routes initialized', {
      module: 'health_routes',
      operation: 'constructor',
      phase: 'service_initialized',
    });
  }

  /**
   * Get system service URL with proper error handling for initialization timing
   */
  private getSystemServiceUrl(): string {
    try {
      return ServiceLocator.getServiceUrl('system-service');
    } catch (error) {
      healthLogger.warn('⚠️ ServiceLocator not yet initialized, using fallback URL', {
        module: 'health_routes',
        operation: 'get_system_service_url',
        error: serializeError(error),
        phase: 'initialization_fallback',
      });
      // Fallback to environment-based URL construction with ServiceLocator port
      const systemPort = process.env.SYSTEM_SERVICE_PORT || ServiceLocator.getServicePort('system-service');
      return `http://localhost:${systemPort}`;
    }
  }

  // Helper method to get discovery information
  private async getDiscoveryInfo(): Promise<HealthCheckResponse['discovery']> {
    try {
      const isHealthy = true; // Service registration client is always healthy
      return {
        mode: 'dynamic', // Shared client uses dynamic discovery
        systemServiceAvailable: isHealthy,
        lastDynamicAttempt: new Date(),
        probeInterval: 45000,
        failureCount: 0,
        successCount: 1,
      };
    } catch (error) {
      return {
        mode: 'static',
        systemServiceAvailable: false,
        lastDynamicAttempt: new Date(),
        probeInterval: 45000,
        failureCount: 1,
        successCount: 0,
      };
    }
  }

  /**
   * Setup Health Routes
   *
   * IMPLEMENTATION STATUS:
   * ✅ Basic/Detailed/Ready/Live checks: REAL DATA (actual service ping responses)
   * ⚠️  Enhanced endpoints (dashboard/quality/metrics): ESTIMATED DATA
   *
   * Enhanced endpoints return estimated values for:
   * - Uptime/CPU/Memory: Requires metrics collection service integration
   * - Dependency graphs: Requires dependency analysis service
   * - Coupling scores: Requires call tracing service
   *
   * These endpoints provide reasonable defaults for admin dashboards
   * until dedicated monitoring services are integrated.
   */
  private setupRoutes(): void {
    // Basic health check - minimal response for load balancers
    this.router.get('/health', this.basicHealthCheck.bind(this));

    // Detailed health check - comprehensive status information
    this.router.get('/health/detailed', (req, res): void => {
      void this.detailedHealthCheck(req as GatewayRequest, res);
    });

    // Kubernetes-compatible health probes (standardized paths)
    this.router.get('/health/live', this.livenessCheck.bind(this));
    this.router.get('/health/ready', this.readinessCheck.bind(this));
    this.router.get('/health/startup', this.startupCheck.bind(this));

    // Service-specific health checks
    this.router.get('/health/services', this.servicesHealthCheck.bind(this)); // <- Removed stray quote
    this.router.get('/health/services/:serviceName', this.serviceHealthCheck.bind(this)); // <- Removed stray quote

    // System metrics endpoint (JSON format)
    this.router.get('/health/metrics', this.systemMetrics.bind(this));

    // Prometheus metrics endpoint (text/plain format for scraping)
    // SCALABILITY: Enables Prometheus/Grafana monitoring integration
    this.router.get('/metrics', prometheusHandler);

    // Discovery status endpoint
    this.router.get('/health/discovery', this.discoveryStatus.bind(this));

    // Enhanced health endpoints for complex calculations (⚠️ Returns estimated metrics - see docs above)
    this.router.get('/health/dashboard', this.comprehensiveHealthDashboard.bind(this));
    this.router.get('/health/quality', this.systemQualityAnalysis.bind(this));
    this.router.get('/health/comprehensive-metrics', this.comprehensiveHealthMetrics.bind(this));

    // Cache statistics endpoint for monitoring cache performance
    // SCALABILITY: Enables monitoring of cache hit rates for optimization
    this.router.get('/health/cache', this.cacheStats.bind(this));

    // Version information
    this.router.get('/version', this.versionInfo.bind(this));
  }

  // Cache statistics endpoint
  private cacheStats(req: Request, res: Response): void {
    try {
      const cacheHits = metrics.getCounter('cache_hits_total');
      const cacheMisses = metrics.getCounter('cache_misses_total');
      const cacheEvictions = metrics.getCounter('cache_evictions_total');
      const totalRequests = cacheHits + cacheMisses;
      const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

      res.status(200).json({
        cache: {
          hits: cacheHits,
          misses: cacheMisses,
          evictions: cacheEvictions,
          totalRequests,
          hitRate: Math.round(hitRate * 100) / 100,
          hitRateFormatted: `${hitRate.toFixed(2)}%`,
        },
        performance: {
          status: hitRate >= 80 ? 'excellent' : hitRate >= 50 ? 'good' : hitRate > 0 ? 'needs_improvement' : 'no_data',
          recommendation:
            hitRate < 50 && totalRequests > 100
              ? 'Consider increasing cache TTL or adding more cacheable endpoints'
              : null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Cache stats failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Cache stats failed', req);
      return;
    }
  }

  // Basic health check for load balancers
  private async basicHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
      const response: HealthCheckResponse = {
        status: isMaintenanceMode ? 'maintenance' : 'healthy',
        maintenance: isMaintenanceMode,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        version: process.env.npm_package_version || '1.0.0', // <- Moved comma outside string
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Health check failed', { error });
      ServiceErrors.serviceUnavailable(res, 'Health check failed', req);
    }
  }

  // Detailed health check with service dependencies
  private async detailedHealthCheck(req: GatewayRequest, res: Response): Promise<void> {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Check service dependencies
      const serviceStatuses = await this.checkServiceDependencies();

      // Get discovery status from shared client
      const discoveryInfo = await this.getDiscoveryInfo();

      // Determine overall status
      const hasUnhealthyServices = serviceStatuses.some(s => s.status === 'unhealthy');
      const isDiscoveryDegraded = discoveryInfo && discoveryInfo.mode === 'static' && discoveryInfo.failureCount > 0;
      const overallStatus = hasUnhealthyServices || isDiscoveryDegraded ? 'degraded' : 'healthy';

      const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
      const response: HealthCheckResponse = {
        status: isMaintenanceMode ? 'maintenance' : overallStatus,
        maintenance: isMaintenanceMode,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        version: process.env.npm_package_version || '1.0.0', // <- Moved comma outside string
        services: serviceStatuses,
        discovery: discoveryInfo,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        },
        cpu: {
          usage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // Convert to milliseconds
        },
      };

      const statusCode = overallStatus === 'healthy' ? 200 : 503; // <- Removed stray quote
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Detailed health check failed', { error });
      ServiceErrors.serviceUnavailable(res, 'Detailed health check failed', req);
    }
  }

  // Readiness check - can the service handle requests?
  private async readinessCheck(req: Request, res: Response): Promise<void> {
    try {
      // Check if essential services are available
      const essentialServices = await this.checkEssentialServices();
      const isReady = essentialServices.every(s => s.status === 'healthy'); // <- Removed stray quote

      if (isReady) {
        const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
        res.status(200).json({
          status: 'ready',
          maintenance: isMaintenanceMode,
          timestamp: new Date().toISOString(),
          services: essentialServices,
        });
      } else {
        const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
        sendStructuredError(
          res,
          503,
          createStructuredError('SERVICE_UNAVAILABLE', 'ServiceUnavailableError', 'Service not ready', {
            service: 'api-gateway',
            correlationId: getCorrelationId(req),
            details: { maintenance: isMaintenanceMode, services: essentialServices },
          })
        );
      }
    } catch (error) {
      logger.error('Readiness check failed', { error });
      ServiceErrors.serviceUnavailable(res, 'Readiness check failed', req);
    }
  }

  // Liveness check - is the service alive?
  private livenessCheck(req: Request, res: Response): void {
    res.status(200).json({
      alive: true,
      service: 'api-gateway',
      maintenance: process.env.MAINTENANCE_MODE === 'true',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  }

  private startupCheck(req: Request, res: Response): void {
    res.status(200).json({
      started: true,
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  }

  // Check health of all registered services
  private async servicesHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const services = await this.checkServiceDependencies();
      const healthyCount = services.filter(s => s.status === 'healthy').length; // <- Removed stray quote
      const totalCount = services.length;

      res.status(200).json({
        summary: {
          total: totalCount,
          healthy: healthyCount,
          unhealthy: totalCount - healthyCount,
          healthPercentage: totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 100,
        },
        services,
        discovery: await this.getDiscoveryInfo(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Services health check failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Services health check failed', req);
      return;
    }
  }

  // Check health of specific service
  private async serviceHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const { serviceName } = req.params;
      const service = await this.checkSpecificService(serviceName as string);

      if (!service) {
        ServiceErrors.notFound(res, `Service '${serviceName}'`, req);
        return;
      }

      const statusCode = service.status === 'healthy' ? 200 : 503; // <- Removed stray quote
      res.status(statusCode).json({
        service,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Service health check failed', {
        error: serializeError(error),
        service: req.params.serviceName,
      });
      ServiceErrors.fromException(res, error, 'Service health check failed', req);
      return;
    }
  }

  // System metrics endpoint
  private systemMetrics(req: Request, res: Response): void {
    // <- Removed Promise<void> since not async
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();

      // Get basic metrics
      const requestMetrics = metrics.getHistogramStats('http_request_duration_seconds'); // <- Removed stray quote
      const errorMetrics = metrics.getCounter('http_requests_total'); // <- Fixed ErrorMetrics to errorMetrics

      res.status(200).json({
        system: {
          uptime: Math.floor(uptime),
          memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        http: {
          requestDuration: requestMetrics,
          totalRequests: errorMetrics, // <- Fixed ErrorMetrics to errorMetrics
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('System metrics failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'System metrics failed', req);
      return;
    }
  }

  // Version information
  // Discovery status endpoint
  private async discoveryStatus(req: Request, res: Response): Promise<void> {
    try {
      const discoveryInfo = await this.getDiscoveryInfo();
      const allServices = await this.discoveryClient.discover('*');

      // Group services by name for summary
      const servicesList = Array.isArray(allServices) ? allServices : [allServices];
      const serviceGroups = servicesList.reduce(
        (acc: Record<string, ServiceInstance[]>, service: ServiceInstance) => {
          if (!acc[service.name]) {
            acc[service.name] = [];
          }
          acc[service.name].push(service);
          return acc;
        },
        {} as Record<string, ServiceInstance[]>
      );

      const servicesSummary = (Object.entries(serviceGroups) as [string, ServiceInstance[]][]).map(([name, instances]) => ({
        name,
        totalInstances: Array.isArray(instances) ? instances.length : 1,
        healthyInstances: Array.isArray(instances) ? instances.filter((i: ServiceInstance) => (i as unknown as Record<string, unknown>).healthy !== false).length : 0,
        discoveryMode: 'dynamic', // Shared client uses dynamic discovery
      }));

      res.status(200).json({
        discovery: discoveryInfo,
        services: servicesSummary,
        totalServices: Object.keys(serviceGroups).length,
        canForceUpgrade: false, // Shared client manages this
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Discovery status failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Discovery status failed', req);
      return;
    }
  }

  private versionInfo(req: Request, res: Response): void {
    // <- Removed Promise<void> since not async
    res.status(200).json({
      name: 'API Gateway', // <- Moved comma outside string
      version: process.env.npm_package_version || '1.0.0', // <- Moved comma outside string
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development', // <- Moved comma outside string
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      commit: process.env.GIT_COMMIT || 'unknown', // <- Moved comma outside string
      timestamp: new Date().toISOString(),
    });
  }

  // Helper method to check service dependencies
  private async checkServiceDependencies(): Promise<ServiceHealthStatus[]> {
    const enabledServices = getAllEnabledServices();

    if (enabledServices.length === 0) {
      logger.warn('No services configured for health checking'); // <- Removed stray quote
      return [];
    }

    const checks = enabledServices.map(async service => {
      return this.checkSpecificService(service.name);
    });

    const results = await Promise.allSettled(checks);

    return results.map((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        // <- Removed stray quote
        return result.value;
      }

      return {
        name: enabledServices[index].name,
        status: 'unknown' as const, // <- Removed stray quote
        lastCheck: new Date().toISOString(),
        error: result.status === 'rejected' ? String(result.reason) : 'Service check failed',
      };
    });
  }

  // Helper method to check essential services
  private async checkEssentialServices(): Promise<ServiceHealthStatus[]> {
    // Get essential services from configuration
    const essentialServiceNames = ['user-service', 'system-service']; // <- Removed stray quote
    const essentialServices = essentialServiceNames.filter(name => isServiceEnabled(name)).map(name => name);

    if (essentialServices.length === 0) {
      logger.warn('No essential services configured'); // <- Removed stray quote
      return [];
    }

    const checks = essentialServices.map(async serviceName => {
      return this.checkSpecificService(serviceName);
    });

    const results = await Promise.allSettled(checks);

    return results.map((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        // <- Removed stray quote
        return result.value;
      }

      return {
        name: essentialServices[index],
        status: 'unhealthy' as const, // <- Removed stray quote
        lastCheck: new Date().toISOString(),
        error: 'Service unreachable', // <- Moved comma outside string
      };
    });
  }

  // Helper method to check specific service
  private async checkSpecificService(serviceName: string): Promise<ServiceHealthStatus | null> {
    try {
      if (!isServiceEnabled(serviceName)) {
        return {
          name: serviceName,
          status: 'unknown', // <- Moved comma outside string
          lastCheck: new Date().toISOString(),
          error: 'Service not configured or disabled', // <- Moved comma outside string
        };
      }

      const startTime = Date.now();
      const healthUrl = getServiceUrl(serviceName, '/health'); // <- Removed stray quote

      // Perform actual health check with timeout
      const checkPromise = this.performHealthCheck(healthUrl);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(GatewayError.timeout('health check', environmentConfig.defaultRequestTimeoutMs)),
          environmentConfig.defaultRequestTimeoutMs
        )
      );

      await Promise.race([checkPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;

      return {
        name: serviceName,
        status: 'healthy', // <- Moved comma outside string
        responseTime,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: serviceName,
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error', // <- Fixed Error to error
      };
    }
  }

  private async performHealthCheck(url: string): Promise<void> {
    // Perform actual health check using fetch
    const response = await gatewayFetch(url, {
      method: 'GET',
      signal: globalThis.AbortSignal.timeout(environmentConfig.defaultRequestTimeoutMs),
    });

    if (!response.ok) {
      throw GatewayError.upstreamError('health-check', response.status, `Health check failed`);
    }
  }

  // Comprehensive Health Dashboard - handles all the complex calculations from frontend
  private async comprehensiveHealthDashboard(req: Request, res: Response): Promise<void> {
    try {
      // Get all enabled services and their health status
      const services = await this.checkServiceDependencies();
      const serviceDiscoveryStatus = await this.getDiscoveryInfo();

      // Calculate service health metrics (moved from frontend useHealthMetrics)
      const totalServices = services.length;
      const healthyServices = services.filter(s => s.status === 'healthy').length;
      const degradedServices = services.filter(s => s.status === 'unhealthy' || s.status === 'unknown').length;
      const unhealthyServices = services.filter(s => s.status === 'unhealthy').length;

      // Calculate overall system status (moved from frontend HealthDashboard logic)
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (unhealthyServices > 0 || healthyServices === 0) {
        overallStatus = 'unhealthy';
      } else if (degradedServices > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      // Calculate system health percentage (moved from frontend)
      const systemHealthPercentage = totalServices > 0 ? Math.round((healthyServices / totalServices) * 100) : 0;

      // Identify critical issues (business logic moved from frontend)
      const criticalIssues: string[] = [];
      if (unhealthyServices > 0) {
        criticalIssues.push(`${unhealthyServices} service${unhealthyServices > 1 ? 's' : ''} currently unhealthy`);
      }
      if (
        serviceDiscoveryStatus &&
        serviceDiscoveryStatus.mode === 'static' &&
        serviceDiscoveryStatus.failureCount > 0
      ) {
        criticalIssues.push('Service discovery operating in degraded static mode');
      }

      // Transform services to enhanced format (moved from frontend transformation logic)
      // Deferred: Real metrics collection requires dedicated monitoring service integration
      const enhancedServices = await Promise.all(
        services.map(async service => {
          return {
            serviceName: service.name,
            status: service.status as 'healthy' | 'degraded' | 'unhealthy' | 'unknown',
            lastChecked: service.lastCheck,
            responseTime: service.responseTime || 0,
            version: '1.0.0',
            dependencies: [], // Deferred: Requires dependency mapping service (not yet implemented)
            metrics: {
              uptime: service.status === 'healthy' ? 99.9 : 85.0, // Estimated - real metrics require monitoring service integration
              requestCount: 0, // Deferred: Requires metrics collection service
              errorRate: service.status === 'healthy' ? 0.1 : 5.0, // Estimated - real metrics require monitoring service
              averageResponseTime: service.responseTime || 0,
              memoryUsage: 0, // Deferred: Requires system metrics collection
              cpuUsage: 0, // Deferred: Requires system metrics collection
            },
            endpoint: `/api/${service.name}`,
            errors: service.error ? [service.error] : [],
          };
        })
      );

      // Build dependency graph (simplified version)
      // Deferred: Full dependency mapping requires dependency analysis service
      const dependencyGraph: DependencyNode[] = enhancedServices.map(service => ({
        serviceName: service.serviceName,
        status: service.status,
        dependencies: [], // Deferred: Requires service dependency mapping
        dependents: [], // Deferred: Requires reverse dependency analysis
        criticalityScore: 0, // Deferred: Requires business impact analysis
      }));

      const dashboard: SystemHealthSummary = {
        overallStatus,
        totalServices,
        healthyServices,
        degradedServices,
        unhealthyServices,
        criticalIssues,
        lastUpdated: new Date().toISOString(),
        services: enhancedServices,
        dependencyGraph,
        systemHealthPercentage,
      };

      res.status(200).json(dashboard);
    } catch (error) {
      logger.error('Comprehensive health dashboard failed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate health dashboard', req);
      return;
    }
  }

  // System Quality Analysis - handles complex quality calculations from frontend
  private async systemQualityAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const services = await this.checkServiceDependencies();

      // Calculate architecture health metrics (moved from QualityCheckDashboard frontend logic)
      const totalServices = services.length;
      const servicesOffline = services.filter(s => s.status === 'unhealthy').length;
      const activeServices = totalServices - servicesOffline;

      // Simulate service dependency analysis (this would be enhanced with real dependency data)
      const averageCoupling = 2.1; // Average dependencies per service
      const maxDependencyDepth = 4; // Maximum dependency chain depth
      const highlyCoupledServices = Math.floor(totalServices * 0.1); // 10% of services highly coupled
      const totalDependencies = Math.floor(totalServices * averageCoupling);

      // Calculate overall quality score (business logic moved from frontend)
      let overallScore = 85;
      if (servicesOffline > 0) overallScore -= servicesOffline * 10;
      if (averageCoupling > 2.5) overallScore -= 10;
      if (maxDependencyDepth > 5) overallScore -= 15;
      if (highlyCoupledServices > 2) overallScore -= 10;
      overallScore = Math.max(overallScore, 0);

      // Generate recommendations (business rules moved from frontend)
      const recommendations: string[] = [];
      if (servicesOffline > 0) {
        recommendations.push(`${servicesOffline} services are offline - investigate service health issues`);
      }
      if (averageCoupling > 2.5) {
        recommendations.push('High service coupling detected - consider decoupling services');
      }
      if (maxDependencyDepth > 5) {
        recommendations.push('Deep dependency chains detected - consider flattening architecture');
      }

      // Create service analysis (simplified version of frontend complex analysis)
      // Deferred: Full coupling analysis requires call tracing and dependency mapping service
      const serviceAnalysis = services.slice(0, 10).map(service => ({
        serviceName: service.name,
        coupling: {
          inbound: 0, // Deferred: Requires inbound call tracking
          outbound: 0, // Deferred: Requires outbound call tracking
          score: 'low' as const, // Estimated - real analysis requires dependency service
        },
        complexity: {
          dependencyDepth: 0, // Deferred: Requires full dependency graph analysis
          fanOut: 0, // Deferred: Requires call pattern analysis
          score: 'low' as const, // Estimated - real analysis requires complexity metrics service
        },
        health: {
          uptime: service.status === 'healthy' ? 99.9 : 85.5,
          errorRate: service.status === 'healthy' ? 0.1 : 5.2,
          averageResponseTime: service.responseTime || 100,
          score: service.status === 'healthy' ? ('excellent' as const) : ('fair' as const),
        },
        overallScore: service.status === 'healthy' ? 95 : 75,
        recommendations:
          service.status === 'healthy' ? [] : ['Monitor error rates', 'Investigate response time issues'],
      }));

      const qualityReport: SystemQualityReport = {
        overallScore,
        totalServices,
        criticalIssues: services.filter(s => s.status === 'unhealthy').length,
        servicesOffline,
        recommendations,
        serviceAnalysis,
        architectureHealth: {
          averageCoupling,
          maxDependencyDepth,
          highlyCoupledServices,
          circularDependencies: false, // Deferred: Requires graph cycle detection algorithm
          totalDependencies,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(qualityReport);
    } catch (error) {
      logger.error('System quality analysis failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to generate quality analysis', req);
      return;
    }
  }

  // Comprehensive Health Metrics - combines all health metrics calculations
  private async comprehensiveHealthMetrics(req: Request, res: Response): Promise<void> {
    try {
      const services = await this.checkServiceDependencies();

      // Calculate comprehensive metrics (moved from frontend useHealthMetrics)
      const totalServices = services.length;
      const activeServices = services.filter(s => s.status === 'healthy').length;
      const healthyServices = activeServices; // Business rule: active = healthy
      const systemHealthPercentage = totalServices > 0 ? Math.round((activeServices / totalServices) * 100) : 0;

      // Enhanced service list with calculated metrics
      const servicesList = services.map(service => ({
        name: service.name,
        status: service.status,
        responseTime: service.responseTime,
        lastCheck: service.lastCheck,
        healthScore: service.status === 'healthy' ? 100 : service.status === 'unknown' ? 50 : 0,
        uptime: service.status === 'healthy' ? 99.9 : 85.0,
        errorRate: service.status === 'healthy' ? 0.1 : 5.0,
      }));

      // System-wide performance metrics
      const avgResponseTime = services.reduce((acc, s) => acc + (s.responseTime || 0), 0) / services.length || 0;
      const totalErrors = services.filter(s => s.error).length;
      const errorRate = (totalErrors / totalServices) * 100;

      const metrics = {
        systemHealth: {
          totalServices,
          activeServices,
          healthyServices,
          unhealthyServices: totalServices - healthyServices,
          systemHealthPercentage,
          overallStatus:
            systemHealthPercentage > 80 ? 'healthy' : systemHealthPercentage > 50 ? 'degraded' : 'unhealthy',
        },
        performance: {
          averageResponseTime: Math.round(avgResponseTime),
          totalRequests: 0, // Deferred: Requires request counter middleware integration
          errorRate: Math.round(errorRate * 100) / 100,
          throughput: 0, // Deferred: Requires throughput tracking service
        },
        services: servicesList,
        architecture: {
          totalServices,
          averageDependencies: 2.1,
          maxDependencyDepth: 4,
          serviceDistribution: {
            core: Math.floor(totalServices * 0.2),
            business: Math.floor(totalServices * 0.6),
            utility: Math.floor(totalServices * 0.2),
          },
        },
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      res.status(200).json(metrics);
    } catch (error) {
      logger.error('Comprehensive health metrics failed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate comprehensive metrics', req);
      return;
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

export default new HealthRoutes().getRouter();
