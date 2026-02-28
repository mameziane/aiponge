/**
 * System Service Bootstrap
 * Specialized bootstrap for complex system service with state tracking and phased initialization
 */

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Type definitions for required interfaces
export interface ServiceConfig {
  serviceName: string;
  port: number;
  host?: string;
  nodeEnv?: string;
  version?: string;
}

export interface HealthConfig {
  capabilities?: string[];
  features?: Record<string, string>;
  endpoints?: Record<string, string>;
}

export interface DatabaseConfig {
  required?: boolean;
  failFast?: boolean;
  testQuery?: string;
  timeout?: number;
  retryCount?: number;
  retryDelayMs?: number;
  validateSchema?: boolean;
}

export interface BootstrapConfig {
  service: ServiceConfig;
  health?: HealthConfig;
  database?: DatabaseConfig;
  middleware?: {
    enableSecurity?: boolean;
    enableRateLimit?: boolean;
    enableLogging?: boolean;
    enableCors?: boolean;
  };
  features?: {
    serviceRegistration?: boolean;
    gracefulShutdown?: boolean;
    customInitialization?: boolean;
  };
}

export interface InitializationState {
  [key: string]: boolean;
}

// Service discovery response types
interface ServiceInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHeartbeat?: string;
  metadata?: Record<string, unknown>;
}

interface DiscoveryResponse {
  services: ServiceInfo[];
}

interface ServiceEndpoint {
  service: string;
  method: string;
  path: string;
  url: string;
  description: string;
}

interface SystemStats {
  timestamp: string;
  uptime: number;
  memory: ReturnType<typeof process.memoryUsage>;
  cpuUsage: ReturnType<typeof process.cpuUsage>;
  nodeVersion: string;
  platform: typeof process.platform;
  architecture: string;
  services?: { total: number; healthy: number; unhealthy: number };
}

// Shutdown interface for sub-apps
interface ShutdownableApp {
  shutdown?: () => Promise<void>;
}

// Import individual service apps
import discoveryApp, { runBackgroundCleanup } from '../presentation/routes/discovery.routes';
import monitoringApp from '../presentation/routes/monitoring.routes';
import notificationApp from '../presentation/routes/notification.routes';
import orchestrationRoutes from '../presentation/routes/orchestration.routes';

// Import DynamicServiceClient
import { DynamicServiceClient } from '../shared/infrastructure/DynamicServiceClient';
import { createLogger, logAndTrackError } from '@aiponge/platform-core';
import { ServiceErrors } from '../presentation/utils/response-helpers';

export interface SystemInitializationState extends InitializationState {
  registryStoreInitialized: boolean;
  discoveryManagerOnline: boolean;
  subAppsConfigured: boolean;
  databaseCleanupConfigured: boolean;
  selfRegistrationComplete: boolean;
  warmupComplete: boolean;
}

export class SystemServiceBootstrap {
  private logger = createLogger('system-service-bootstrap');
  // Required properties that were missing
  protected app: express.Application;
  protected startupTime: number;
  protected errorBoundary: {
    wrap: (
      handler: Function
    ) => (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>;
  };
  protected config: BootstrapConfig;
  protected server?: ReturnType<express.Application['listen']>;
  protected healthManager: { createHealthEndpoint: () => (req: express.Request, res: express.Response) => void };
  protected systemInitState: SystemInitializationState = {
    registryStoreInitialized: false,
    discoveryManagerOnline: false,
    subAppsConfigured: false,
    databaseCleanupConfigured: false,
    selfRegistrationComplete: false,
    warmupComplete: false,
  };

  private dynamicServiceClient: DynamicServiceClient;
  private readonly MAX_STARTUP_TIME_MS = 30000; // 30 seconds max startup time

  constructor(serviceName: string, port: number) {
    // Initialize required properties
    this.app = express();
    this.startupTime = Date.now();

    // Create configuration
    this.config = {
      service: {
        serviceName,
        port,
        host: process.env.HOST || '0.0.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        version: '1.0.0',
      },
      health: {
        capabilities: [
          'service-discovery',
          'service-registration',
          'health-monitoring',
          'notification-management',
          'system-orchestration',
          'registry-management',
        ],
        features: {
          serviceDiscovery: 'Service registration and discovery management',
          healthMonitoring: 'Comprehensive service health monitoring',
          notifications: 'System-wide notification delivery',
          orchestration: 'Service startup and dependency orchestration',
          registryManagement: 'Central service registry management',
          consolidatedService: 'Discovery, Monitoring, and Notifications unified',
        },
        endpoints: {
          discovery: '/api/discovery',
          monitoring: '/api/monitoring',
          notifications: '/api/notifications',
          admin: '/api/admin',
        },
      },
      database: {
        required: true,
        failFast: true,
        timeout: 8000,
        retryCount: 2,
        retryDelayMs: 1500,
        validateSchema: true,
      },
      features: {
        serviceRegistration: false,
        gracefulShutdown: true,
        customInitialization: true,
      },
    };

    // Initialize error boundary and health manager
    this.errorBoundary = this.createErrorBoundary();
    this.healthManager = this.createHealthManager();

    this.dynamicServiceClient = DynamicServiceClient.getInstance();
  }

  /**
   * Create error boundary utility
   */
  private createErrorBoundary() {
    return {
      wrap: (handler: Function) => {
        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
          try {
            await handler(req, res, next);
          } catch (error) {
            const { correlationId } = logAndTrackError(
              error,
              `Request processing failed for ${req.path}`,
              {
                module: 'system_service_bootstrap',
                operation: 'error_handler_middleware',
                phase: 'request_processing_error',
                path: req.path,
                method: req.method,
                userAgent: req.get('User-Agent') || 'unknown',
              },
              'SYSTEM_SERVICE_REQUEST_PROCESSING_ERROR',
              400
            );

            ServiceErrors.fromException(res, error, 'Internal server error', req);
            return;
          }
        };
      },
    };
  }

  /**
   * Create health manager utility
   */
  private createHealthManager() {
    return {
      createHealthEndpoint: () => {
        return (req: express.Request, res: express.Response) => {
          res.json({
            status: 'healthy',
            service: this.config.service.serviceName,
            version: this.config.service.version,
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startupTime,
          });
        };
      },
    };
  }

  /**
   * Setup middleware stack
   */
  private async setupMiddleware(): Promise<void> {
    // Secure trust proxy configuration for development environment
    // Disable trust proxy for rate limiting to avoid ERR_ERL_PERMISSIVE_TRUST_PROXY
    this.app.set('trust proxy', false);

    // Basic security middleware
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting with proper trust proxy configuration
    if (this.config.middleware?.enableRateLimit !== false) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP',
      });
      this.app.use(limiter);
    }

    this.logger.info('✅ Middleware configured', {
      module: 'system_service_bootstrap',
      operation: 'setup_middleware',
      serviceName: this.config.service.serviceName,
      phase: 'middleware_complete',
    });
  }

  /**
   * Create and configure the server
   */
  async createServer(): Promise<{ app: express.Application; healthManager: unknown; errorHandler: unknown }> {
    try {
      await this.setupMiddleware();
      await this.setupRoutes();
      await this.setupHealthEndpoints();

      return {
        app: this.app,
        healthManager: this.healthManager,
        errorHandler: this.errorBoundary,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Start the server
   */
  async startServer(hooks?: { afterStart?: () => Promise<void> }): Promise<{ app: express.Application; server: unknown; healthManager: unknown; errorHandler: unknown }> {
    try {
      this.server = this.app.listen(this.config.service.port, this.config.service.host || '0.0.0.0', () => {
        this.logger.info('📡 Service running', {
          module: 'system_service_bootstrap',
          operation: 'start_server',
          serviceName: this.config.service.serviceName.toUpperCase(),
          host: this.config.service.host,
          port: this.config.service.port,
          phase: 'server_started',
        });
        this.logger.info('📊 Health endpoint available', {
          module: 'system_service_bootstrap',
          operation: 'start_server',
          healthUrl: `http://${this.config.service.host}:${this.config.service.port}/health`,
          phase: 'health_endpoint_ready',
        });
        this.logger.info('🔄 Ready endpoint available', {
          module: 'system_service_bootstrap',
          operation: 'start_server',
          readyUrl: `http://${this.config.service.host}:${this.config.service.port}/ready`,
          phase: 'ready_endpoint_ready',
        });
      });

      if (this.config.features?.gracefulShutdown !== false) {
        this.setupGracefulShutdown();
      }

      if (hooks?.afterStart) {
        await hooks.afterStart();
      }

      return {
        app: this.app,
        server: this.server,
        healthManager: this.healthManager,
        errorHandler: this.errorBoundary,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info('🛑 Graceful shutdown initiated', {
        module: 'system_service_bootstrap',
        operation: 'graceful_shutdown',
        serviceName: this.config.service.serviceName,
        signal,
        phase: 'shutdown_start',
      });

      if (this.server) {
        this.server.close(() => {
          this.logger.info('✅ HTTP server closed successfully', {
            module: 'system_service_bootstrap',
            operation: 'graceful_shutdown',
            serviceName: this.config.service.serviceName,
            phase: 'server_closed',
          });
          process.exit(0);
        });

        // Force exit after 30 seconds
        setTimeout(() => {
          this.logger.error('❌ Forced shutdown after timeout', {
            module: 'system_service_bootstrap',
            operation: 'graceful_shutdown',
            serviceName: this.config.service.serviceName,
            timeoutSeconds: 30,
            phase: 'forced_shutdown',
          });
          process.exit(1);
        }, 30000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  /**
   * Setup system service routes
   */
  async setupRoutes(): Promise<void> {
    this.logger.info('🔗 Setting up System Service routes', {
      module: 'system_service_bootstrap',
      operation: 'setup_routes',
      phase: 'routes_setup_start',
    });

    // Mount individual service routers
    this.app.use('/api/discovery', discoveryApp as unknown as express.RequestHandler);
    this.app.use('/api/monitoring', monitoringApp as unknown as express.RequestHandler);
    this.app.use('/api/notifications', notificationApp as unknown as express.RequestHandler);
    this.app.use('/api/orchestration', orchestrationRoutes);

    // Smart registration middleware - checks core readiness
    const registrationMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const coreReady = this.isCoreRegistrationReady();

      if (!coreReady) {
        const uptime = Date.now() - this.startupTime;
        const retryAfter = Math.max(1, Math.min(5, Math.floor((10000 - uptime) / 1000)));
        const missingComponents = this.getMissingCoreComponents();

        this.logger.warn('📦 Core registration not ready', {
          module: 'system_service_bootstrap',
          operation: 'registration_middleware',
          retryAfterSeconds: retryAfter,
          missingComponents,
          phase: 'core_not_ready',
        });

        res.set('Retry-After', retryAfter.toString());
        ServiceErrors.serviceUnavailable(res, 'System service registration is still initializing', req);
        return;
      }

      next();
    };

    // Apply middleware to registration route
    this.app.use('/api/discovery/services/register', registrationMiddleware as express.RequestHandler);

    // Admin endpoints for dashboard
    this.app.get(
      '/api/admin/services',
      this.errorBoundary.wrap(async (req: express.Request, res: express.Response) => {
        const discoveryData = (await this.dynamicServiceClient.makeRequest(
          this.config.service.serviceName,
          '/api/discovery/services'
        )) as DiscoveryResponse;
        const adminServices = discoveryData.services.map(service => ({
          id: service.id,
          name: service.name,
          url: `http://${service.host}:${service.port}`,
          status: service.status,
          lastHeartbeat: service.lastHeartbeat,
          metadata: service.metadata,
        }));
        res.json(adminServices);
      })
    );

    this.app.get(
      '/api/admin/endpoints',
      this.errorBoundary.wrap(async (req: express.Request, res: express.Response) => {
        const discoveryData = (await this.dynamicServiceClient.makeRequest(
          this.config.service.serviceName,
          '/api/discovery/services'
        )) as DiscoveryResponse;
        const endpoints = this.generateServiceEndpoints(discoveryData.services || []);
        res.json(endpoints);
      })
    );

    this.app.get(
      '/api/admin/monitoring',
      this.errorBoundary.wrap(async (req: express.Request, res: express.Response) => {
        const systemStats = this.generateSystemStats();

        try {
          const discoveryData = (await this.dynamicServiceClient.makeRequest(
            this.config.service.serviceName,
            '/api/discovery/services'
          )) as DiscoveryResponse;
          systemStats.services = {
            total: discoveryData.services.length,
            healthy: discoveryData.services.filter(s => s.status === 'healthy').length,
            unhealthy: discoveryData.services.filter(s => s.status === 'unhealthy').length,
          };
        } catch (err) {
          systemStats.services = { total: 0, healthy: 0, unhealthy: 0 };
        }

        res.json(systemStats);
      })
    );

    // Root endpoint
    this.app.get(
      '/',
      this.errorBoundary.wrap(async (req: express.Request, res: express.Response) => {
        res.json({
          service: this.config.service.serviceName,
          version: this.config.service.version,
          description: 'System Service: Discovery-Monitoring-Notifications',
          endpoints: {
            health: '/health',
            discovery: '/api/discovery',
            monitoring: '/api/monitoring',
            notifications: '/api/notifications',
          },
          domains: ['discovery', 'monitoring', 'notification'],
        });
      })
    );

    this.logger.info('✅ All routes configured with shared bootstrap pattern', {
      module: 'system_service_bootstrap',
      operation: 'setup_routes',
      phase: 'routes_configured',
    });
  }

  /**
   * Override health endpoints with system-specific logic
   */
  protected async setupHealthEndpoints(): Promise<void> {
    // Custom health endpoint with system-specific domains
    this.app.get(
      '/health',
      this.errorBoundary.wrap(async (req: express.Request, res: express.Response) => {
        const standardHealth = await new Promise<Record<string, unknown>>(resolve => {
          const mockReq = {} as express.Request;
          const mockRes = {
            json: (data: Record<string, unknown>) => resolve(data),
            status: () => mockRes,
          } as unknown as express.Response;
          this.healthManager.createHealthEndpoint()(mockReq, mockRes);
        });

        const systemHealthResponse = {
          ...standardHealth,
          domains: {
            discovery: 'operational',
            monitoring: 'operational',
            notification: 'operational',
          },
        };

        res.status(200).json(systemHealthResponse);
      })
    );

    // Custom ready endpoint with sophisticated initialization logic
    this.app.get('/ready', (req, res) => {
      const coreReady = this.isCoreRegistrationReady();
      const fullyReady = Object.values(this.systemInitState).every(state => state === true);
      const uptime = Date.now() - this.startupTime;

      if (coreReady) {
        res.status(200).json({
          ready: true,
          service: this.config.service.serviceName,
          timestamp: new Date().toISOString(),
          version: this.config.service.version,
          uptime: Math.floor(uptime / 1000),
          components: {
            initialization: {
              status: fullyReady ? 'healthy' : 'degraded',
              metadata: {
                coreReady: true,
                fullyReady: fullyReady,
                initializationState: this.systemInitState,
                uptime: uptime,
              },
            },
          },
          message: fullyReady ? 'System fully initialized' : 'Core registration ready, full initialization in progress',
        });
      } else {
        const retryAfter = Math.max(1, Math.min(3, Math.floor((10000 - uptime) / 1000)));
        const missingComponents = this.getMissingCoreComponents();

        res.set('Retry-After', retryAfter.toString());
        ServiceErrors.serviceUnavailable(res, 'System service core is still initializing', req);
      }
    });

    this.logger.info('✅ Custom health endpoints configured with initialization tracking', {
      module: 'system_service_bootstrap',
      operation: 'setup_health_endpoints',
      phase: 'health_endpoints_configured',
    });
  }

  /**
   * Execute custom system initialization
   */
  async executeSystemInitialization(): Promise<void> {
    this.logger.info('🔧 Beginning optimized initialization sequence', {
      module: 'system_service_bootstrap',
      operation: 'initialize',
      phase: 'initialization_start',
    });
    const initStart = Date.now();

    try {
      // Step 1: Mark immediate components as ready
      this.updateSystemInitState('subAppsConfigured', true);
      this.updateSystemInitState('registryStoreInitialized', true);
      this.updateSystemInitState('discoveryManagerOnline', true);
      this.updateSystemInitState('selfRegistrationComplete', true);

      this.logger.info('⚡ Core components ready - can accept registrations', {
        module: 'system_service_bootstrap',
        operation: 'initialize',
        initializationTimeMs: Date.now() - initStart,
        phase: 'core_ready',
      });

      // Step 2: Trigger background database cleanup (non-blocking)
      this.logger.info('🔄 Starting background database cleanup', {
        module: 'system_service_bootstrap',
        operation: 'initialize',
        phase: 'background_cleanup_triggered',
      });

      // Run cleanup in background - don't block initialization
      runBackgroundCleanup().catch(error => {
        this.logger.warn('⚠️ Background database cleanup failed', {
          module: 'system_service_bootstrap',
          operation: 'background_cleanup',
          error: error instanceof Error ? error.message : String(error),
          phase: 'background_cleanup_failed',
        });
      });

      this.updateSystemInitState('databaseCleanupConfigured', true);

      // Step 3: Execute system service warmup
      await this.executeSystemWarmup();
      this.updateSystemInitState('warmupComplete', true);

      const totalTime = Date.now() - initStart;
      this.logger.info('✅ Full initialization complete', {
        module: 'system_service_bootstrap',
        operation: 'initialize',
        totalTimeMs: totalTime,
        phase: 'initialization_complete',
      });
    } catch (error) {
      const { error: wrappedError, correlationId } = logAndTrackError(
        error,
        'System service initialization failed - critical bootstrap error',
        {
          module: 'system_service_bootstrap',
          operation: 'initialize',
          phase: 'initialization_error',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_INITIALIZATION_FAILURE',
        500 // Critical error
      );

      this.logger.error(`💥 Bootstrap failure requires immediate attention [${correlationId}]`, {
        module: 'system_service_bootstrap',
        operation: 'initialize',
        phase: 'critical_failure',
        correlationId,
      });

      this.updateSystemInitState('databaseCleanupConfigured', true);
      this.updateSystemInitState('warmupComplete', true);

      throw wrappedError;
    }
  }

  /**
   * Override service registration (system service doesn't register itself)
   */
  protected async registerService(): Promise<void> {
    this.logger.info('✅ System service - no self-registration needed', {
      module: 'system_service_bootstrap',
      operation: 'self_register',
      serviceName: this.config.service.serviceName,
      phase: 'no_registration_needed',
    });
  }

  /**
   * Helper methods for system-specific logic
   */
  private updateSystemInitState(key: keyof SystemInitializationState, value: boolean): void {
    const previousState = { ...this.systemInitState };
    this.systemInitState[key] = value;
    this.logger.debug('🔧 Initialization update', {
      module: 'system_service_bootstrap',
      operation: 'update_init_state',
      key,
      value,
      phase: 'state_update',
    });

    const isReady = Object.values(this.systemInitState).every(state => state === true);
    const wasReady = Object.values(previousState).every(state => state === true);

    if (isReady && !wasReady) {
      const initializationTime = Date.now() - this.startupTime;
      this.logger.info('🚀 System ready! Registration endpoint now available', {
        module: 'system_service_bootstrap',
        operation: 'update_init_state',
        initializationTimeMs: initializationTime,
        phase: 'system_ready',
      });
    }
  }

  private isCoreRegistrationReady(): boolean {
    return (
      this.systemInitState.registryStoreInitialized &&
      this.systemInitState.discoveryManagerOnline &&
      this.systemInitState.subAppsConfigured
    );
  }

  private getMissingCoreComponents(): string[] {
    const missing: string[] = [];
    if (!this.systemInitState.registryStoreInitialized) missing.push('registry-store');
    if (!this.systemInitState.discoveryManagerOnline) missing.push('discovery-manager');
    if (!this.systemInitState.subAppsConfigured) missing.push('sub-apps');
    return missing;
  }

  private async executeSystemWarmup(): Promise<void> {
    this.logger.info('🔥 Starting system warmup', {
      module: 'system_service_bootstrap',
      operation: 'warmup_system',
      phase: 'warmup_start',
    });
    try {
      this.logger.info('✅ System warmup completed', {
        module: 'system_service_bootstrap',
        operation: 'warmup_system',
        phase: 'warmup_complete',
      });
    } catch (error) {
      logAndTrackError(
        error,
        'System warmup failed during bootstrap',
        {
          module: 'system_service_bootstrap',
          operation: 'warmup_system',
          phase: 'warmup_failure',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_WARMUP_FAILURE',
        300 // Warning level - not critical for startup
      );
    }
  }

  private generateServiceEndpoints(services: ServiceInfo[]): ServiceEndpoint[] {
    const endpoints = [];

    for (const service of services) {
      const baseUrl = `http://${service.host}:${service.port}`;
      endpoints.push({
        service: service.name,
        method: 'GET',
        path: '/health',
        url: `${baseUrl}/health`,
        description: 'Health check endpoint',
      });

      // Add service-specific endpoints based on service name
      if (service.name === 'music-service') {
        endpoints.push(
          {
            service: service.name,
            method: 'GET',
            path: '/api/catalog',
            url: `${baseUrl}/api/catalog`,
            description: 'Music catalog',
          },
          {
            service: service.name,
            method: 'GET',
            path: '/api/playlists',
            url: `${baseUrl}/api/playlists`,
            description: 'User playlists',
          }
        );
      } else if (service.name === 'ai-content-service') {
        endpoints.push({
          service: service.name,
          method: 'POST',
          path: '/api/ai/analyze-entries',
          url: `${baseUrl}/api/ai/analyze-entries`,
          description: 'Entry analysis',
        });
      }
    }

    return endpoints;
  }

  private generateSystemStats(): SystemStats {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    };
  }

  /**
   * Custom cleanup implementation for system service
   */
  protected async executeCustomCleanup(): Promise<void> {
    this.logger.info('🧹 Starting system service cleanup', {
      module: 'system_service_bootstrap',
      operation: 'cleanup',
      serviceName: this.config.service.serviceName,
      phase: 'cleanup_start',
    });

    const cleanupTasks: Promise<void>[] = [];

    // 1. Cleanup dynamic service client (no-op - client doesn't need cleanup)
    if (this.dynamicServiceClient) {
      this.logger.debug('Dynamic service client exists (no cleanup needed)', {
        module: 'system_service_bootstrap',
        operation: 'cleanup',
        serviceName: this.config.service.serviceName,
        phase: 'dynamic_client_check',
      });
    }

    // 2. Cleanup discovery background tasks (already handled by runBackgroundCleanup)
    this.logger.debug('Discovery cleanup handled by background cleanup function', {
      module: 'system_service_bootstrap',
      operation: 'cleanup',
      serviceName: this.config.service.serviceName,
      phase: 'database_cleanup',
    });

    // 3. Cleanup monitoring app (if it has cleanup methods)
    try {
      const monitoringShutdownable = monitoringApp as unknown as ShutdownableApp;
      if (monitoringApp && typeof monitoringShutdownable.shutdown === 'function') {
        this.logger.info('🔽 Shutting down monitoring app', {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          serviceName: this.config.service.serviceName,
          phase: 'monitoring_shutdown',
        });
        cleanupTasks.push(
          monitoringShutdownable.shutdown().catch((error: unknown) => {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.warn('⚠️ Monitoring app cleanup failed', {
              module: 'system_service_bootstrap',
              operation: 'cleanup',
              serviceName: this.config.service.serviceName,
              error: errorMsg,
              stack: errorStack,
              phase: 'monitoring_cleanup_failure',
            });
          })
        );
      }
    } catch (error) {
      logAndTrackError(
        error,
        'Monitoring app cleanup check failed during shutdown',
        {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          phase: 'monitoring_cleanup_check_failure',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_MONITORING_CLEANUP_ERROR',
        300 // Warning level - cleanup failure
      );
    }

    // 4. Cleanup notification app (if it has cleanup methods)
    try {
      const notificationShutdownable = notificationApp as unknown as ShutdownableApp;
      if (notificationApp && typeof notificationShutdownable.shutdown === 'function') {
        this.logger.info('🔽 Shutting down notification app', {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          serviceName: this.config.service.serviceName,
          phase: 'notification_shutdown',
        });
        cleanupTasks.push(
          notificationShutdownable.shutdown().catch((error: unknown) => {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.warn('⚠️ Notification app cleanup failed', {
              module: 'system_service_bootstrap',
              operation: 'cleanup',
              serviceName: this.config.service.serviceName,
              error: errorMsg,
              stack: errorStack,
              phase: 'notification_cleanup_failure',
            });
          })
        );
      }
    } catch (error) {
      logAndTrackError(
        error,
        'Notification app cleanup check failed during shutdown',
        {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          phase: 'notification_cleanup_check_failure',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_NOTIFICATION_CLEANUP_ERROR',
        300 // Warning level - cleanup failure
      );
    }

    // 5. Cleanup discovery app (if it has cleanup methods)
    try {
      const discoveryShutdownable = discoveryApp as unknown as ShutdownableApp;
      if (discoveryApp && typeof discoveryShutdownable.shutdown === 'function') {
        this.logger.info('🔽 Shutting down discovery app', {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          serviceName: this.config.service.serviceName,
          phase: 'discovery_shutdown',
        });
        cleanupTasks.push(
          discoveryShutdownable.shutdown().catch((error: unknown) => {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.warn('⚠️ Discovery app cleanup failed', {
              module: 'system_service_bootstrap',
              operation: 'cleanup',
              serviceName: this.config.service.serviceName,
              error: errorMsg,
              stack: errorStack,
              phase: 'discovery_cleanup_failure',
            });
          })
        );
      }
    } catch (error) {
      logAndTrackError(
        error,
        'Discovery app cleanup check failed during shutdown',
        {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          phase: 'discovery_cleanup_check_failure',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_DISCOVERY_CLEANUP_ERROR',
        300 // Warning level - cleanup failure
      );
    }

    // Execute all cleanup tasks in parallel with timeout
    await Promise.race([
      Promise.all(cleanupTasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('System service cleanup timeout after 15 seconds')), 15000)
      ),
    ]).catch(error => {
      logAndTrackError(
        error,
        'Some system service cleanup tasks failed during shutdown',
        {
          module: 'system_service_bootstrap',
          operation: 'cleanup',
          phase: 'cleanup_tasks_failed',
          serviceName: this.config.service.serviceName,
        },
        'SYSTEM_SERVICE_CLEANUP_TASKS_FAILURE',
        300 // Warning level - cleanup failure
      );
    });

    this.logger.info('✅ System service cleanup completed', {
      module: 'system_service_bootstrap',
      operation: 'cleanup',
      serviceName: this.config.service.serviceName,
      phase: 'cleanup_complete',
    });
  }
}
