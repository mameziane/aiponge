/**
 * AI Config Service Database Connection Factory
 *
 * Uses the consolidated DatabaseConnectionFactory from platform-core
 * with ai-config-service specific configuration.
 */

import { createDatabaseConnectionFactory, createLogger, type SQLConnection } from '@aiponge/platform-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@schema/schema';

const logger = createLogger('ai-config-service-database');

export type DatabaseConnection = NodePgDatabase<typeof schema>;
export { SQLConnection };

const factory = createDatabaseConnectionFactory({
  serviceName: 'ai-config-service',
  envVarName: 'AI_CONFIG_DATABASE_URL',
  fallbackEnvVar: 'DATABASE_URL',
  replicaEnvVar: 'AI_CONFIG_DATABASE_REPLICA_URL',
  schema,
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
    providerTablesCount: number;
  }> {
    const startTime = Date.now();
    try {
      const pool = factory.getSQLConnection();
      await pool.query('SELECT 1');

      const providerTablesResult = await pool.query(
        `SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name LIKE 'cfg_%'`
      );

      const providerTablesCount = parseInt(providerTablesResult.rows[0]?.count || '0');

      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        providerTablesCount,
      };
    } catch (error) {
      logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        providerTablesCount: 0,
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

export function createDrizzleRepository<T>(RepositoryClass: new (_db: DatabaseConnection) => T): T {
  return factory.createDrizzleRepository(RepositoryClass);
}
