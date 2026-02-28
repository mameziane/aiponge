/**
 * TimescaleDB Manager
 * Handles TimescaleDB-specific operations, health checks, and maintenance
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { errorMessage, errorStack } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../../application/errors';

const logger = getLogger('timescaledb-manager');

export interface TimescaleDBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface HypertableStatus {
  hypertableName: string;
  chunkCount: number;
  compressedChunks: number;
  compressionRatio: number;
  oldestData: Date;
  newestData: Date;
  totalSize: string;
  compressedSize: string;
}

export interface TimescaleHealthCheck {
  isTimescaleEnabled: boolean;
  version: string;
  hypertables: HypertableStatus[];
  compressionStats: {
    totalChunks: number;
    compressedChunks: number;
    compressionRatio: number;
    spaceSaved: string;
  };
  policies: {
    compressionPolicies: number;
    retentionPolicies: number;
    continuousAggregates: number;
  };
  performance: {
    avgQueryTime: number;
    chunksAccessed: number;
    indexEfficiency: number;
  };
}

export class TimescaleDBManager {
  private pool: Pool;
  private setupPath: string;

  constructor(config: TimescaleDBConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: true } : false,
      // SCALABILITY: Increased pool size for high-throughput analytics operations
      // 10 in dev (prevents blocking), 50 in production (supports 400+ concurrent users)
      max:
        config.maxConnections ||
        parseInt(process.env.AI_ANALYTICS_DATABASE_POOL_MAX || process.env.DATABASE_POOL_MAX || '50'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: parseInt(process.env.STATEMENT_TIMEOUT_MS || '30000'),
    });

    this.setupPath = path.join(__dirname, 'timescale-setup.sql');

    this.pool.on('error', err => {
      logger.error('Pool error', {
        module: 'timescaledb_manager',
        operation: 'constructor',
        error: { message: err.message, stack: err.stack },
        phase: 'pool_error',
      });
    });

    logger.info('Manager initialized', {
      module: 'timescaledb_manager',
      operation: 'constructor',
      phase: 'manager_initialized',
    });
  }

  /**
   * Initialize TimescaleDB with hypertables, compression, and policies
   */
  async initialize(): Promise<void> {
    logger.info('Starting initialization', {
      module: 'timescaledb_manager',
      operation: 'initialize',
      phase: 'initialization_started',
    });

    try {
      // Check if TimescaleDB extension is available
      await this.ensureTimescaleExtension();

      // Run setup script
      await this.runSetupScript();

      // Verify setup
      const health = await this.getHealthStatus();
      logger.info('Initialization completed successfully', {
        module: 'timescaledb_manager',
        operation: 'initialize',
        phase: 'initialization_completed',
      });
      logger.info('Created hypertables', {
        module: 'timescaledb_manager',
        operation: 'initialize',
        hypertablesCount: health.hypertables.length,
        phase: 'hypertables_created',
      });
      logger.info('Active policies configured', {
        module: 'timescaledb_manager',
        operation: 'initialize',
        compressionPolicies: health.policies.compressionPolicies,
        retentionPolicies: health.policies.retentionPolicies,
        phase: 'policies_configured',
      });
    } catch (error) {
      logger.error('Initialization failed', {
        module: 'timescaledb_manager',
        operation: 'initialize',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'initialization_failed',
      });
      throw error;
    }
  }

  /**
   * Get comprehensive TimescaleDB health status
   */
  async getHealthStatus(): Promise<TimescaleHealthCheck> {
    try {
      const [versionResult, hypertablesResult, compressionResult, policiesResult, performanceResult] =
        await Promise.all([
          this.getTimescaleVersion(),
          this.getHypertableStatus(),
          this.getCompressionStats(),
          this.getPolicyStats(),
          this.getPerformanceStats(),
        ]);

      return {
        isTimescaleEnabled: true,
        version: versionResult,
        hypertables: hypertablesResult,
        compressionStats: compressionResult,
        policies: policiesResult,
        performance: performanceResult,
      };
    } catch (error) {
      logger.error('Health check failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        isTimescaleEnabled: false,
        version: 'unknown',
        hypertables: [],
        compressionStats: {
          totalChunks: 0,
          compressedChunks: 0,
          compressionRatio: 0,
          spaceSaved: '0 MB',
        },
        policies: {
          compressionPolicies: 0,
          retentionPolicies: 0,
          continuousAggregates: 0,
        },
        performance: {
          avgQueryTime: 0,
          chunksAccessed: 0,
          indexEfficiency: 0,
        },
      };
    }
  }

  /**
   * Force compression on old chunks
   */
  async forceCompression(hypertableName?: string): Promise<void> {
    try {
      let query: string;

      if (hypertableName) {
        query = `SELECT compress_chunk(chunk_name) FROM timescaledb_information.chunks WHERE hypertable_name = $1 AND NOT is_compressed`;
        await this.pool.query(query, [hypertableName]);
        logger.info('Force compression completed for {}', { data0: hypertableName });
      } else {
        query = `SELECT compress_chunk(chunk_name) FROM timescaledb_information.chunks WHERE NOT is_compressed`;
        await this.pool.query(query);
        logger.info('Force compression completed for all hypertables');
      }
    } catch (error) {
      logger.error('Force compression failed:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Run data retention cleanup
   */
  async runRetentionCleanup(): Promise<{ deletedChunks: number; freedSpace: string }> {
    try {
      const beforeStats = await this.getCompressionStats();

      // Trigger retention policy jobs
      const result = await this.pool.query(`
        SELECT run_job(job_id) 
        FROM timescaledb_information.jobs 
        WHERE proc_name = 'policy_retention'
      `);

      const afterStats = await this.getCompressionStats();

      logger.info('Retention cleanup completed');

      return {
        deletedChunks: beforeStats.totalChunks - afterStats.totalChunks,
        freedSpace: beforeStats.spaceSaved, // Simplified calculation
      };
    } catch (error) {
      logger.error('Retention cleanup failed:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Optimize hypertable performance
   */
  async optimizePerformance(): Promise<void> {
    try {
      logger.info('Starting performance optimization...');

      // Update statistics for all hypertables
      const hypertables = await this.getHypertableNames();

      for (const tableName of hypertables) {
        await this.pool.query(`ANALYZE ${tableName}`);
      }

      // Recompute continuous aggregates
      await this.pool.query(`
        SELECT refresh_continuous_aggregate(mat_hypertable_id, NULL, NULL)
        FROM timescaledb_information.continuous_aggregates
      `);

      logger.info('Performance optimization completed');
    } catch (error) {
      logger.error('Performance optimization failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get chunk information for debugging
   */
  async getChunkInfo(hypertableName?: string): Promise<
    Array<{
      chunkName: string;
      rangeStart: Date;
      rangeEnd: Date;
      isCompressed: boolean;
      sizeBefore: string;
      sizeAfter: string;
    }>
  > {
    try {
      let query = `
        SELECT 
          chunk_name,
          range_start,
          range_end,
          is_compressed,
          pg_size_pretty(uncompressed_chunk_size) as size_before,
          pg_size_pretty(compressed_chunk_size) as size_after
        FROM timescaledb_information.chunks
      `;

      const params: string[] = [];
      if (hypertableName) {
        query += ' WHERE hypertable_name = $1';
        params.push(hypertableName);
      }

      query += ' ORDER BY range_start DESC LIMIT 50';

      const result = await this.pool.query(query, params);

      return result.rows.map(row => ({
        chunkName: row.chunk_name,
        rangeStart: new Date(row.range_start),
        rangeEnd: new Date(row.range_end),
        isCompressed: row.is_compressed,
        sizeBefore: row.size_before,
        sizeAfter: row.size_after,
      }));
    } catch (error) {
      logger.error('Failed to get chunk info:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Connection pool closed');
    } catch (error) {
      logger.error('Error closing pool:', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Private helper methods

  private async ensureTimescaleExtension(): Promise<void> {
    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
      logger.info('Extension verified');
    } catch (error) {
      logger.error('Failed to create extension:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.serviceUnavailable('TimescaleDB extension', error instanceof Error ? error : undefined);
    }
  }

  private async runSetupScript(): Promise<void> {
    try {
      const setupSQL = fs.readFileSync(this.setupPath, 'utf-8');
      await this.pool.query(setupSQL);
      logger.info('Setup script executed successfully');
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        logger.warn('Setup script not found, skipping...');
        return;
      }
      logger.error('Setup script failed:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private async getTimescaleVersion(): Promise<string> {
    try {
      const result = await this.pool.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'");
      return result.rows[0]?.extversion || 'unknown';
    } catch (error) {
      logger.warn('Failed to get TimescaleDB version', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'unknown';
    }
  }

  private async getHypertableNames(): Promise<string[]> {
    try {
      const result = await this.pool.query(`
        SELECT hypertable_name 
        FROM timescaledb_information.hypertables
      `);
      return result.rows.map(row => row.hypertable_name);
    } catch (error) {
      logger.warn('Failed to get hypertable names', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  private async getHypertableStatus(): Promise<HypertableStatus[]> {
    try {
      const result = await this.pool.query(`
        SELECT 
          h.hypertable_name,
          COUNT(c.*) as chunk_count,
          COUNT(c.*) FILTER (WHERE c.is_compressed) as compressed_chunks,
          COALESCE(
            ROUND(100.0 * COUNT(c.*) FILTER (WHERE c.is_compressed) / NULLIF(COUNT(c.*), 0), 2),
            0
          ) as compression_ratio,
          MIN(c.range_start) as oldest_data,
          MAX(c.range_end) as newest_data,
          pg_size_pretty(SUM(c.uncompressed_chunk_size)) as total_size,
          pg_size_pretty(SUM(c.compressed_chunk_size)) as compressed_size
        FROM timescaledb_information.hypertables h
        LEFT JOIN timescaledb_information.chunks c ON h.hypertable_name = c.hypertable_name
        GROUP BY h.hypertable_name
        ORDER BY h.hypertable_name
      `);

      return result.rows.map(row => ({
        hypertableName: row.hypertable_name,
        chunkCount: parseInt(row.chunk_count) || 0,
        compressedChunks: parseInt(row.compressed_chunks) || 0,
        compressionRatio: parseFloat(row.compression_ratio) || 0,
        oldestData: row.oldest_data ? new Date(row.oldest_data) : new Date(),
        newestData: row.newest_data ? new Date(row.newest_data) : new Date(),
        totalSize: row.total_size || '0 bytes',
        compressedSize: row.compressed_size || '0 bytes',
      }));
    } catch (error) {
      logger.error('Failed to get hypertable status:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async getCompressionStats(): Promise<TimescaleHealthCheck['compressionStats']> {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total_chunks,
          COUNT(*) FILTER (WHERE is_compressed) as compressed_chunks,
          COALESCE(
            ROUND(100.0 * COUNT(*) FILTER (WHERE is_compressed) / NULLIF(COUNT(*), 0), 2),
            0
          ) as compression_ratio,
          pg_size_pretty(
            SUM(uncompressed_chunk_size) - SUM(compressed_chunk_size)
          ) as space_saved
        FROM timescaledb_information.chunks
      `);

      const row = result.rows[0];
      return {
        totalChunks: parseInt(row.total_chunks) || 0,
        compressedChunks: parseInt(row.compressed_chunks) || 0,
        compressionRatio: parseFloat(row.compression_ratio) || 0,
        spaceSaved: row.space_saved || '0 bytes',
      };
    } catch (error) {
      logger.error('Failed to get compression stats:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalChunks: 0,
        compressedChunks: 0,
        compressionRatio: 0,
        spaceSaved: '0 bytes',
      };
    }
  }

  private async getPolicyStats(): Promise<TimescaleHealthCheck['policies']> {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE proc_name = 'policy_compression') as compression_policies,
          COUNT(*) FILTER (WHERE proc_name = 'policy_retention') as retention_policies,
          COUNT(*) FILTER (WHERE proc_name = 'policy_refresh_continuous_aggregate') as continuous_aggregates
        FROM timescaledb_information.jobs
      `);

      const row = result.rows[0];
      return {
        compressionPolicies: parseInt(row.compression_policies) || 0,
        retentionPolicies: parseInt(row.retention_policies) || 0,
        continuousAggregates: parseInt(row.continuous_aggregates) || 0,
      };
    } catch (error) {
      logger.error('Failed to get policy stats:', { error: error instanceof Error ? error.message : String(error) });
      return {
        compressionPolicies: 0,
        retentionPolicies: 0,
        continuousAggregates: 0,
      };
    }
  }

  private async getPerformanceStats(): Promise<TimescaleHealthCheck['performance']> {
    try {
      // This is a simplified performance check
      // In production, you'd want more sophisticated monitoring
      const start = Date.now();
      await this.pool.query('SELECT 1');
      const queryTime = Date.now() - start;

      return {
        avgQueryTime: queryTime,
        chunksAccessed: 0, // Would require query plan analysis
        indexEfficiency: 0, // Would require index usage statistics
      };
    } catch (error) {
      logger.warn('Failed to get performance stats', { error: error instanceof Error ? error.message : String(error) });
      return {
        avgQueryTime: 0,
        chunksAccessed: 0,
        indexEfficiency: 0,
      };
    }
  }
}
