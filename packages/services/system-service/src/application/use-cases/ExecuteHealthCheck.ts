/**
 * Execute Health Check Use Case
 * Runs health checks for all registered services
 */

import { IHealthCheckRepository } from '../../domains/monitoring/repositories/IHealthCheckRepository';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('execute-health-check-use-case');

export interface HealthCheckResult {
  serviceName: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  timestamp: Date;
}

export class ExecuteHealthCheckUseCase {
  private repository: IHealthCheckRepository;

  constructor(repository: IHealthCheckRepository) {
    this.repository = repository;
  }

  async execute(serviceName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      logger.debug(`Executing health check for ${serviceName}`);

      const healthChecks = await this.repository.findByServiceName(serviceName);
      const responseTime = Date.now() - startTime;

      if (!healthChecks.length) {
        return {
          serviceName,
          status: 'unknown',
          responseTime,
          timestamp: new Date(),
        };
      }

      return {
        serviceName,
        status: 'healthy',
        responseTime,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Health check failed for ${serviceName}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        serviceName,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  async executeAll(): Promise<HealthCheckResult[]> {
    logger.info('Executing health checks for all services');

    try {
      const healthChecks = await this.repository.findAllEnabled();
      const results: HealthCheckResult[] = [];

      for (const check of healthChecks) {
        const result = await this.execute(check.serviceName);
        results.push(result);
      }

      logger.info(`Completed health checks for ${results.length} services`);
      return results;
    } catch (error) {
      logger.error('Failed to execute health checks', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
