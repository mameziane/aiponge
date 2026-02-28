/**
 * AI Content Service Database Connection Factory
 *
 * Uses the consolidated DatabaseConnectionFactory from platform-core
 * with ai-content-service specific configuration.
 */

import { createDatabaseConnectionFactory, createLogger, type SQLConnection } from '@aiponge/platform-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const logger = createLogger('ai-content-service-database');

export type DatabaseConnection = NodePgDatabase<Record<string, unknown>>;
export { SQLConnection };

const factory = createDatabaseConnectionFactory({
  serviceName: 'ai-content-service',
  envVarName: 'AI_CONTENT_DATABASE_URL',
  fallbackEnvVar: 'DATABASE_URL',
  replicaEnvVar: 'AI_CONTENT_DATABASE_REPLICA_URL',
});

export class DatabaseConnectionFactory {
  private static instance: DatabaseConnectionFactory | null = null;

  private constructor() {}

  public static getInstance(): DatabaseConnectionFactory {
    if (!DatabaseConnectionFactory.instance) {
      DatabaseConnectionFactory.instance = new DatabaseConnectionFactory();
    }
    return DatabaseConnectionFactory.instance;
  }

  public getSQLConnection(): SQLConnection {
    return factory.getSQLConnection();
  }

  public getDatabase(mode?: 'read' | 'write'): DatabaseConnection {
    return factory.getDatabase(mode);
  }

  public createSQLRepository<T>(RepositoryClass: new (_sql: SQLConnection) => T): T {
    return factory.createSQLRepository(RepositoryClass);
  }

  public createDrizzleRepository<T>(RepositoryClass: new (_db: DatabaseConnection) => T): T {
    return factory.createDrizzleRepository(RepositoryClass);
  }

  public static reset(): void {
    factory.reset();
    DatabaseConnectionFactory.instance = null;
  }

  public static async close(): Promise<void> {
    await factory.close();
    DatabaseConnectionFactory.instance = null;
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    driver: string;
  }> {
    const startTime = Date.now();
    try {
      const pool = factory.getSQLConnection();
      await pool.query('SELECT 1');
      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        driver: 'node-postgres',
      };
    } catch (error) {
      logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        driver: 'node-postgres',
      };
    }
  }
}

export function getDbFactory(): DatabaseConnectionFactory {
  return DatabaseConnectionFactory.getInstance();
}

export function getDatabase(): DatabaseConnection {
  return factory.getDatabase();
}

export function getSQLConnection(): SQLConnection {
  return factory.getSQLConnection();
}

export function createSQLRepository<T>(RepositoryClass: new (_sql: SQLConnection) => T): T {
  return factory.createSQLRepository(RepositoryClass);
}

export function createDrizzleRepository<T>(RepositoryClass: new (_db: DatabaseConnection) => T): T {
  return factory.createDrizzleRepository(RepositoryClass);
}
