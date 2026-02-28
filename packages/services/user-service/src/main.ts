import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import {
  getServicePort,
  SchedulerRegistry,
  createLogger,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  QueueManager,
  initAuditService,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
} from '@aiponge/platform-core';

initSentry('user-service');
failFastValidation('user-service');
import routes from './presentation/routes/index';
import './infrastructure/schedulers/MigrationRetryScheduler';
import './infrastructure/schedulers/OrphanedReservationCleanupScheduler';
import './infrastructure/schedulers/StaleBookGenerationCleanupScheduler';
import { ORPHANED_RESERVATION_CLEANUP_QUEUE } from './infrastructure/schedulers/OrphanedReservationCleanupScheduler';
import { MIGRATION_RETRY_QUEUE } from './infrastructure/schedulers/MigrationRetryScheduler';
import { processOrphanedReservationCleanupJob } from './infrastructure/jobs/orphanedReservationCleanupProcessor';
import { processMigrationRetryJob } from './infrastructure/jobs/migrationRetryProcessor';
import './infrastructure/jobs/PatternAnalysisJob';
import { DatabaseConnectionFactory, getDatabase, createDrizzleRepository } from './infrastructure/database/DatabaseConnectionFactory';
import { DrizzleAuditPersister } from './infrastructure/audit/DrizzleAuditPersister.js';
import * as userSchema from './infrastructure/database/schemas/user-schema';
import * as profileSchema from './infrastructure/database/schemas/profile-schema';
import * as creatorMemberSchema from './infrastructure/database/schemas/creator-member-schema';
import { BookGenerationRepository } from './infrastructure/repositories/BookGenerationRepository';

const logger = createLogger('user-service');

async function validateSchemaAtStartup(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    const { validateSchema } = await import('@aiponge/platform-core');
    const sql = DatabaseConnectionFactory.getInstance().getSQLConnection();
    const schema = { ...userSchema, ...profileSchema, ...creatorMemberSchema };

    const validationResult = await validateSchema({
      serviceName: 'user-service',
      schema,
      sql: sql as unknown as Parameters<typeof validateSchema>[0]['sql'],
      failOnMismatch: false,
    });
    if (!validationResult.success) {
      logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
    }
  } catch (error) {
    logger.error('Schema validation error', { error: error instanceof Error ? error.message : String(error) });
  }
}

logger.info('Starting user-service...', {
  databaseUrlAvailable: !!process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
});

const app = express();
const port = getServicePort('user-service') || 3003;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : process.env.NODE_ENV === 'production'
        ? ['https://aiponge.com']
        : '*',
    credentials: process.env.CORS_CREDENTIALS !== 'false',
  })
);
app.use(compression());
if (isSentryInitialized()) {
  app.use(createSentryCorrelationMiddleware());
}

// Early request logging to debug timeout issues
app.use((req, res, next) => {
  const start = Date.now();
  logger.debug('Request started', { method: req.method, path: req.path, elapsed: 0 });

  res.on('finish', () => {
    logger.debug('Request completed', {
      method: req.method,
      path: req.path,
      elapsed: Date.now() - start,
      statusCode: res.statusCode,
    });
  });

  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api', routes);

// Kubernetes-compatible health probes
const startTime = Date.now();
const getUptime = () => Math.floor((Date.now() - startTime) / 1000);

// GET /health/live - Liveness probe
app.get('/health/live', (req, res) => {
  res.status(200).json({
    alive: true,
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
  });
});

// GET /health/ready - Readiness probe
app.get('/health/ready', (req, res) => {
  res.status(200).json({
    ready: true,
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
    components: {
      modules: { healthy: true, list: ['auth', 'profile', 'intelligence'] },
    },
  });
});

// GET /health/startup - Startup probe
app.get('/health/startup', (req, res) => {
  res.status(200).json({
    started: true,
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
  });
});

// GET /health - Detailed health check
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'user-service',
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
    memory: process.memoryUsage(),
    modules: ['auth', 'profile', 'intelligence'],
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'user-service',
    version: '1.0.0',
    description: 'Unified service for user authentication, profiles, and intelligence',
    modules: {
      auth: 'User authentication and account management',
      profile: 'User profile management and metrics',
      intelligence: 'Etries, insights, and reflections',
    },
  });
});

setupSentryErrorHandler(app);

// Start server with schema validation
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  await initTracing({ serviceName: 'user-service', serviceVersion: '1.0.0' });

  await validateSchemaAtStartup();

  const db = getDatabase();
  const auditPersister = new DrizzleAuditPersister(db as unknown as ConstructorParameters<typeof DrizzleAuditPersister>[0]);
  initAuditService(auditPersister);
  logger.debug('Audit service initialized with DrizzleAuditPersister');

  try {
    const bookGenRepo = createDrizzleRepository(BookGenerationRepository);
    const interrupted = await bookGenRepo.markInterruptedRequestsAsFailed();
    if (interrupted > 0) {
      logger.info('Startup cleanup: marked interrupted generation requests as failed', { count: interrupted });
    }
  } catch (cleanupError) {
    logger.warn('Startup cleanup for generation requests failed (non-fatal)', {
      error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }

  // Warm up the database connection pool so the first user request never hits a cold Neon connection
  try {
    const dbFactory = DatabaseConnectionFactory.getInstance();
    const warmup = await dbFactory.healthCheck();
    logger.info('Database connection warmed up', { latencyMs: warmup.latencyMs, status: warmup.status });
  } catch (warmupError) {
    logger.warn('Database warmup failed (non-fatal, will retry on first request)', {
      error: warmupError instanceof Error ? warmupError.message : String(warmupError),
    });
  }

  server = app.listen(port, '0.0.0.0', () => {
    logger.info('User Service started', { port });
    logger.info('Modules loaded', { modules: ['Auth', 'Profile', 'Intelligence'] });
    logger.info('Health endpoint available', { url: `http://localhost:${port}/health` });

    QueueManager.init();
    if (QueueManager.isInitialized()) {
      QueueManager.registerQueue(ORPHANED_RESERVATION_CLEANUP_QUEUE, processOrphanedReservationCleanupJob);
      QueueManager.registerQueue(MIGRATION_RETRY_QUEUE, processMigrationRetryJob);

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
    SchedulerRegistry.setServiceName('user-service');
    SchedulerRegistry.startAll();
    logger.debug('Schedulers started via SchedulerRegistry', {
      schedulerCount: SchedulerRegistry.getAllInfo().length,
    });

    setupGracefulShutdown(server);
    registerShutdownHook(async () => {
      SchedulerRegistry.stopAll();
      const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
      await DatabaseConnectionFactory.close();
    });
  });

  // Configure server timeouts (Node.js defaults cause 60-second timeout)
  server.timeout = 120000; // 2 minutes
  server.keepAliveTimeout = 65000; // 65 seconds
  server.headersTimeout = 70000; // 70 seconds (must be > keepAliveTimeout)

  return server;
}

startServer().catch(err => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

export default app;
