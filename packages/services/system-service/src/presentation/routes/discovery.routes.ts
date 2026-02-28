/**
 * Discovery Domain Router
 * Handles service registration, health monitoring, and service lookup
 */

import * as express from 'express';
import * as crypto from 'crypto';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { ServiceDependencyOrchestrator } from '../../domains/discovery/services/ServiceDependencyOrchestrator';
import { DatabaseServiceRepository } from '../../infrastructure/discovery/DatabaseServiceRepository';
import { createStartupOptimizationRouter } from '../../startup/StartupOptimizationRouter';
import { OptimizedStartupManager } from '../../startup/OptimizedStartupManager';
import { getEnvironmentSettings } from '../../config/environment-settings';
import {
  HEALTH_STATUS,
  RegisterServiceSchema,
  HeartbeatSchema,
  BatchedHeartbeatSchema,
} from '@aiponge/shared-contracts';
import { serializeError, errorMessage, errorStack, createIntervalScheduler } from '@aiponge/platform-core';

export type DiscoveryInstanceStatus =
  | typeof HEALTH_STATUS.HEALTHY
  | typeof HEALTH_STATUS.UNHEALTHY
  | typeof HEALTH_STATUS.UNKNOWN;

const router: express.Router = express.Router();

// Initialize structured logger
const logger = getLogger('system-service-discovery');

// Service registry with database persistence
interface ServiceDependency {
  name: string;
  type: 'hard' | 'soft';
  timeout?: number;
  healthCheck?: string;
  isRequired?: boolean;
}

interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  healthEndpoint: string;
  lastHeartbeat: Date;
  status: DiscoveryInstanceStatus;
  metadata?: Record<string, unknown>;
  dependencies?: ServiceDependency[];
}

// Lazy-initialize database repository to avoid blocking during module import
let serviceRepository: DatabaseServiceRepository | null = null;
const getServiceRepository = () => {
  if (!serviceRepository) {
    serviceRepository = new DatabaseServiceRepository();
  }
  return serviceRepository;
};

const serviceRegistry = new Map<string, ServiceInstance>();
const dependencyOrchestrator = new ServiceDependencyOrchestrator(
  serviceRegistry as unknown as Map<
    string,
    import('../../domains/discovery/services/ServiceDependencyOrchestrator').ServiceRegistryEntry
  >
);

const startupManager = new OptimizedStartupManager(
  serviceRegistry as unknown as Map<
    string,
    import('../../domains/discovery/services/ServiceDependencyOrchestrator').ServiceRegistryEntry
  >
);

// Export function to initialize database and run cleanup after service is ready
export async function runBackgroundCleanup(): Promise<void> {
  try {
    // Initialize database connection and start health checking IMMEDIATELY
    // This ensures health endpoint works right away (no 2-second delay)
    const repo = getServiceRepository();

    // Warm up connection asynchronously without blocking
    repo.warmConnection().catch(err => {
      logger.error('Database warmup failed', { error: err });
    });

    // Start health checking immediately
    repo.startHealthChecking();

    // Defer the actual cleanup work to avoid blocking
    setTimeout(async () => {
      try {
        const cleanedCount = await repo.cleanupStaleServices();
        if (cleanedCount > 0) {
          logger.info('🧹 Background cleanup: Removed stale services from database', {
            component: 'service_discovery',
            cleanedCount,
            phase: 'background_cleanup',
          });
        }
      } catch (error) {
        logger.error('⚠️ Background cleanup failed', {
          component: 'service_discovery',
          phase: 'background_cleanup_failure',
          error: serializeError(error),
        });
      }
    }, 2000); // Defer cleanup, but connection is already established
  } catch (error) {
    logger.error('⚠️ Failed to initialize database repository', {
      component: 'service_discovery',
      error: serializeError(error),
    });
  }
}

// Routes
router.get('/health', (req, res) => {
  res.json({
    status: HEALTH_STATUS.HEALTHY,
    service: 'discovery-domain',
    timestamp: new Date().toISOString(),
    registeredServices: serviceRegistry.size,
  });
});

// Register a service
router.post('/services/register', async (req, res) => {
  try {
    const serviceData = RegisterServiceSchema.parse(req.body);

    // Check for existing service with same name and host to prevent duplicates
    const existingServices = await getServiceRepository().getAllServices();
    const existingService = existingServices.find(
      s => s.name === serviceData.name && s.host === serviceData.host && s.port === serviceData.port
    );

    let serviceId: string;
    if (existingService) {
      // Update existing service instead of creating duplicate
      serviceId = existingService.id;
      logger.info('🔄 Updating existing service', {
        component: 'service_discovery',
        serviceName: serviceData.name,
        phase: 'service_update',
      });
    } else {
      // Create new service
      serviceId = crypto.randomUUID();
      logger.info('🆕 Registering new service', {
        component: 'service_discovery',
        serviceName: serviceData.name,
        phase: 'service_registration',
      });
    }

    const parsedDependencies: ServiceDependency[] = (serviceData.dependencies || []).map(d => ({
      name: d.name,
      type: d.type || 'soft',
      timeout: d.timeout,
      healthCheck: d.healthCheck,
      isRequired: d.isRequired !== false,
    }));

    const service: ServiceInstance = {
      id: serviceId,
      name: serviceData.name,
      host: serviceData.host,
      port: serviceData.port,
      healthEndpoint: serviceData.healthEndpoint,
      lastHeartbeat: new Date(),
      status: HEALTH_STATUS.HEALTHY,
      metadata: serviceData.metadata,
      dependencies: parsedDependencies,
    };

    // Save to database first, then to memory registry
    getServiceRepository()
      .registerService({
        id: serviceId,
        name: service.name,
        host: service.host,
        port: service.port,
        status: HEALTH_STATUS.HEALTHY,
        version: (service.metadata?.version as string) || 'unknown',
        metadata: service.metadata,
        dependencies: service.dependencies,
      })
      .catch(error => {
        logger.error('❌ Failed to save service to database', {
          component: 'service_discovery',
          serviceId,
          error: serializeError(error),
          ...(process.env.NODE_ENV !== 'production' && {
            stack: error instanceof Error ? error.stack : undefined,
          }),
          phase: 'database_save_failure',
        });
      });

    serviceRegistry.set(serviceId, service);

    // Rebuild dependency graph after registration
    dependencyOrchestrator.buildDependencyGraph();

    logger.info('🔗 Service registered', {
      component: 'service_discovery',
      serviceId,
      phase: 'registration_complete',
    });

    // Log dependency information if present
    if (service.dependencies && service.dependencies.length > 0) {
      logger.info('🔗 Service dependencies registered', {
        component: 'service_discovery',
        serviceId,
        dependencies: service.dependencies.map(d => ({
          name: d.name,
          type: d.type,
        })),
        phase: 'dependency_registration',
      });
    }

    // Construct health URL for the registered service
    const healthUrl = `http://${service.host}:${service.port}${service.healthEndpoint}`;

    // Prepare resolved dependencies for response
    const resolvedDependencies =
      service.dependencies?.map(dep => ({
        name: dep.name,
        type: dep.type,
        timeout: dep.timeout,
        healthCheck: dep.healthCheck,
      })) || [];

    sendCreated(res, {
      serviceId,
      status: 'registered',
      dependencies: resolvedDependencies,
      healthUrl,
      message: 'Service registered successfully',
      serviceInfo: {
        name: service.name,
        host: service.host,
        port: service.port,
        version: (service.metadata?.version as string) || 'unknown',
        registeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('❌ Registration error', {
      module: 'service_discovery',
      operation: 'register_service',
      error: serializeError(error),
      stack: error instanceof Error ? error.stack : undefined,
      phase: 'registration_failure',
    });
    ServiceErrors.badRequest(res, error instanceof Error ? error.message : 'Invalid service data', req);
  }
});

// Deregister a service
router.delete('/services/:serviceId', (req, res) => {
  try {
    const { serviceId } = req.params;

    if (serviceRegistry.has(serviceId)) {
      // Remove from database
      getServiceRepository()
        .registerService({
          id: serviceId,
          name: 'deleted',
          host: 'deleted',
          port: 0,
          status: HEALTH_STATUS.UNHEALTHY,
          version: 'deleted',
          metadata: {},
          dependencies: [],
        })
        .catch((error: unknown) => {
          logger.error('❌ Failed to update service in database', {
            module: 'service_discovery',
            operation: 'deregister_service',
            serviceId,
            error: serializeError(error),
            ...(process.env.NODE_ENV !== 'production' && {
              stack: error instanceof Error ? error.stack : undefined,
            }),
            phase: 'database_update_failure',
          });
        });

      serviceRegistry.delete(serviceId);
      logger.info('🗑️ Service deregistered', {
        module: 'service_discovery',
        operation: 'deregister_service',
        serviceId,
        phase: 'deregistration_complete',
      });

      sendSuccess(res, {
        message: 'Service deregistered successfully',
      });
    } else {
      ServiceErrors.notFound(res, 'Service', req);
    }
  } catch (error) {
    logger.error('❌ Deregistration error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to deregister service', req);
    return;
  }
});

// Get all services
router.get('/services', (req, res) => {
  const services = Array.from(serviceRegistry.values());
  sendSuccess(res, {
    services,
    count: services.length,
  });
});

// Get services by name
router.get('/services/:serviceName', (req, res) => {
  const { serviceName } = req.params;
  const services = Array.from(serviceRegistry.values()).filter(service => service.name === serviceName);

  sendSuccess(res, {
    services,
    count: services.length,
  });
});

// Resolve service URL by name (for dependency management)
router.get('/services/resolve/:serviceName', (req, res) => {
  const { serviceName } = req.params;

  // Find the first healthy service with the given name
  const service = Array.from(serviceRegistry.values()).find(
    s => s.name === serviceName && s.status === HEALTH_STATUS.HEALTHY
  );

  if (service) {
    const serviceUrl = `http://${service.host}:${service.port}`;
    sendSuccess(res, {
      serviceName: service.name,
      url: serviceUrl,
      status: service.status,
      lastHeartbeat: service.lastHeartbeat,
    });
  } else {
    // Check if service exists but is unhealthy
    const existingService = Array.from(serviceRegistry.values()).find(s => s.name === serviceName);

    if (existingService) {
      ServiceErrors.serviceUnavailable(
        res,
        `Service ${serviceName} is registered but currently ${existingService.status}`,
        req
      );
    } else {
      ServiceErrors.notFound(res, 'Service', req);
    }
  }
});

// Send heartbeat
router.post('/services/heartbeat', (req, res) => {
  try {
    const heartbeatData = HeartbeatSchema.parse(req.body);

    const service = serviceRegistry.get(heartbeatData.serviceId);
    if (service) {
      service.lastHeartbeat = new Date();
      service.status = 'healthy';

      // Update database heartbeat
      getServiceRepository()
        .updateHeartbeat(heartbeatData.serviceId)
        .catch(error => {
          logger.error('❌ Failed to update heartbeat in database', {
            module: 'service_discovery',
            operation: 'heartbeat',
            serviceId: heartbeatData.serviceId,
            error: serializeError(error),
            ...(process.env.NODE_ENV !== 'production' && {
              stack: error instanceof Error ? error.stack : undefined,
            }),
            phase: 'database_update_failure',
          });
        });

      logger.debug('💓 Heartbeat received', {
        module: 'service_discovery',
        operation: 'heartbeat',
        serviceId: heartbeatData.serviceId,
        phase: 'heartbeat_received',
      });

      sendSuccess(res, {
        message: 'Heartbeat received',
      });
    } else {
      ServiceErrors.notFound(res, 'Service', req);
    }
  } catch (error) {
    logger.error('❌ Heartbeat error', {
      module: 'service_discovery',
      operation: 'heartbeat',
      error: serializeError(error),
      stack: error instanceof Error ? error.stack : undefined,
      phase: 'heartbeat_failure',
    });
    ServiceErrors.badRequest(res, error instanceof Error ? error.message : 'Invalid heartbeat data', req);
  }
});

// Optimized: Batched heartbeat endpoint for multiple services
function processBatchServiceHeartbeat(
  serviceData: { serviceId?: string; timestamp?: string | number },
  batchTimestamp: Date,
  processedServices: string[],
  failedServices: Array<{ serviceId: string; error: string }>,
  serviceIdsToUpdate: string[]
): void {
  if (!serviceData.serviceId) return;
  try {
    const service = serviceRegistry.get(serviceData.serviceId);

    if (service) {
      const heartbeatTime = serviceData.timestamp ? new Date(serviceData.timestamp) : batchTimestamp;
      service.lastHeartbeat = heartbeatTime;
      service.status = 'healthy';
      processedServices.push(serviceData.serviceId);
      serviceIdsToUpdate.push(serviceData.serviceId);
    } else {
      failedServices.push({
        serviceId: serviceData.serviceId,
        error: 'Service not found in registry',
      });
    }
  } catch (serviceError) {
    failedServices.push({
      serviceId: serviceData.serviceId,
      error: serviceError instanceof Error ? serviceError.message : 'Unknown processing error',
    });
  }
}

async function updateBatchHeartbeatsInDb(serviceIdsToUpdate: string[], batchTimestamp: Date): Promise<void> {
  if (serviceIdsToUpdate.length === 0) return;

  try {
    await getServiceRepository().updateBatchHeartbeats(serviceIdsToUpdate, batchTimestamp);
    logger.info('✅ Batch heartbeat updated services', {
      module: 'service_discovery',
      operation: 'batch_heartbeat',
      updatedCount: serviceIdsToUpdate.length,
      phase: 'database_update_success',
    });
  } catch (dbError) {
    logger.error('❌ Batch database update failed', {
      module: 'service_discovery',
      operation: 'batch_heartbeat',
      error: dbError instanceof Error ? dbError.message : String(dbError),
      stack: dbError instanceof Error ? dbError.stack : undefined,
      phase: 'database_update_failure',
    });
  }
}

router.post('/services/heartbeat/batch', async (req, res) => {
  try {
    const batchData = BatchedHeartbeatSchema.parse(req.body);
    const batchTimestamp = new Date(batchData.batchTimestamp || Date.now());

    logger.info('📦 Processing batched heartbeat', {
      module: 'service_discovery',
      operation: 'batch_heartbeat',
      serviceCount: batchData.services.length,
      phase: 'batch_processing_start',
    });

    const processedServices: string[] = [];
    const failedServices: Array<{ serviceId: string; error: string }> = [];
    const serviceIdsToUpdate: string[] = [];

    for (const serviceData of batchData.services) {
      processBatchServiceHeartbeat(serviceData, batchTimestamp, processedServices, failedServices, serviceIdsToUpdate);
    }

    await updateBatchHeartbeatsInDb(serviceIdsToUpdate, batchTimestamp);

    if (processedServices.length > 0) {
      logger.info('💓 Batch heartbeat processed', {
        module: 'service_discovery',
        operation: 'batch_heartbeat',
        processedServices,
        serviceCount: processedServices.length,
        phase: 'batch_processing_complete',
      });
    }

    const response = {
      message: `Batch heartbeat processed: ${processedServices.length} successful, ${failedServices.length} failed`,
      results: {
        processed: processedServices.length,
        failed: failedServices.length,
        total: batchData.services.length,
      },
      ...(failedServices.length > 0 && { failures: failedServices }),
    };

    sendSuccess(res, response);
  } catch (error) {
    logger.error('❌ Batch heartbeat error', {
      module: 'service_discovery',
      operation: 'batch_heartbeat',
      error: serializeError(error),
      stack: error instanceof Error ? error.stack : undefined,
      phase: 'batch_heartbeat_failure',
    });
    ServiceErrors.badRequest(res, error instanceof Error ? error.message : 'Invalid batch heartbeat data', req);
  }
});

// Dependency management endpoints

// Get dependency graph
router.get('/dependencies/graph', (req, res) => {
  try {
    dependencyOrchestrator.buildDependencyGraph();
    const graph = dependencyOrchestrator.getGraphVisualization();
    const stats = dependencyOrchestrator.getStatistics();
    const cycles = dependencyOrchestrator.detectCircularDependencies();

    sendSuccess(res, {
      graph,
      statistics: stats,
      circularDependencies: cycles,
      hasCircularDependencies: cycles.length > 0,
    });
  } catch (error) {
    logger.error('❌ Failed to get dependency graph', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to get dependency graph', req);
    return;
  }
});

// Get startup order
router.get('/dependencies/startup-order', (req, res) => {
  try {
    dependencyOrchestrator.buildDependencyGraph();
    const startupOrder = dependencyOrchestrator.getStartupOrder();
    const cycles = dependencyOrchestrator.detectCircularDependencies();

    sendSuccess(res, {
      startupOrder,
      totalWaves: startupOrder.length,
      hasCircularDependencies: cycles.length > 0,
      circularDependencies: cycles,
    });
  } catch (error) {
    logger.error('❌ Failed to get startup order', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get startup order', req);
    return;
  }
});

// Validate service dependencies
router.get('/dependencies/validate/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    dependencyOrchestrator.buildDependencyGraph();

    const validation = await dependencyOrchestrator.validateServiceDependencies(serviceName);

    sendSuccess(res, {
      serviceName,
      validation,
    });
  } catch (error) {
    logger.error('❌ Failed to validate dependencies', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to validate dependencies', req);
    return;
  }
});

// Get services ready to start
router.get('/dependencies/ready-to-start', (req, res) => {
  try {
    dependencyOrchestrator.buildDependencyGraph();
    const readyServices = dependencyOrchestrator.getReadyToStartServices();

    sendSuccess(res, {
      readyToStart: readyServices,
      count: readyServices.length,
    });
  } catch (error) {
    logger.error('❌ Failed to get ready services', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get ready services', req);
    return;
  }
});

// Update service dependency status
router.post('/dependencies/update-status', (req, res) => {
  try {
    const { serviceName, status, error } = req.body;

    if (!serviceName || !status) {
      ServiceErrors.badRequest(res, 'serviceName and status are required', req);
      return;
    }

    dependencyOrchestrator.updateServiceStatus(serviceName, status, error);

    sendSuccess(res, {
      message: `Status updated for ${serviceName}: ${status}`,
    });
  } catch (error) {
    logger.error('❌ Failed to update service status', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to update service status', req);
    return;
  }
});

// Automatic network discovery trigger
router.post('/scan', async (req, res) => {
  try {
    logger.info('🔍 Triggering automatic network scan', {
      module: 'service_discovery',
      operation: 'network_scan',
      phase: 'scan_triggered',
    });

    // Import the NetworkScanner and trigger discovery
    const { NetworkScanner } = await import('../../infrastructure/discovery/NetworkScanner');
    const scanner = new NetworkScanner();

    const discoveredServices = await scanner.discoverServices();

    // Register discovered services automatically
    let registeredCount = 0;
    for (const service of discoveredServices) {
      const serviceId = `${service.name}-${service.host}-${service.port}`;

      const serviceInstance: ServiceInstance = {
        id: serviceId,
        name: service.name,
        host: service.host,
        port: service.port,
        healthEndpoint: '/health',
        lastHeartbeat: new Date(),
        status: 'healthy',
        metadata: { discoveredAutomatically: true, capabilities: service.capabilities },
      };

      serviceRegistry.set(serviceId, serviceInstance);
      registeredCount++;
      logger.info('🔗 Service auto-registered', {
        module: 'service_discovery',
        operation: 'network_scan',
        serviceId,
        phase: 'auto_registration_success',
      });
    }

    sendSuccess(res, {
      message: `Network scan completed`,
      discovered: discoveredServices.length,
      registered: registeredCount,
      services: discoveredServices.map(s => ({ name: s.name, host: s.host, port: s.port })),
    });
  } catch (error) {
    logger.error('❌ Network scan failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Network scan failed', req);
    return;
  }
});

// Health monitoring for registered services
async function performHealthChecks(): Promise<void> {
  // TypeScript optimized
  logger.debug('🔍 Performing health checks', {
    module: 'service_discovery',
    operation: 'health_check',
    serviceCount: serviceRegistry.size,
    phase: 'health_check_start',
  });

  for (const [serviceId, service] of Array.from(serviceRegistry.entries())) {
    try {
      const healthUrl = `http://${service.host}:${service.port}${service.healthEndpoint || '/health'}`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        service.status = 'healthy';
        service.lastHeartbeat = new Date();
      } else {
        service.status = 'unhealthy';
      }
    } catch (error) {
      service.status = 'unhealthy';
      logger.warn('⚠️ Health check failed', {
        module: 'service_discovery',
        operation: 'health_check',
        serviceId,
        error: errorMessage(error),
        ...(process.env.NODE_ENV !== 'production' && {
          stack: errorStack(error),
        }),
        phase: 'health_check_failure',
      });
    }

    serviceRegistry.set(serviceId, service);
  }
}

// Start health monitoring with environment-specific intervals
const envSettings = getEnvironmentSettings();

// Register schedulers with the registry — they will be started by SchedulerRegistry.startAll() in main.ts
// Do NOT call .start() here to avoid double-init
createIntervalScheduler({
  name: 'discovery-health-check',
  serviceName: 'system-service',
  intervalMs: envSettings.healthCheckInterval,
  handler: () => performHealthChecks(),
  runOnStart: true,
});

createIntervalScheduler({
  name: 'stale-service-cleanup',
  serviceName: 'system-service',
  intervalMs: envSettings.staleServiceCleanupInterval,
  handler: () => {
    const now = new Date();
    const staleThreshold = envSettings.staleServiceThreshold;
    for (const [serviceId, service] of Array.from(serviceRegistry.entries())) {
      const timeSinceHeartbeat = now.getTime() - (service.lastHeartbeat?.getTime() || 0);
      if (timeSinceHeartbeat > staleThreshold) {
        logger.info('Removing stale service', {
          module: 'service_discovery',
          operation: 'cleanup_stale_services',
          serviceId,
          phase: 'stale_service_removal',
        });
        serviceRegistry.delete(serviceId);
      }
    }
  },
});

// Mount startup optimization router
const startupOptimizationRouter = createStartupOptimizationRouter(
  startupManager,
  dependencyOrchestrator,
  serviceRegistry
);
router.use('/startup', startupOptimizationRouter);

export default router;
