import { HealthCheckResult, HealthCheckConfig } from '../../../domains/monitoring/entities/HealthCheck';
import { MonitoringError } from '../../../application/errors';

export interface IHealthChecker {
  type: string;
  executeCheck(serviceName: string, endpoint: string, config: HealthCheckConfig): Promise<HealthCheckResult>;
}

export class HttpHealthChecker implements IHealthChecker {
  type = 'http';

  async executeCheck(serviceName: string, endpoint: string, config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (!endpoint || endpoint.trim().length === 0) {
        return {
          serviceName,
          checkType: 'http',
          status: 'unhealthy',
          responseTimeMs: 0,
          timestamp: new Date(),
          endpoint,
          errorMessage: 'Endpoint URL is required',
        };
      }

      const timeoutMs = config.timeoutMs || 5000;
      const expectedStatusCode = config.expectedStatusCode || 200;
      const degradedThresholdMs = config.degradedThresholdMs || 1000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: config.customHeaders || {},
      });

      clearTimeout(timeoutId);
      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        if (config.expectedStatusCode && response.status !== expectedStatusCode) {
          return {
            serviceName,
            checkType: 'http',
            status: 'unhealthy',
            responseTimeMs,
            timestamp: new Date(),
            endpoint,
            errorMessage: `Expected status code ${expectedStatusCode}, got ${response.status}`,
            metadata: {
              statusCode: response.status,
              statusText: response.statusText,
            },
          };
        }

        return {
          serviceName,
          checkType: 'http',
          status: 'unhealthy',
          responseTimeMs,
          timestamp: new Date(),
          endpoint,
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          metadata: {
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      }

      const status = responseTimeMs > degradedThresholdMs ? 'degraded' : 'healthy';

      return {
        serviceName,
        checkType: 'http',
        status,
        responseTimeMs,
        timestamp: new Date(),
        endpoint,
        metadata: {
          statusCode: response.status,
          statusText: response.statusText,
        },
      };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - startTime;

      let errorMessage = 'Unknown error';
      if (error instanceof Error && error.name === 'AbortError') {
        errorMessage = `Request timeout after ${config.timeoutMs || 5000}ms`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        serviceName,
        checkType: 'http',
        status: 'unhealthy',
        responseTimeMs,
        timestamp: new Date(),
        endpoint,
        errorMessage,
      };
    }
  }
}

export class TcpHealthChecker implements IHealthChecker {
  type = 'tcp';

  async executeCheck(serviceName: string, endpoint: string, config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Parse endpoint in format "host:port"
      const parts = endpoint.split(':');
      if (parts.length !== 2) {
        return {
          serviceName,
          checkType: 'tcp',
          status: 'unhealthy',
          responseTimeMs: 0,
          timestamp: new Date(),
          endpoint,
          errorMessage: 'Invalid TCP endpoint format. Expected host:port',
        };
      }

      const host = parts[0];
      const port = parseInt(parts[1]);
      const timeoutMs = config.timeoutMs || 5000;

      if (isNaN(port) || port < 1 || port > 65535) {
        return {
          serviceName,
          checkType: 'tcp',
          status: 'unhealthy',
          responseTimeMs: 0,
          timestamp: new Date(),
          endpoint,
          errorMessage: 'Invalid port number',
        };
      }

      // Simulate TCP connection check
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, timeoutMs);

        // Simulate connection delay
        setTimeout(() => {
          clearTimeout(timer);
          resolve(true);
        }, Math.random() * 100);
      });

      const responseTimeMs = Date.now() - startTime;

      return {
        serviceName,
        checkType: 'tcp',
        status: 'healthy',
        responseTimeMs,
        timestamp: new Date(),
        endpoint,
        metadata: {
          host,
          port,
        },
      };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - startTime;

      return {
        serviceName,
        checkType: 'tcp',
        status: 'unhealthy',
        responseTimeMs,
        timestamp: new Date(),
        endpoint,
        errorMessage: error instanceof Error ? error.message : 'TCP connection failed',
      };
    }
  }
}

export class HealthCheckerFactory {
  private checkers: Map<string, () => IHealthChecker>;

  constructor() {
    this.checkers = new Map([
      ['http', () => new HttpHealthChecker()],
      ['tcp', () => new TcpHealthChecker()],
    ]);
  }

  createChecker(type: string): IHealthChecker {
    const checkerFactory = this.checkers.get(type);

    if (!checkerFactory) {
      throw MonitoringError.healthCheckFailed(type, 'Unsupported health checker type');
    }

    return checkerFactory();
  }

  getSupportedTypes(): string[] {
    return Array.from(this.checkers.keys());
  }

  isTypeSupported(type: string): boolean {
    return this.checkers.has(type);
  }
}
