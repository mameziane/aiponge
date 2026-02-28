/**
 * Database Connection Factory
 * Standardized database connection management across all microservices
 * Eliminates hardcoded connection patterns and provides unified configuration
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { unifiedConfig } from '../../config/ConfigurationManager';
import { getLogger } from '../../config/service-urls';
import { SystemError } from '../../application/errors';
import { timeoutHierarchy } from '@aiponge/platform-core';

const logger = getLogger('system-service-databaseconnectionfactory');

interface DatabaseConnection {
  db: ReturnType<typeof drizzle>;
  sql: ReturnType<typeof neon>;
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
    if (!connStr.includes('sslmode=')) {
      connStr += connStr.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
    } else if (connStr.includes('sslmode=require')) {
      connStr = connStr.replace('sslmode=require', 'sslmode=verify-full');
    }

    const dbTimeout = timeoutHierarchy.getDatabaseTimeout('system-service');
    const sql = neon(connStr, {
      fetchOptions: {
        get signal() {
          return AbortSignal.timeout(dbTimeout);
        },
      },
    });

    const db = schema ? drizzle(sql as NeonQueryFunction<boolean, boolean>, { schema: schema as Record<string, unknown> }) : drizzle(sql as NeonQueryFunction<boolean, boolean>);

    const connection: DatabaseConnection = { db, sql: sql as ReturnType<typeof neon> };
    this.connections.set(connectionKey, connection);

    logger.debug('Database connection created', { serviceName, dbTimeout });
    return connection;
  }

  /**
   * Get just the SQL client for services that only need basic connection
   */
  public getSqlClient(serviceName: string): ReturnType<typeof neon> {
    return this.getConnection(serviceName).sql;
  }

  /**
   * Get just the Drizzle ORM instance
   */
  public getDatabase(serviceName: string, schema?: unknown): ReturnType<typeof drizzle> {
    return this.getConnection(serviceName, schema).db;
  }

  /**
   * Get just the SQL instance for raw queries
   */
  public getSql(serviceName: string): ReturnType<typeof neon> {
    return this.getConnection(serviceName).sql;
  }

  /**
   * Close all connections (for graceful shutdown)
   */
  public async closeAllConnections(): Promise<void> {
    logger.warn('🔒 Closing all database connections...');

    // HTTP client connections don't require explicit closing
    // Clear the connections map for cleanup
    this.connections.clear();
    logger.warn('All connections cleared');
  }

  /**
   * Get connection health status
   */
  public async getConnectionHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [serviceName, connection] of this.connections) {
      try {
        // Simple query to test connection
        const sql = connection.sql;
        await sql`SELECT 1`;
        health[serviceName] = true;
      } catch (error) {
        health[serviceName] = false;
        logger.warn('Health check failed for ${serviceName}:', { data: error });
      }
    }

    return health;
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [serviceName] of this.connections) {
      stats[serviceName] = {
        type: 'http_client',
        status: 'connected',
      };
    }

    return stats;
  }
}

// Export singleton instance
export const databaseFactory = DatabaseConnectionFactory.getInstance();

// Utility functions for easy access
export function getDatabaseConnection(serviceName: string, schema?: unknown): DatabaseConnection {
  // TypeScript optimized
  return databaseFactory.getConnection(serviceName, schema);
}

export function getDatabaseSqlClient(serviceName: string): ReturnType<typeof neon> {
  // TypeScript optimized
  return databaseFactory.getSqlClient(serviceName);
}

export function getDatabase(serviceName: string, schema?: unknown): ReturnType<typeof drizzle> {
  // TypeScript optimized
  return databaseFactory.getDatabase(serviceName, schema);
}

export function getDatabaseSql(serviceName: string): ReturnType<typeof neon> {
  // TypeScript optimized
  return databaseFactory.getSql(serviceName);
}

// Graceful shutdown helper
export async function closeAllDatabaseConnections(): Promise<void> {
  // TypeScript optimized
  await databaseFactory.closeAllConnections();
}
