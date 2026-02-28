/**
 * Centralized Database Connection Factory
 *
 * Provides consistent database connection management across all microservices.
 * Each service creates its own factory instance with service-specific configuration.
 *
 * @example
 * // In music-service:
 * import { createDatabaseConnectionFactory } from '@aiponge/platform-core';
 * import * as schema from './schema/music-schema';
 *
 * const { getDatabase, getSQLConnection } = createDatabaseConnectionFactory({
 *   serviceName: 'music-service',
 *   envVarName: 'MUSIC_DATABASE_URL',
 *   schema,
 * });
 */

import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { timeoutHierarchy } from '../config/timeout-hierarchy.js';
import { registerPhasedShutdownHook } from '../lifecycle/gracefulShutdown.js';

interface OtelSpan {
  setAttribute(key: string, value: string): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(error: unknown): void;
  end(): void;
}

interface OtelApi {
  trace: {
    getTracer(name: string): {
      startActiveSpan?: (name: string, fn: (span: OtelSpan) => OtelSpan) => OtelSpan | null;
    };
  };
  SpanStatusCode: {
    OK: number;
    ERROR: number;
  };
}

let otelApi: OtelApi | null = null;
try {
  otelApi = require('@opentelemetry/api');
} catch {
  // OpenTelemetry not installed - tracing disabled
}

export type SQLConnection = Pool;

export interface DatabaseConfig<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  serviceName: string;
  envVarName?: string;
  fallbackEnvVar?: string;
  replicaEnvVar?: string;
  schema?: TSchema;
}

export interface DatabaseConnectionFactoryInstance<TSchema extends Record<string, unknown>> {
  getInstance: () => DatabaseConnectionFactoryClass<TSchema>;
  getDatabase: (mode?: 'read' | 'write') => NodePgDatabase<TSchema>;
  getSQLConnection: () => SQLConnection;
  createSQLRepository: <T>(RepositoryClass: new (sql: SQLConnection) => T) => T;
  createDrizzleRepository: <T>(RepositoryClass: new (db: NodePgDatabase<TSchema>) => T) => T;
  createDrizzleRepositoryRead: <T>(RepositoryClass: new (db: NodePgDatabase<TSchema>) => T) => T;
  reset: () => void;
  close: () => Promise<void>;
}

class DatabaseConnectionFactoryClass<TSchema extends Record<string, unknown>> {
  private sqlConnection: SQLConnection | null = null;
  private dbConnection: NodePgDatabase<TSchema> | null = null;
  private replicaSqlConnection: SQLConnection | null = null;
  private replicaDbConnection: NodePgDatabase<TSchema> | null = null;
  private usesSameConnection = false;
  private isClosed = false;
  private readonly config: Required<Pick<DatabaseConfig<TSchema>, 'serviceName'>> & DatabaseConfig<TSchema>;
  private readonly logger;

  constructor(config: DatabaseConfig<TSchema>) {
    this.config = {
      ...config,
      envVarName: config.envVarName || 'DATABASE_URL',
      fallbackEnvVar: config.fallbackEnvVar || 'DATABASE_URL',
    };
    this.logger = createLogger(`${config.serviceName}-database`);
  }

  private logTracingStatus(): void {
    if (otelApi) {
      this.logger.debug('OpenTelemetry API available - database tracing enabled', {
        serviceName: this.config.serviceName,
      });
    } else {
      this.logger.debug('OpenTelemetry API not available - database tracing disabled', {
        serviceName: this.config.serviceName,
      });
    }
  }

  private getConnectionString(): string {
    const { envVarName, fallbackEnvVar, serviceName } = this.config;
    const connectionString = process.env[envVarName!] || process.env[fallbackEnvVar!];

    if (!connectionString) {
      const error = new Error(`${envVarName} or ${fallbackEnvVar} environment variable is required for ${serviceName}`);
      this.logger.error('Database URL not configured', {
        serviceName,
        requiredEnvVar: `${envVarName} or ${fallbackEnvVar}`,
      });
      throw error;
    }

    return this.appendConnectionParams(connectionString);
  }

  private getSslConfig(connStr: string): false | { rejectUnauthorized: boolean } {
    if (process.env.DATABASE_SSL === 'false') {
      return false;
    }
    try {
      const url = new URL(connStr);
      const host = url.hostname;
      // Local, Railway internal, and other private network connections don't need SSL
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) {
        return false;
      }
      // Check for explicit sslmode=disable in connection string
      if (url.searchParams.get('sslmode') === 'disable') {
        return false;
      }
    } catch {
      // fall through
    }
    return { rejectUnauthorized: false };
  }

  private getReplicaConnectionString(): string {
    const { replicaEnvVar } = this.config;
    const replicaUrl = replicaEnvVar ? process.env[replicaEnvVar] : undefined;
    const primaryUrl = process.env[this.config.envVarName!] || process.env[this.config.fallbackEnvVar!];

    if (!replicaUrl || replicaUrl === primaryUrl) {
      this.usesSameConnection = true;
      return this.getConnectionString();
    }

    this.usesSameConnection = false;
    return this.appendConnectionParams(replicaUrl);
  }

  private appendConnectionParams(connStr: string): string {
    const statementTimeout = parseInt(
      process.env.STATEMENT_TIMEOUT_MS || String(timeoutHierarchy.getDatabaseTimeout(this.config.serviceName))
    );
    if (!connStr.includes('statement_timeout=')) {
      connStr += connStr.includes('?')
        ? `&statement_timeout=${statementTimeout}`
        : `?statement_timeout=${statementTimeout}`;
    }
    return connStr;
  }

  private createPool(connStr: string): Pool {
    const maxConnections = parseInt(
      process.env.DATABASE_POOL_MAX || (process.env.NODE_ENV === 'production' ? '20' : '5')
    );
    return new Pool({
      connectionString: connStr,
      max: maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: this.getSslConfig(connStr),
    });
  }

  public getSQLConnection(): SQLConnection {
    if (!this.sqlConnection) {
      const tracer = otelApi?.trace?.getTracer('database');
      const span =
        tracer?.startActiveSpan?.(`db.getSQLConnection`, (s: OtelSpan) => {
          return s;
        }) ?? null;
      if (span) {
        span.setAttribute('db.system', 'postgresql');
        span.setAttribute('db.service', this.config.serviceName);
      }
      try {
        const connStr = this.getConnectionString();
        const dbType = process.env[this.config.envVarName!] ? 'isolated' : 'shared';
        this.logger.debug(`Using ${dbType} database`);
        this.sqlConnection = this.createPool(connStr);
        this.logger.debug(`SQL connection pool established with ${dbType} database`, {
          serviceName: this.config.serviceName,
        });
        if (span) span.setStatus({ code: otelApi!.SpanStatusCode.OK });
      } catch (error: unknown) {
        if (span) {
          span.setStatus({
            code: otelApi!.SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'unknown',
          });
          span.recordException(error);
        }
        this.logger.error('SQL connection failed', {
          serviceName: this.config.serviceName,
          error: serializeError(error),
        });
        throw error;
      } finally {
        span?.end();
      }
    }
    return this.sqlConnection;
  }

  public getDatabase(mode: 'read' | 'write' = 'write'): NodePgDatabase<TSchema> {
    if (mode === 'read') {
      return this.getReplicaDatabase();
    }

    if (!this.dbConnection) {
      const tracer = otelApi?.trace?.getTracer('database');
      const span =
        tracer?.startActiveSpan?.(`db.getDatabase`, (s: OtelSpan) => {
          return s;
        }) ?? null;
      if (span) {
        span.setAttribute('db.system', 'postgresql');
        span.setAttribute('db.service', this.config.serviceName);
      }
      try {
        const pool = this.getSQLConnection();
        this.dbConnection = drizzle(pool, { schema: this.config.schema }) as NodePgDatabase<TSchema>;
        this.logger.debug('Drizzle database connection established');
        this.logTracingStatus();
        if (span) span.setStatus({ code: otelApi!.SpanStatusCode.OK });
      } catch (error: unknown) {
        if (span) {
          span.setStatus({
            code: otelApi!.SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'unknown',
          });
          span.recordException(error);
        }
        this.logger.error('Drizzle connection failed', {
          serviceName: this.config.serviceName,
          error: serializeError(error),
        });
        throw error;
      } finally {
        span?.end();
      }
    }
    return this.dbConnection;
  }

  private getReplicaDatabase(): NodePgDatabase<TSchema> {
    const replicaConnStr = this.getReplicaConnectionString();

    if (this.usesSameConnection) {
      return this.getDatabase('write');
    }

    if (!this.replicaDbConnection) {
      try {
        this.replicaSqlConnection = this.createPool(replicaConnStr);
        this.replicaDbConnection = drizzle(this.replicaSqlConnection, {
          schema: this.config.schema,
        }) as NodePgDatabase<TSchema>;
        this.logger.info('Read replica Drizzle connection established');
      } catch (error) {
        this.logger.error('Read replica connection failed, falling back to primary', {
          error: serializeError(error),
        });
        return this.getDatabase('write');
      }
    }
    return this.replicaDbConnection;
  }

  public createSQLRepository<T>(RepositoryClass: new (sql: SQLConnection) => T): T {
    const sql = this.getSQLConnection();
    return new RepositoryClass(sql);
  }

  public createDrizzleRepository<T>(RepositoryClass: new (db: NodePgDatabase<TSchema>) => T): T {
    const db = this.getDatabase();
    return new RepositoryClass(db);
  }

  public reset(): void {
    this.sqlConnection = null;
    this.dbConnection = null;
    this.replicaSqlConnection = null;
    this.replicaDbConnection = null;
    this.logger.info('Database connections reset');
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    this.logger.info('Closing database connections', { serviceName: this.config.serviceName });
    if (this.sqlConnection) await this.sqlConnection.end();
    if (this.replicaSqlConnection && !this.usesSameConnection) await this.replicaSqlConnection.end();
    this.sqlConnection = null;
    this.dbConnection = null;
    this.replicaSqlConnection = null;
    this.replicaDbConnection = null;
    this.logger.info('Database connection pools closed', {
      serviceName: this.config.serviceName,
    });
  }
}

const factoryInstances = new Map<string, DatabaseConnectionFactoryClass<Record<string, unknown>>>();

export function createDatabaseConnectionFactory<TSchema extends Record<string, unknown> = Record<string, unknown>>(
  config: DatabaseConfig<TSchema>
): DatabaseConnectionFactoryInstance<TSchema> {
  const getInstance = (): DatabaseConnectionFactoryClass<TSchema> => {
    if (!factoryInstances.has(config.serviceName)) {
      factoryInstances.set(config.serviceName, new DatabaseConnectionFactoryClass(config));
    }
    return factoryInstances.get(config.serviceName)! as DatabaseConnectionFactoryClass<TSchema>;
  };

  const closeFactory = async () => {
    const instance = factoryInstances.get(config.serviceName);
    if (instance) {
      await instance.close();
      factoryInstances.delete(config.serviceName);
    }
  };

  registerPhasedShutdownHook('connections', closeFactory, `database:${config.serviceName}`);

  return {
    getInstance,
    getDatabase: (mode?: 'read' | 'write') => getInstance().getDatabase(mode),
    getSQLConnection: () => getInstance().getSQLConnection(),
    createSQLRepository: <T>(RepositoryClass: new (sql: SQLConnection) => T) =>
      getInstance().createSQLRepository(RepositoryClass),
    createDrizzleRepository: <T>(RepositoryClass: new (db: NodePgDatabase<TSchema>) => T) =>
      getInstance().createDrizzleRepository(RepositoryClass),
    createDrizzleRepositoryRead: <T>(RepositoryClass: new (db: NodePgDatabase<TSchema>) => T) =>
      new RepositoryClass(getInstance().getDatabase('read')),
    reset: () => {
      const instance = factoryInstances.get(config.serviceName);
      if (instance) {
        instance.reset();
        factoryInstances.delete(config.serviceName);
      }
    },
    close: closeFactory,
  };
}

export function resetAllDatabaseConnections(): void {
  for (const [_serviceName, instance] of factoryInstances.entries()) {
    instance.reset();
  }
  factoryInstances.clear();
}

export { DatabaseConnectionFactoryClass };
