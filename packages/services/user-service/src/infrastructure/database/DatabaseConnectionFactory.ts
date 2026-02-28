/**
 * Centralized Database Connection Factory for User Service
 * Provides consistent database connection management with DI pattern
 * Uses postgres.js driver for connection pooling support
 */

import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as userSchema from './schemas/user-schema';
import * as profileSchema from './schemas/profile-schema';
import { getLogger } from '../../config/service-urls';
import { serializeError, timeoutHierarchy } from '@aiponge/platform-core';

const logger = getLogger('user-service-databaseconnectionfactory');

export type DatabaseSchema = typeof userSchema & typeof profileSchema;
export type DatabaseConnection = PostgresJsDatabase<DatabaseSchema>;
export type SQLConnection = ReturnType<typeof postgres>;

export class DatabaseConnectionFactory {
  private static instance: DatabaseConnectionFactory | null = null;
  private static sqlConnection: SQLConnection | null = null;
  private static dbConnection: DatabaseConnection | null = null;
  private static replicaSqlConnection: SQLConnection | null = null;
  private static replicaDbConnection: DatabaseConnection | null = null;
  private static usesSameConnection = false;

  private constructor() {}

  public static getInstance(): DatabaseConnectionFactory {
    if (!DatabaseConnectionFactory.instance) {
      DatabaseConnectionFactory.instance = new DatabaseConnectionFactory();
    }
    return DatabaseConnectionFactory.instance;
  }

  private static getSslConfig(connectionString: string): false | 'require' {
    if (process.env.DATABASE_SSL === 'false') return false;
    try {
      const url = new URL(connectionString);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.railway.internal'))
        return false;
      if (url.searchParams.get('sslmode') === 'disable') return false;
    } catch {
      /* fall through */
    }
    return 'require';
  }

  private static getPoolConfig() {
    const connectionString = process.env.USER_DATABASE_URL || process.env.DATABASE_URL || '';

    return {
      max: parseInt(
        process.env.USER_DATABASE_POOL_MAX ||
          process.env.DATABASE_POOL_MAX ||
          (process.env.NODE_ENV === 'production' ? '50' : '10')
      ),
      idle_timeout: 300,
      connect_timeout: 10,
      ssl: DatabaseConnectionFactory.getSslConfig(connectionString),
      onnotice: () => {},
      connection: {
        statement_timeout: parseInt(
          process.env.STATEMENT_TIMEOUT_MS || String(timeoutHierarchy.getDatabaseTimeout('user-service'))
        ),
      },
    };
  }

  public getSQLConnection(): SQLConnection {
    if (!DatabaseConnectionFactory.sqlConnection) {
      const connectionString = process.env.USER_DATABASE_URL || process.env.DATABASE_URL;

      if (!connectionString) {
        const error = new Error('USER_DATABASE_URL or DATABASE_URL environment variable is required for user-service');
        logger.error('Database URL not configured', { requiredEnvVar: 'USER_DATABASE_URL or DATABASE_URL' });
        throw error;
      }

      DatabaseConnectionFactory.sqlConnection = postgres(connectionString, DatabaseConnectionFactory.getPoolConfig());

      logger.debug('Database connection pool created');
    }
    return DatabaseConnectionFactory.sqlConnection;
  }

  public getDatabase(mode: 'read' | 'write' = 'write'): DatabaseConnection {
    if (mode === 'read') {
      return this.getReplicaDatabase();
    }

    if (!DatabaseConnectionFactory.dbConnection) {
      const sql = this.getSQLConnection();

      DatabaseConnectionFactory.dbConnection = drizzle(sql, {
        schema: {
          ...userSchema,
          ...profileSchema,
        },
        logger: false,
      });

      logger.debug('Drizzle ORM initialized');
    }
    return DatabaseConnectionFactory.dbConnection;
  }

  private getReplicaDatabase(): DatabaseConnection {
    const primaryUrl = process.env.USER_DATABASE_URL || process.env.DATABASE_URL;
    const replicaUrl = process.env.USER_DATABASE_REPLICA_URL;

    if (!replicaUrl || replicaUrl === primaryUrl) {
      DatabaseConnectionFactory.usesSameConnection = true;
      return this.getDatabase('write');
    }

    if (!DatabaseConnectionFactory.replicaDbConnection) {
      try {
        DatabaseConnectionFactory.replicaSqlConnection = postgres(
          replicaUrl,
          DatabaseConnectionFactory.getPoolConfig()
        );
        DatabaseConnectionFactory.replicaDbConnection = drizzle(DatabaseConnectionFactory.replicaSqlConnection, {
          schema: {
            ...userSchema,
            ...profileSchema,
          },
          logger: false,
        });
        logger.info('Read replica Drizzle connection established');
      } catch (error) {
        logger.error('Read replica connection failed, falling back to primary', { error: serializeError(error) });
        return this.getDatabase('write');
      }
    }
    return DatabaseConnectionFactory.replicaDbConnection;
  }

  public createDrizzleRepository<T>(RepositoryClass: new (db: DatabaseConnection) => T): T {
    const db = this.getDatabase();
    return new RepositoryClass(db);
  }

  public createDrizzleRepositoryRead<T>(RepositoryClass: new (db: DatabaseConnection) => T): T {
    const db = this.getDatabase('read');
    return new RepositoryClass(db);
  }

  public static reset(): void {
    DatabaseConnectionFactory.sqlConnection = null;
    DatabaseConnectionFactory.dbConnection = null;
    DatabaseConnectionFactory.replicaSqlConnection = null;
    DatabaseConnectionFactory.replicaDbConnection = null;
    DatabaseConnectionFactory.instance = null;
    logger.info('Connections reset');
  }

  public static async close(): Promise<void> {
    if (DatabaseConnectionFactory.sqlConnection) {
      await DatabaseConnectionFactory.sqlConnection.end();
    }
    if (DatabaseConnectionFactory.replicaSqlConnection && !DatabaseConnectionFactory.usesSameConnection) {
      await DatabaseConnectionFactory.replicaSqlConnection.end();
    }
    DatabaseConnectionFactory.reset();
    logger.info('Connections closed');
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    poolSize: number;
  }> {
    const startTime = Date.now();
    try {
      const sql = this.getSQLConnection();
      await sql`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        poolSize: parseInt(
          process.env.USER_DATABASE_POOL_MAX ||
            process.env.DATABASE_POOL_MAX ||
            (process.env.NODE_ENV === 'production' ? '50' : '10')
        ),
      };
    } catch (error) {
      logger.error('Health check failed', { error: serializeError(error) });
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        poolSize: 0,
      };
    }
  }
}

export function getDbFactory(): DatabaseConnectionFactory {
  return DatabaseConnectionFactory.getInstance();
}

export function getDatabase(): DatabaseConnection {
  return getDbFactory().getDatabase();
}

export function createDrizzleRepository<T>(RepositoryClass: new (db: DatabaseConnection) => T): T {
  return getDbFactory().createDrizzleRepository(RepositoryClass);
}
