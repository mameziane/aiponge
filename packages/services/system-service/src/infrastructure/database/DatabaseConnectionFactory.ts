/**
 * Database Connection Factory
 * Standardized database connection management across all microservices
 * Eliminates hardcoded connection patterns and provides unified configuration
 */

import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { unifiedConfig } from '../../config/ConfigurationManager';
import { getLogger } from '../../config/service-urls';
import { SystemError } from '../../application/errors';
import { timeoutHierarchy } from '@aiponge/platform-core';

const logger = getLogger('system-service-databaseconnectionfactory');

interface DatabaseConnection {
  db: NodePgDatabase<Record<string, unknown>>;
  pool: Pool;
}

class DatabaseConnectionFactory {
  private static instance: DatabaseConnectionFactory;
  private connections = new Map<string, DatabaseConnection>();

  private constructor() {}

  public static getInstance(): DatabaseConnectionFactory {
    if (!DatabaseConnectionFactory.instance) {
      DatabaseConnectionFactory.instance = new DatabaseConnectionFactory();
    }
    return DatabaseConnectionFactory.instance;
  }

  private getSslConfig(connStr: string): false | { rejectUnauthorized: boolean } {
    if (process.env.DATABASE_SSL === 'false') return false;
    try {
      const url = new URL(connStr);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.railway.internal'))
        return false;
      if (url.searchParams.get('sslmode') === 'disable') return false;
    } catch {
      // fall through
    }
    return { rejectUnauthorized: false };
  }

  /**
   * Get or create a database connection for a service
   */
  public getConnection(serviceName: string, schema?: unknown): DatabaseConnection {
    const connectionKey = `${serviceName}`;

    if (this.connections.has(connectionKey)) {
      return this.connections.get(connectionKey)!;
    }

    const dbConfig = unifiedConfig.getDatabaseConfig();

    if (!dbConfig.url) {
      throw SystemError.configurationError(`Database URL not configured for service: ${serviceName}`);
    }

    let connStr = dbConfig.url;
    const dbTimeout = timeoutHierarchy.getDatabaseTimeout('system-service');

    // Append statement_timeout
    if (!connStr.includes('statement_timeout=')) {
      connStr += connStr.includes('?') ? `&statement_timeout=${dbTimeout}` : `?statement_timeout=${dbTimeout}`;
    }

    const maxConnections = parseInt(
      process.env.DATABASE_POOL_MAX || (process.env.NODE_ENV === 'production' ? '20' : '5')
    );

    const pool = new Pool({
      connectionString: connStr,
      max: maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: this.getSslConfig(connStr),
    });

    const db = (schema
      ? drizzle(pool, { schema: schema as Record<string, unknown> })
      : drizzle(pool)) as unknown as NodePgDatabase<Record<string, unknown>>;

    const connection: DatabaseConnection = { db, pool };
    this.connections.set(connectionKey, connection);

    logger.debug('Database connection created', { serviceName, dbTimeout });
    return connection;
  }

  /**
   * Get just the Pool client for services that only need basic connection
   */
  public getSqlClient(serviceName: string): Pool {
    return this.getConnection(serviceName).pool;
  }

  /**
   * Get just the Drizzle ORM instance
   */
  public getDatabase(serviceName: string, schema?: unknown): NodePgDatabase<Record<string, unknown>> {
    return this.getConnection(serviceName, schema).db;
  }

  /**
   * Get just the Pool instance for raw queries
   */
  public getSql(serviceName: string): Pool {
    return this.getConnection(serviceName).pool;
  }

  /**
   * Close all connections (for graceful shutdown)
   */
  public async closeAllConnections(): Promise<void> {
    logger.warn('Closing all database connections...');

    for (const [serviceName, connection] of this.connections) {
      try {
        await connection.pool.end();
        logger.debug(`Connection pool closed for ${serviceName}`);
      } catch (error) {
        logger.error(`Failed to close pool for ${serviceName}`, { error });
      }
    }

    this.connections.clear();
    logger.warn('All connections closed');
  }

  /**
   * Get connection health status
   */
  public async getConnectionHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [serviceName, connection] of this.connections) {
      try {
        await connection.pool.query('SELECT 1');
        health[serviceName] = true;
      } catch (error) {
        health[serviceName] = false;
        logger.warn(`Health check failed for ${serviceName}`, { data: error });
      }
    }

    return health;
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [serviceName, connection] of this.connections) {
      stats[serviceName] = {
        type: 'pool',
        status: 'connected',
        totalCount: connection.pool.totalCount,
        idleCount: connection.pool.idleCount,
        waitingCount: connection.pool.waitingCount,
      };
    }

    return stats;
  }
}

// Export singleton instance
export const databaseFactory = DatabaseConnectionFactory.getInstance();

// Utility functions for easy access
export function getDatabaseConnection(serviceName: string, schema?: unknown): DatabaseConnection {
  return databaseFactory.getConnection(serviceName, schema);
}

export function getDatabaseSqlClient(serviceName: string): Pool {
  return databaseFactory.getSqlClient(serviceName);
}

export function getDatabase(serviceName: string, schema?: unknown): NodePgDatabase<Record<string, unknown>> {
  return databaseFactory.getDatabase(serviceName, schema);
}

export function getDatabaseSql(serviceName: string): Pool {
  return databaseFactory.getSql(serviceName);
}

// Graceful shutdown helper
export async function closeAllDatabaseConnections(): Promise<void> {
  await databaseFactory.closeAllConnections();
}
