/**
 * Music Service Database Connection Factory
 *
 * Uses the consolidated DatabaseConnectionFactory from platform-core
 * with music-service specific configuration.
 */

import { createDatabaseConnectionFactory, type SQLConnection, createLogger } from '@aiponge/platform-core';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '../../schema/music-schema';

const logger = createLogger('music-service:database');

export type DatabaseSchema = typeof schema;
export type DatabaseConnection = NeonHttpDatabase<DatabaseSchema>;
export { SQLConnection };

const factory = createDatabaseConnectionFactory({
  serviceName: 'music-service',
  envVarName: 'MUSIC_DATABASE_URL',
  fallbackEnvVar: 'DATABASE_URL',
  replicaEnvVar: 'MUSIC_DATABASE_REPLICA_URL',
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

  public createSQLRepository<T>(RepositoryClass: new (sql: SQLConnection) => T): T {
    return factory.createSQLRepository(RepositoryClass);
  }

  public createDrizzleRepository<T>(RepositoryClass: new (db: DatabaseConnection) => T): T {
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
      const sql = factory.getSQLConnection();
      await sql`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        driver: 'neon-http',
      };
    } catch (error) {
      logger.warn('Database health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        driver: 'neon-http',
      };
    }
  }
}

export function getDbFactory(): DatabaseConnectionFactory {
  return DatabaseConnectionFactory.getInstance();
}

export function getDatabase(mode?: 'read' | 'write'): DatabaseConnection {
  return factory.getDatabase(mode);
}

export function getSQLConnection(): SQLConnection {
  return factory.getSQLConnection();
}

export function createSQLRepository<T>(RepositoryClass: new (sql: SQLConnection) => T): T {
  return factory.createSQLRepository(RepositoryClass);
}

export function createDrizzleRepository<T>(RepositoryClass: new (db: DatabaseConnection) => T): T {
  return factory.createDrizzleRepository(RepositoryClass);
}
