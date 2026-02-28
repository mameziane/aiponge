/**
 * Pattern Analysis Scheduled Job
 * Runs every 24 hours to analyze user patterns and update pattern database
 */

import { BaseScheduler, SchedulerExecutionResult, SchedulerRegistry } from '@aiponge/platform-core';
import { PatternRecognitionService } from '../../domains/profile/services/PatternRecognitionService';
import { PatternRepository } from '../repositories/PatternRepository';
import { createDrizzleRepository } from '../database/DatabaseConnectionFactory';

export class PatternAnalysisScheduler extends BaseScheduler {
  private patternRecognitionService: PatternRecognitionService;

  get name(): string {
    return 'pattern-analysis';
  }

  get serviceName(): string {
    return 'user-service';
  }

  constructor() {
    super({
      cronExpression: '0 3 * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 1800000,
    });
    this.initLogger();
    const patternRepository = createDrizzleRepository(PatternRepository);
    this.patternRecognitionService = new PatternRecognitionService(patternRepository);
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const result = await this.patternRecognitionService.runBatchAnalysis();

    return {
      success: true,
      message: `Analyzed ${result.usersAnalyzed} users, found ${result.patternsFound} patterns`,
      data: {
        usersAnalyzed: result.usersAnalyzed,
        patternsFound: result.patternsFound,
      },
      durationMs: 0,
      noOp: result.usersAnalyzed === 0,
    };
  }
}

export const patternAnalysisScheduler = new PatternAnalysisScheduler();
SchedulerRegistry.register(patternAnalysisScheduler);

/**
 * Manually trigger pattern analysis - delegates to scheduler
 */
export async function runPatternAnalysisNow(): Promise<{
  success: boolean;
  usersAnalyzed: number;
  patternsFound: number;
}> {
  const result = await patternAnalysisScheduler.triggerNow();
  return {
    success: result.success,
    usersAnalyzed: (result.data?.usersAnalyzed as number) || 0,
    patternsFound: (result.data?.patternsFound as number) || 0,
  };
}
