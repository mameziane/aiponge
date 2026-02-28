// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

// FINAL FIX: Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(15);

// Migrated to use platform-core consistently
import {
  createLogger,
  createOrchestrationBootstrap,
  createStandardHealthManager,
  createMetrics,
  ServiceLocator,
  logAndTrackError,
  SchedulerRegistry,
  ErrorHandlerManager,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
} from '@aiponge/platform-core';

initSentry('system-service');
failFastValidation('system-service');
/**
 * System Service - Refactored with Local Platform Pattern
 * Combines Discovery, Monitoring, and Notification services with sophisticated initialization
 */

import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';
import express from 'express';
import cors from 'cors';
import discoveryApp, { runBackgroundCleanup } from './presentation/routes/discovery.routes';
import monitoringApp from './presentation/routes/monitoring.routes';
import notificationApp from './presentation/routes/notification.routes';
import orchestrationRoutes from './presentation/routes/orchestration.routes';
import configRoutes from './presentation/routes/config.routes';
import dlqRoutes from './presentation/routes/dlq.routes';
import auditRoutes from './presentation/routes/audit.routes';
import { internalAuthMiddleware } from './presentation/middleware/internalAuthMiddleware';
import { ServiceErrors } from './presentation/utils/response-helpers';
import {
  BookReminderScheduler,
  BOOK_REMINDER_QUEUE,
} from './infrastructure/notification/schedulers/BookReminderScheduler';
import { DLQCleanupScheduler } from './infrastructure/queue/DLQCleanupScheduler';
import { MetricsAggregationScheduler } from './infrastructure/jobs/MetricsAggregationScheduler.js';
import { TrackAlarmScheduler, TRACK_ALARM_QUEUE } from './infrastructure/notification/schedulers/TrackAlarmScheduler';
import { QueueManager } from '@aiponge/platform-core';
import { processTrackAlarmJob } from './infrastructure/notification/jobs/trackAlarmProcessor';
import { processBookReminderJob } from './infrastructure/notification/jobs/bookReminderProcessor';

// Configuration
const SERVICE_NAME = 'system-service';

// Initialize structured logger
const logger = createLogger(SERVICE_NAME);

// Register schedulers with centralized registry
SchedulerRegistry.setServiceName(SERVICE_NAME);
const bookReminderScheduler = new BookReminderScheduler();
const trackAlarmScheduler = new TrackAlarmScheduler();
const dlqCleanupScheduler = new DLQCleanupScheduler();
const metricsAggregationScheduler = new MetricsAggregationScheduler();
SchedulerRegistry.register(bookReminderScheduler);
SchedulerRegistry.register(trackAlarmScheduler);
SchedulerRegistry.register(dlqCleanupScheduler);
SchedulerRegistry.register(metricsAggregationScheduler);

/**
 * Start the System Service using shared bootstrap pattern
 */
async function main(): Promise<void> {
  // Initialize ServiceLocator before try block to ensure PORT can be calculated in all paths
  ServiceLocator.initialize();

  // Get port from ServiceLocator after initialization
  const defaultPort = ServiceLocator.getServicePort('system-service');
  const PORT = Number(process.env.PORT || process.env.SYSTEM_SERVICE_PORT || defaultPort);

  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    const serviceMetrics = createMetrics(SERVICE_NAME);

    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0', { metrics: serviceMetrics });

    // Create enhanced orchestration-aware bootstrap
    const bootstrap = createOrchestrationBootstrap(SERVICE_NAME, PORT, {
      registration: {
        capabilities: [
          'service-discovery',
          'system-monitoring',
          'notifications',
          'orchestration-management',
          'health-monitoring',
          'system-coordination',
        ],
        features: {
          serviceDiscovery: 'Network-based service discovery and registration',
          systemMonitoring: 'Comprehensive system monitoring and alerting',
          notifications: 'Multi-channel notification system',
          orchestrationManagement: 'Service orchestration and coordination',
        },
        endpoints: {
          discovery: '/api/discovery',
          monitoring: '/api/monitoring',
          notifications: '/api/notifications',
          orchestration: '/api/orchestration',
        },
      },
    });

    logger.info('🚀 Starting System Service...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Start the service with platform-core bootstrap
    await bootstrap.start({
      healthManager,
      customMiddleware: (app: express.Application) => {
        if (isSentryInitialized()) {
          app.use(createSentryCorrelationMiddleware());
        }
      },
      customRoutes: (app: express.Application) => {
        app.use('/api/discovery', discoveryApp);
        app.use('/api/monitoring', monitoringApp);
        app.use('/api/notifications', notificationApp);
        app.use('/api/orchestration', orchestrationRoutes);
        app.use('/api/config', configRoutes);
        app.use('/api/dlq', internalAuthMiddleware, dlqRoutes);
        app.use('/api/audit', internalAuthMiddleware, auditRoutes);

        app.delete('/api/users/:userId/data', async (req: express.Request, res: express.Response) => {
          try {
            const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
            if (internalSecret) {
              const authHeader = req.headers['x-service-auth'] || req.headers['x-internal-secret'];
              if (authHeader !== internalSecret) {
                ServiceErrors.forbidden(res, 'Internal service auth required', req);
                return;
              }
            }
            const userId = req.params.userId as string;
            const { getDatabase } = await import('./infrastructure/database/DatabaseConnectionFactory');
            const { eq } = await import('drizzle-orm');
            const { notifications, sysAuditLog } = await import('./schema/system-schema');
            const db = getDatabase('system-service');

            await db.delete(notifications).where(eq(notifications.userId, userId as string));
            await db.delete(sysAuditLog).where(eq(sysAuditLog.actorId, userId as string));

            logger.info('GDPR: System service user data deletion completed', { userId });
            res.json({ success: true, message: 'User system data deleted' });
          } catch (error) {
            logger.error('GDPR: System service user data deletion failed', {
              userId: req.params.userId,
              error: error instanceof Error ? error.message : String(error),
            });
            ServiceErrors.internal(res, 'Failed to delete user system data', undefined, req);
          }
        });

        setupSentryErrorHandler(app as unknown as import('express').Express);
      },
      beforeStart: async () => {
        logger.debug('🔍 Initializing system service dependencies...');
      },
      afterStart: async () => {
        contractRegistry.register({ name: 'system-service-api', version: CURRENT_CONTRACT_VERSION, deprecated: false });
        logger.debug('📍 System service registration and coordination completed');
        // Run database cleanup in background (non-blocking)
        void runBackgroundCleanup();

        // Initialize BullMQ QueueManager and register job processors
        QueueManager.init();
        if (QueueManager.isInitialized()) {
          // Register DLQ handler for persistent dead letter queue
          const { dlqService } = await import('./infrastructure/queue/DLQService');
          dlqService.setMetricsInstance(serviceMetrics);
          QueueManager.setDLQHandler(dlqService.createDLQHandler());

          QueueManager.registerQueue(TRACK_ALARM_QUEUE, processTrackAlarmJob);
          QueueManager.registerQueue(BOOK_REMINDER_QUEUE, processBookReminderJob);

          SchedulerRegistry.onShutdown(() => QueueManager.shutdown());

          logger.debug('BullMQ queues registered', {
            queues: QueueManager.getQueueNames(),
          });
        } else {
          const isProduction = process.env.NODE_ENV === 'production';
          logger[isProduction ? 'warn' : 'debug'](
            'QueueManager not initialized (REDIS_URL missing?), schedulers will use direct execution fallback'
          );
        }

        // Start all registered schedulers via centralized registry
        SchedulerRegistry.startAll();
        logger.debug('All schedulers started via SchedulerRegistry', {
          schedulerCount: SchedulerRegistry.getAllInfo().length,
        });
      },
    });

    logger.info('✅ Successfully started System Service with platform-core bootstrap', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'startup_complete',
      healthManager: 'integrated',
      orchestrationEnabled: true,
    });

    setupGracefulShutdown(bootstrap.getServer());
    registerShutdownHook(async () => {
      logger.info('Shutting down schedulers and queues...');
      await SchedulerRegistry.shutdownAll();
      logger.info('Scheduler and queue shutdown complete');
      logger.info('Closing database connections...');
      const { closeAllDatabaseConnections } = await import('./infrastructure/database/DatabaseConnectionFactory');
      await closeAllDatabaseConnections();
      logger.info('Database connections closed successfully');
    });
  } catch (error) {
    const { correlationId } = logAndTrackError(
      error,
      `System service startup failed - critical infrastructure unavailable`,
      {
        module: 'system_service_main',
        operation: 'main',
        phase: 'startup_failure',
        serviceName: SERVICE_NAME,
        port: String(PORT),
      },
      'SYSTEM_SERVICE_STARTUP_FAILURE',
      500 // Critical error
    );

    logger.error(`💥 Exiting due to startup failure [${correlationId}]`, {
      service: SERVICE_NAME,
      phase: 'process_exit',
      correlationId,
    });
    process.exit(1);
  }
}

/**
 * ✅ Global error handlers now managed centrally by platform-core bootstrap
 * This eliminates EventEmitter memory leak warnings from duplicate registrations
 */
function logGlobalErrorHandlingStatus(): void {
  logger.debug('✅ Global error handlers managed by platform-core', {
    service: SERVICE_NAME,
    phase: 'error_handling_setup',
    handlers: 'centralized',
  });
}

// Error handlers now managed by platform-core bootstrap
logGlobalErrorHandlingStatus();

// Start the service
main().catch(error => {
  const { correlationId } = logAndTrackError(
    error,
    `Unhandled system service startup error - emergency shutdown`,
    {
      module: 'system_service_main',
      operation: 'main_catch',
      phase: 'unhandled_error',
      serviceName: SERVICE_NAME,
    },
    'SYSTEM_SERVICE_UNHANDLED_STARTUP_ERROR',
    500 // Critical error
  );

  logger.error(`💀 Emergency shutdown [${correlationId}]`, {
    service: SERVICE_NAME,
    phase: 'emergency_exit',
    correlationId,
  });
  process.exit(1);
});
