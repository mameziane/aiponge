/**
 * Storage Service Bootstrap
 * Extends ServiceBootstrap for storage-specific graceful shutdown
 */

import { ServiceBootstrap, BootstrapConfig, errorMessage, errorStack } from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';

const logger = getLogger('storage-service-bootstrap');

export class StorageServiceBootstrap extends ServiceBootstrap {
  declare protected config: BootstrapConfig;
  private storageProviders: Array<{ close: () => Promise<void> }> = [];
  private backgroundWorkers: Array<{ close: () => Promise<void> }> = [];
  private repositories: Array<{ close: () => Promise<void> }> = [];
  private processingTimers: ReturnType<typeof setTimeout>[] = [];
  private processingIntervals: ReturnType<typeof setInterval>[] = [];
  private fileWatchers: Array<{ close: () => void }> = [];

  constructor(config: BootstrapConfig) {
    super(config);
    this.config = config;
  }

  /**
   * Register storage providers for cleanup
   */
  addStorageProvider(provider: { close: () => Promise<void> }): void {
    this.storageProviders.push(provider);
  }

  /**
   * Register background workers for cleanup
   */
  addBackgroundWorker(worker: { close: () => Promise<void> }): void {
    this.backgroundWorkers.push(worker);
  }

  /**
   * Register repositories for cleanup
   */
  addRepository(repository: { close: () => Promise<void> }): void {
    this.repositories.push(repository);
  }

  /**
   * Register processing timers for cleanup
   */
  addProcessingTimer(timer: ReturnType<typeof setTimeout>): void {
    this.processingTimers.push(timer);
  }

  /**
   * Register processing intervals for cleanup
   */
  addProcessingInterval(interval: ReturnType<typeof setInterval>): void {
    this.processingIntervals.push(interval);
  }

  /**
   * Register file watchers for cleanup
   */
  addFileWatcher(watcher: { close: () => void }): void {
    this.fileWatchers.push(watcher);
  }

  /**
   * Custom cleanup implementation for storage service
   */
  protected async executeCustomCleanup(): Promise<void> {
    logger.info('Starting storage service cleanup', {
      module: 'storage_service_bootstrap',
      operation: 'executeCustomCleanup',
      serviceName: this.config.service.name,
      phase: 'cleanup_started',
    });

    const cleanupTasks: Promise<void>[] = [];

    // 1. Clear processing timers
    if (this.processingTimers.length > 0) {
      logger.info('Clearing processing timers', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        timerCount: this.processingTimers.length,
        phase: 'processing_timers_clearing',
      });
      this.processingTimers.forEach(timer => clearTimeout(timer));
      this.processingTimers = [];
    }

    // 2. Clear processing intervals
    if (this.processingIntervals.length > 0) {
      logger.info('Clearing processing intervals', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        intervalCount: this.processingIntervals.length,
        phase: 'processing_intervals_clearing',
      });
      this.processingIntervals.forEach(interval => clearInterval(interval));
      this.processingIntervals = [];
    }

    // 3. Close file watchers
    if (this.fileWatchers.length > 0) {
      logger.info('Closing file watchers', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        watcherCount: this.fileWatchers.length,
        phase: 'file_watchers_closing',
      });
      this.fileWatchers.forEach(watcher => {
        try {
          watcher.close();
        } catch (error) {
          logger.warn('File watcher cleanup failed', {
            module: 'storage_service_bootstrap',
            operation: 'executeCustomCleanup',
            serviceName: this.config.service.name,
            error: { message: errorMessage(error), stack: errorStack(error) },
            phase: 'file_watcher_cleanup_failed',
          });
        }
      });
      this.fileWatchers = [];
    }

    // 4. Shutdown background workers
    if (this.backgroundWorkers.length > 0) {
      logger.info('Shutting down background workers', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        workerCount: this.backgroundWorkers.length,
        phase: 'background_workers_shutdown_started',
      });
      cleanupTasks.push(
        Promise.all(
          this.backgroundWorkers.map(worker =>
            worker.close().catch(error => {
              logger.warn('Background worker cleanup failed', {
                module: 'storage_service_bootstrap',
                operation: 'executeCustomCleanup',
                serviceName: this.config.service.name,
                error: { message: errorMessage(error), stack: errorStack(error) },
                phase: 'background_worker_cleanup_failed',
              });
            })
          )
        ).then(() => {
          this.backgroundWorkers = [];
          logger.info('Background workers shut down successfully', {
            module: 'storage_service_bootstrap',
            operation: 'executeCustomCleanup',
            serviceName: this.config.service.name,
            phase: 'background_workers_shutdown_completed',
          });
        })
      );
    }

    // 5. Close storage providers
    if (this.storageProviders.length > 0) {
      logger.info('Closing storage providers', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        providerCount: this.storageProviders.length,
        phase: 'storage_providers_closing',
      });
      cleanupTasks.push(
        Promise.all(
          this.storageProviders.map(provider =>
            provider.close().catch(error => {
              logger.warn('Storage provider cleanup failed', {
                module: 'storage_service_bootstrap',
                operation: 'executeCustomCleanup',
                serviceName: this.config.service.name,
                error: { message: errorMessage(error), stack: errorStack(error) },
                phase: 'storage_provider_cleanup_failed',
              });
            })
          )
        ).then(() => {
          this.storageProviders = [];
          logger.info('Storage providers closed successfully', {
            module: 'storage_service_bootstrap',
            operation: 'executeCustomCleanup',
            serviceName: this.config.service.name,
            phase: 'storage_providers_closed',
          });
        })
      );
    }

    // 6. Close repositories
    if (this.repositories.length > 0) {
      logger.info('Closing repositories', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        repositoryCount: this.repositories.length,
        phase: 'repositories_closing',
      });
      cleanupTasks.push(
        Promise.all(
          this.repositories.map(repository =>
            repository.close().catch(error => {
              logger.warn('Repository cleanup failed', {
                module: 'storage_service_bootstrap',
                operation: 'executeCustomCleanup',
                serviceName: this.config.service.name,
                error: { message: errorMessage(error), stack: errorStack(error) },
                phase: 'repository_cleanup_failed',
              });
            })
          )
        ).then(() => {
          this.repositories = [];
          logger.info('Repositories closed successfully', {
            module: 'storage_service_bootstrap',
            operation: 'executeCustomCleanup',
            serviceName: this.config.service.name,
            phase: 'repositories_closed',
          });
        })
      );
    }

    // Execute all cleanup tasks in parallel with timeout
    await Promise.race([
      Promise.all(cleanupTasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Storage service cleanup timeout after 10 seconds')), 10000)
      ),
    ]).catch(error => {
      logger.warn('Some storage service cleanup tasks failed', {
        module: 'storage_service_bootstrap',
        operation: 'executeCustomCleanup',
        serviceName: this.config.service.name,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'cleanup_tasks_failed',
      });
    });

    logger.info('Storage service cleanup completed', {
      module: 'storage_service_bootstrap',
      operation: 'executeCustomCleanup',
      serviceName: this.config.service.name,
      phase: 'cleanup_completed',
    });
  }
}
