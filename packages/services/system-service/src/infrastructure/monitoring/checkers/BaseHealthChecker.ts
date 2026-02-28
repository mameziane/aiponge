import { HealthCheckResult, HealthCheckStatus } from '../../../domains/monitoring/entities/HealthCheck';

export interface HealthCheckContext {
  healthCheckId: string;
  endpoint: string;
  timeoutMs: number;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export interface CheckResult {
  status: HealthCheckStatus;
  responseTimeMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseHealthChecker {
  abstract checkType: string;

  async executeCheck(context: HealthCheckContext): Promise<CheckResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= context.retryCount; attempt++) {
      try {
        const result = await this.performCheck(context);
        const responseTime = Date.now() - startTime;

        return {
          ...result,
          responseTimeMs: responseTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is the last attempt, don't wait
        if (attempt < context.retryCount) {
          await this.delay(Math.min(1000 * Math.pow(2, attempt), 5000)); // Exponential backoff
        }
      }
    }

    // All retries failed
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      responseTimeMs: responseTime,
      errorMessage: lastError?.message || 'Health check failed after retries',
      metadata: { error: lastError?.stack },
    };
  }

  protected abstract performCheck(context: HealthCheckContext): Promise<CheckResult>;

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected createTimeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Health check timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}
