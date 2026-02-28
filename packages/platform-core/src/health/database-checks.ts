/**
 * Database Health Checks
 *
 * Database connection testing utilities
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
   * Check if URL is a Neon database URL
   */
  static isNeonUrl(connectionString: string): boolean {
    return (
      connectionString.includes('neon.database.azure.com') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('ep-') ||
      connectionString.includes('.pooler.neon.tech')
    );
  }

  /**
   * Execute health check using Neon serverless driver
   */
  static async executeNeonHealthCheck(databaseUrl: string): Promise<HealthCheckRow[]> {
    try {
      if (typeof global !== 'undefined' && !global.WebSocket) {
        const ws = await import('ws');
        (global as unknown as Record<string, unknown>).WebSocket = ws.default;
      }

      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(databaseUrl);
      return (await sql`SELECT 1 as health_check, NOW() as check_time`) as unknown as HealthCheckRow[];
    } catch (_error) {
      return this.executePgHealthCheck(databaseUrl);
    }
  }

  /**
   * Execute health check using standard pg driver
   */
  static async executePgHealthCheck(databaseUrl: string): Promise<HealthCheckRow[]> {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 5000,
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

  /**
   * Check database health with actual connection test
   */
  private static getProvider(databaseUrl: string): string {
    return this.isNeonUrl(databaseUrl) ? 'neon-postgresql' : 'postgresql';
  }

  private static buildHealthyResult(databaseUrl: string, responseTime: number, result: HealthCheckRow[]): ComponentHealth {
    return {
      status: 'healthy',
      responseTimeMs: responseTime,
      metadata: {
        configured: true,
        connectionTest: 'passed',
        checkTime: result[0]?.check_time || new Date().toISOString(),
        provider: this.getProvider(databaseUrl),
      },
    };
  }

  private static buildUnhealthyResult(databaseUrl: string, responseTime: number): ComponentHealth {
    return {
      status: 'unhealthy',
      responseTimeMs: responseTime,
      errorMessage: 'Database query returned unexpected result',
      metadata: {
        configured: true,
        connectionTest: 'failed',
        provider: this.getProvider(databaseUrl),
      },
    };
  }

  private static buildErrorResult(databaseUrl: string, responseTime: number, error: unknown): ComponentHealth {
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
        provider: this.getProvider(databaseUrl),
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

      const healthCheckPromise = this.isNeonUrl(databaseUrl)
        ? this.executeNeonHealthCheck(databaseUrl)
        : this.executePgHealthCheck(databaseUrl);

      const result = await Promise.race([healthCheckPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      if (result && result.length > 0) {
        return this.buildHealthyResult(databaseUrl, responseTime, result);
      } else {
        return this.buildUnhealthyResult(databaseUrl, responseTime);
      }
    } catch (error) {
      return this.buildErrorResult(databaseUrl, Date.now() - startTime, error);
    }
  }
}
