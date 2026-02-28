/**
 * Database Health Checks
 *
 * Database connection testing utilities using standard pg driver
 */

import { ComponentHealth } from './types';

interface HealthCheckRow {
  health_check: number;
  check_time: string;
}

/**
 * Database health checking utilities
 */
export class DatabaseHealthChecker {
  /**
   * Execute health check using standard pg driver
   */
  static async executePgHealthCheck(databaseUrl: string): Promise<HealthCheckRow[]> {
    const { Pool } = await import('pg');
    const isLocal =
      databaseUrl.includes('localhost') ||
      databaseUrl.includes('127.0.0.1') ||
      databaseUrl.includes('.railway.internal');
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 5000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT 1 as health_check, NOW() as check_time');
        return result.rows;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  }

  private static buildHealthyResult(responseTime: number, result: HealthCheckRow[]): ComponentHealth {
    return {
      status: 'healthy',
      responseTimeMs: responseTime,
      metadata: {
        configured: true,
        connectionTest: 'passed',
        checkTime: result[0]?.check_time || new Date().toISOString(),
        provider: 'postgresql',
      },
    };
  }

  private static buildUnhealthyResult(responseTime: number): ComponentHealth {
    return {
      status: 'unhealthy',
      responseTimeMs: responseTime,
      errorMessage: 'Database query returned unexpected result',
      metadata: {
        configured: true,
        connectionTest: 'failed',
        provider: 'postgresql',
      },
    };
  }

  private static buildErrorResult(responseTime: number, error: unknown): ComponentHealth {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT');

    return {
      status: isTimeout ? 'degraded' : 'unhealthy',
      responseTimeMs: responseTime,
      errorMessage,
      metadata: {
        configured: true,
        connectionTest: 'failed',
        errorType: isTimeout ? 'timeout' : 'unknown',
        provider: 'postgresql',
      },
    };
  }

  /**
   * Check database health with actual connection test
   */
  static async checkDatabaseHealth(databaseUrl?: string): Promise<ComponentHealth> {
    if (!databaseUrl) {
      return {
        status: 'healthy',
        metadata: {
          reason: 'no database configured',
          configured: false,
        },
      };
    }

    const startTime = Date.now();
    const timeoutMs = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000');

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database health check timeout')), timeoutMs);
      });

      const healthCheckPromise = this.executePgHealthCheck(databaseUrl);

      const result = await Promise.race([healthCheckPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      if (result && result.length > 0) {
        return this.buildHealthyResult(responseTime, result);
      } else {
        return this.buildUnhealthyResult(responseTime);
      }
    } catch (error) {
      return this.buildErrorResult(Date.now() - startTime, error);
    }
  }
}
