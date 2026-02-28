/**
 * File Cleanup Scheduler
 * Runs hourly to detect and cleanup orphaned files
 */

import { BaseScheduler, SchedulerExecutionResult, type Logger } from '@aiponge/platform-core';
import { OrphanedFileCleanupService } from './OrphanedFileCleanupService';
import { UnreferencedFileDetectionService } from './UnreferencedFileDetectionService';

export interface CleanupSchedulerConfig {
  enableDetection?: boolean;
  detectionBatchSize?: number;
  cleanupBatchSize?: number;
  gracePeriodHours?: number;
}

export class FileCleanupScheduler extends BaseScheduler {
  declare protected logger: Logger;
  declare protected initLogger: () => void;
  declare triggerNow: () => Promise<SchedulerExecutionResult>;
  private cleanupConfig: CleanupSchedulerConfig = {
    enableDetection: false,
    detectionBatchSize: 500,
    cleanupBatchSize: 100,
    gracePeriodHours: 24,
  };

  get name(): string {
    return 'file-cleanup';
  }

  get serviceName(): string {
    return 'storage-service';
  }

  constructor(
    private _cleanupService: OrphanedFileCleanupService,
    private _detectionService?: UnreferencedFileDetectionService
  ) {
    super({
      cronExpression: '0 * * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 600000,
    });
    this.initLogger();
  }

  setCleanupConfig(config: Partial<CleanupSchedulerConfig>): void {
    this.cleanupConfig = { ...this.cleanupConfig, ...config };
    this.logger.info('Cleanup config updated', this.cleanupConfig);
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const results: Record<string, unknown> = {};

    if (this.cleanupConfig.enableDetection && this._detectionService) {
      try {
        const detectionResult = await this._detectionService.detectUnreferencedFiles({
          batchSize: this.cleanupConfig.detectionBatchSize || 500,
          dryRun: false,
        });
        results.detection = {
          scanned: detectionResult.scannedCount,
          unreferenced: detectionResult.unreferencedCount,
          markedOrphaned: detectionResult.markedOrphanedCount,
        };
      } catch (error) {
        this.logger.error('Unreferenced file detection failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.detectionError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    try {
      const cleanupResult = await this._cleanupService.cleanupOrphanedFiles({
        gracePeriodHours: this.cleanupConfig.gracePeriodHours || 24,
        batchSize: this.cleanupConfig.cleanupBatchSize || 100,
      });
      results.cleanup = cleanupResult;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Cleanup failed',
        data: results,
        durationMs: 0,
      };
    }

    return {
      success: true,
      message: 'File maintenance completed',
      data: results,
      durationMs: 0,
    };
  }

  async runNow(options?: { includeDetection?: boolean }): Promise<void> {
    if (options?.includeDetection) {
      this.cleanupConfig.enableDetection = true;
    }
    await this.triggerNow();
    if (options?.includeDetection) {
      this.cleanupConfig.enableDetection = false;
    }
  }
}
