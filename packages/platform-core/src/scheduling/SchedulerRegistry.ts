/**
 * SchedulerRegistry - Central registry for all scheduled jobs
 * Provides global visibility and lifecycle management across services
 */

import { getLogger } from '../logging';
import type { BaseScheduler } from './BaseScheduler';
import type { SchedulerInfo, SchedulerHealthReport } from './types';
import { registerPhasedShutdownHook } from '../lifecycle/gracefulShutdown.js';

const logger = getLogger('scheduler-registry');

class SchedulerRegistryClass {
  private schedulers: Map<string, BaseScheduler> = new Map();
  private serviceName: string = 'unknown';
  private shutdownHooks: Array<() => Promise<void>> = [];

  setServiceName(name: string): void {
    this.serviceName = name;
  }

  getServiceName(): string {
    return this.serviceName;
  }

  private getKey(scheduler: BaseScheduler): string {
    return `${scheduler.serviceName}:${scheduler.name}`;
  }

  register(scheduler: BaseScheduler): void {
    const key = this.getKey(scheduler);
    if (this.schedulers.has(key)) {
      logger.warn(`Scheduler already registered: ${key}, skipping duplicate`);
      return;
    }

    if (this.schedulers.size === 0) {
      registerPhasedShutdownHook(
        'schedulers',
        async () => {
          const names = Array.from(this.schedulers.keys());
          logger.info('Stopping all schedulers via shutdown hook', { schedulers: names });
          await this.shutdownAll();
        },
        'SchedulerRegistry'
      );
    }

    this.schedulers.set(key, scheduler);
    logger.debug(`Scheduler registered: ${key}`, {
      cronExpression: scheduler.cronExpression,
    });
  }

  unregister(key: string): void {
    const scheduler = this.schedulers.get(key);
    if (scheduler) {
      scheduler.stop();
      this.schedulers.delete(key);
      logger.info(`Scheduler unregistered: ${key}`);
    }
  }

  get(key: string): BaseScheduler | undefined {
    return this.schedulers.get(key);
  }

  getByName(name: string): BaseScheduler | undefined {
    for (const [key, scheduler] of this.schedulers) {
      if (key.endsWith(`:${name}`)) {
        return scheduler;
      }
    }
    return undefined;
  }

  getAll(): BaseScheduler[] {
    return Array.from(this.schedulers.values());
  }

  startAll(): void {
    logger.debug('Starting all schedulers...', { count: this.schedulers.size });
    for (const scheduler of this.schedulers.values()) {
      scheduler.start();
    }
    logger.debug('All schedulers started');
  }

  stopAll(): void {
    logger.info('Stopping all schedulers...', { count: this.schedulers.size });
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop();
    }
    logger.info('All schedulers stopped');
  }

  getAllInfo(): SchedulerInfo[] {
    return this.getAll().map(s => s.getInfo());
  }

  getHealthReport(): SchedulerHealthReport {
    const schedulers = this.getAllInfo();
    const runningCount = schedulers.filter(s => s.status === 'running').length;
    const totalErrors = schedulers.reduce((sum, s) => sum + s.errorCount, 0);
    const totalRuns = schedulers.reduce((sum, s) => sum + s.runCount, 0);
    const errorRate = totalRuns > 0 ? totalErrors / totalRuns : 0;

    return {
      healthy: this.getAll().every(s => s.isHealthy()),
      schedulers,
      totalSchedulers: schedulers.length,
      runningCount,
      errorRate,
    };
  }

  async triggerScheduler(name: string): Promise<{ success: boolean; message?: string }> {
    const scheduler = this.schedulers.get(name);
    if (!scheduler) {
      return { success: false, message: `Scheduler not found: ${name}` };
    }
    const result = await scheduler.triggerNow();
    return { success: result.success, message: result.message };
  }

  onShutdown(hook: () => Promise<void>): void {
    this.shutdownHooks.push(hook);
  }

  async shutdownAll(): Promise<void> {
    logger.info('Shutting down all schedulers and hooks...', {
      schedulerCount: this.schedulers.size,
      hookCount: this.shutdownHooks.length,
    });

    this.stopAll();

    for (const hook of this.shutdownHooks) {
      try {
        await hook();
      } catch (error) {
        logger.error('Shutdown hook error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.shutdownHooks = [];
    logger.info('All shutdown hooks executed');
  }

  clear(): void {
    this.stopAll();
    this.schedulers.clear();
    this.shutdownHooks = [];
    logger.info('Scheduler registry cleared');
  }
}

export const SchedulerRegistry = new SchedulerRegistryClass();
