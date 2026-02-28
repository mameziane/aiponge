/**
 * API Gateway Entry Point
 * Main entry point for the API Gateway service with cluster support for multi-core scaling
 */

// Fix EventEmitter warnings - increase max listeners
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 50;

import cluster from 'cluster';
import os from 'os';
import { startServer } from './server';
import { getLogger } from './config/service-urls';

const logger = getLogger('api-gateway-index');

// SCALABILITY: Cluster configuration for multi-core utilization
// - In production: Uses all available CPU cores (or CLUSTER_WORKERS env var)
// - In development: Single worker for easier debugging
// - Set CLUSTER_WORKERS=1 to disable clustering
const getWorkerCount = (): number => {
  if (process.env.CLUSTER_WORKERS) {
    const configured = parseInt(process.env.CLUSTER_WORKERS, 10);
    if (!isNaN(configured) && configured > 0) {
      return configured;
    }
    if (process.env.CLUSTER_WORKERS === 'auto') {
      return os.cpus().length;
    }
  }
  // Default: production uses all cores, development uses 1
  return process.env.NODE_ENV === 'production' ? os.cpus().length : 1;
};

const numWorkers = getWorkerCount();
const clusteringEnabled = numWorkers > 1;

// Shutdown state to prevent worker respawning during graceful shutdown
let isShuttingDown = false;

if (clusteringEnabled && cluster.isPrimary) {
  // Primary process: Fork workers and manage cluster
  logger.info(`🔀 API Gateway cluster mode enabled - spawning ${numWorkers} workers`, {
    module: 'api_gateway_cluster',
    operation: 'cluster_init',
    numWorkers,
    cpuCount: os.cpus().length,
    phase: 'primary_starting',
  });

  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Handle worker exit - auto-restart for resilience (except during shutdown)
  cluster.on('exit', (worker, code, signal) => {
    if (isShuttingDown) {
      logger.info(`Worker ${worker.process.pid} exited during shutdown`, {
        module: 'api_gateway_cluster',
        operation: 'worker_exit',
        workerId: worker.id,
        workerPid: worker.process.pid,
        exitCode: code,
        signal,
        phase: 'shutdown_worker_exit',
      });

      // Check if all workers have exited
      const remainingWorkers = Object.keys(cluster.workers || {}).length;
      if (remainingWorkers === 0) {
        logger.info('✅ All workers exited, shutting down primary', {
          module: 'api_gateway_cluster',
          operation: 'cluster_shutdown',
          phase: 'shutdown_complete',
        });
        process.exit(0);
      }
      return;
    }

    logger.warn(`⚠️ Worker ${worker.process.pid} died (${signal || code}), restarting...`, {
      module: 'api_gateway_cluster',
      operation: 'worker_exit',
      workerId: worker.id,
      workerPid: worker.process.pid,
      exitCode: code,
      signal,
      phase: 'worker_restart',
    });
    cluster.fork();
  });

  // Log when workers come online
  cluster.on('online', worker => {
    logger.info(`✅ Worker ${worker.process.pid} is online`, {
      module: 'api_gateway_cluster',
      operation: 'worker_online',
      workerId: worker.id,
      workerPid: worker.process.pid,
      phase: 'worker_ready',
    });
  });

  // Graceful shutdown handling for primary
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal', {
        module: 'api_gateway_cluster',
        operation: 'graceful_shutdown',
        signal,
        phase: 'shutdown_duplicate',
      });
      return;
    }

    isShuttingDown = true;
    logger.info(`🛑 Received ${signal}, shutting down cluster gracefully...`, {
      module: 'api_gateway_cluster',
      operation: 'graceful_shutdown',
      signal,
      phase: 'shutdown_initiated',
    });

    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.send('shutdown-request');
        worker.disconnect();
      }
    }

    // Force-kill any workers still alive after timeout
    setTimeout(() => {
      for (const id in cluster.workers) {
        const worker = cluster.workers[id];
        if (worker && !worker.isDead()) {
          worker.kill('SIGKILL');
        }
      }
      logger.warn('⏰ Forcing cluster shutdown after timeout', {
        module: 'api_gateway_cluster',
        operation: 'force_shutdown',
        phase: 'shutdown_timeout',
      });
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
} else {
  // Worker process (or single process in development): Start the actual server
  if (clusteringEnabled) {
    logger.info(`🔧 Worker ${process.pid} starting...`, {
      module: 'api_gateway_cluster',
      operation: 'worker_start',
      workerPid: process.pid,
      phase: 'worker_starting',
    });
  }

  // Start the server
  startServer().catch(error => {
    logger.error('Failed to start API Gateway', {
      module: 'api_gateway_index',
      operation: 'startup',
      error: error instanceof Error ? error.message : String(error),
      phase: 'startup_failed',
    });
    process.exit(1);
  });
}
