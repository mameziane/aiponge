/**
 * Orphaned Record Cleanup Service
 *
 * Scans for and cleans up orphaned records across services.
 * Orphaned records occur when:
 * - A user was deleted but some cross-service data wasn't properly cleaned up
 * - Service communication failures during deletion
 * - Race conditions between services
 *
 * This service should be run periodically (e.g., daily) to ensure data consistency.
 */

import { getLogger, getServiceUrl, createServiceHttpClient } from '../../config/service-urls';
import { signUserIdHeader, serializeError } from '@aiponge/platform-core';
import { getDatabase, type DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { sql } from 'drizzle-orm';

const logger = getLogger('orphaned-record-cleanup-service');
const httpClient = createServiceHttpClient('internal');

export interface OrphanScanResult {
  service: string;
  table: string;
  orphanedCount: number;
  cleanedCount: number;
  errors: string[];
}

export interface CleanupReport {
  scanStartedAt: Date;
  scanCompletedAt: Date;
  totalOrphansFound: number;
  totalCleaned: number;
  results: OrphanScanResult[];
  overallSuccess: boolean;
}

export class OrphanedRecordCleanupService {
  /**
   * Run a full orphan scan and cleanup across all services
   * @param dryRun If true, only report orphans without deleting
   */
  async runCleanup(dryRun: boolean = false): Promise<CleanupReport> {
    const scanStartedAt = new Date();
    logger.info('Starting orphaned record cleanup scan', { dryRun });

    const results: OrphanScanResult[] = [];

    try {
      const localResults = await this.scanLocalOrphans(dryRun);
      results.push(...localResults);

      const musicResults = await this.scanMusicServiceOrphans(dryRun);
      results.push(...musicResults);

      const storageResults = await this.scanStorageServiceOrphans(dryRun);
      results.push(...storageResults);
    } catch (error) {
      logger.error('Orphan cleanup scan failed', { error: serializeError(error) });
    }

    const scanCompletedAt = new Date();
    const totalOrphansFound = results.reduce((sum, r) => sum + r.orphanedCount, 0);
    const totalCleaned = results.reduce((sum, r) => sum + r.cleanedCount, 0);

    const report: CleanupReport = {
      scanStartedAt,
      scanCompletedAt,
      totalOrphansFound,
      totalCleaned,
      results,
      overallSuccess: results.every(r => r.errors.length === 0),
    };

    logger.info('Orphaned record cleanup completed', {
      durationMs: scanCompletedAt.getTime() - scanStartedAt.getTime(),
      totalOrphansFound,
      totalCleaned,
      dryRun,
    });

    return report;
  }

  /**
   * Scan local user-service tables for orphaned records
   * (Records with user_id that doesn't exist in usr_accounts)
   */
  private async scanLocalOrphans(dryRun: boolean): Promise<OrphanScanResult[]> {
    const db = getDatabase();
    const results: OrphanScanResult[] = [];

    // Tables with user_id column
    const userIdTables = [
      'usr_profiles',
      'usr_insights',
      'usr_reflections',
      'usr_user_patterns',
      'usr_user_personas',
      'usr_profile_analytics',
      'usr_profile_theme_frequencies',
      'usr_profile_metrics',
      'usr_member_intake_responses',
      'usr_reminders',
      'usr_expo_push_tokens',
      'usr_consent_records',
      'usr_import_backups',
      'usr_risk_flags',
      'usr_subscriptions',
      'usr_usage_limits',
      'usr_subscription_events',
      'usr_guest_conversion_state',
      'usr_user_credits',
      'usr_credit_transactions',
      'usr_credit_orders',
      'usr_user_sessions',
      'usr_password_reset_tokens',
      'usr_sms_verification_codes',
      'usr_token_blacklist',
      'usr_audit_logs',
      'usr_share_links',
      // NOTE: usr_data_requests intentionally excluded - required for GDPR audit trail
    ];

    // Tables with user_id column (unified library system)
    const libraryTables = ['lib_books', 'lib_book_generation_requests', 'lib_user_library'];

    // Tables with non-standard user reference columns
    const specialTables = [
      { table: 'usr_credit_gifts', column: 'sender_id' },
      { table: 'usr_guest_data_migrations', column: 'new_user_id' },
    ];

    // Process user_id tables
    for (const tableName of userIdTables) {
      const result = await this.scanTableForOrphans(db, tableName, 'user_id', dryRun);
      if (result) results.push(result);
    }

    // Process library tables (also use user_id)
    for (const tableName of libraryTables) {
      const result = await this.scanTableForOrphans(db, tableName, 'user_id', dryRun);
      if (result) results.push(result);
    }

    // Process tables with non-standard user reference columns
    for (const { table, column } of specialTables) {
      const result = await this.scanTableForOrphans(db, table, column, dryRun);
      if (result) results.push(result);
    }

    return results;
  }

  private async scanTableForOrphans(
    db: DatabaseConnection,
    tableName: string,
    userIdColumn: string,
    dryRun: boolean
  ): Promise<OrphanScanResult | null> {
    try {
      // Use raw SQL with dynamic column name for flexibility
      const countResult = await db.execute(
        sql.raw(`
        SELECT COUNT(*) as orphan_count 
        FROM ${tableName} t
        WHERE NOT EXISTS (
          SELECT 1 FROM usr_accounts u WHERE u.id = t.${userIdColumn}
        )
      `)
      );

      const orphanCount = parseInt((countResult[0] as Record<string, unknown>)?.orphan_count as string || '0', 10);

      let cleanedCount = 0;
      const errors: string[] = [];

      if (orphanCount > 0 && !dryRun) {
        try {
          await db.execute(
            sql.raw(`
            DELETE FROM ${tableName} t
            WHERE NOT EXISTS (
              SELECT 1 FROM usr_accounts u WHERE u.id = t.${userIdColumn}
            )
          `)
          );
          cleanedCount = orphanCount;
          logger.info(`Cleaned orphaned records from ${tableName}`, { count: cleanedCount });
        } catch (deleteError) {
          errors.push(`Failed to delete: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
        }
      }

      if (orphanCount > 0) {
        return {
          service: 'user-service',
          table: tableName,
          orphanedCount: orphanCount,
          cleanedCount,
          errors,
        };
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to scan ${tableName} for orphans`, {
        error: serializeError(error),
      });
      return null;
    }
  }

  /**
   * Request orphan scan from music-service
   */
  private async scanMusicServiceOrphans(dryRun: boolean): Promise<OrphanScanResult[]> {
    try {
      const musicServiceUrl = getServiceUrl('music-service');
      const response = await httpClient.postWithResponse<{ results?: OrphanScanResult[] }>(
        `${musicServiceUrl}/api/admin/orphan-scan`,
        { dryRun },
        { headers: { ...signUserIdHeader('system') }, timeout: 30000 }
      );

      if (response.ok) {
        return response.data.results || [];
      }

      logger.warn('Music service orphan scan failed', { status: response.status });
      return [];
    } catch (error) {
      logger.warn('Failed to contact music-service for orphan scan', {
        error: serializeError(error),
      });
      return [];
    }
  }

  /**
   * Request orphan scan from storage-service
   */
  private async scanStorageServiceOrphans(dryRun: boolean): Promise<OrphanScanResult[]> {
    try {
      const storageServiceUrl = getServiceUrl('storage-service');
      const response = await httpClient.postWithResponse<{ results?: OrphanScanResult[] }>(
        `${storageServiceUrl}/api/admin/orphan-scan`,
        { dryRun },
        { headers: { ...signUserIdHeader('system') }, timeout: 30000 }
      );

      if (response.ok) {
        return response.data.results || [];
      }

      logger.warn('Storage service orphan scan failed', { status: response.status });
      return [];
    } catch (error) {
      logger.warn('Failed to contact storage-service for orphan scan', {
        error: serializeError(error),
      });
      return [];
    }
  }

  /**
   * Verify cross-service references are valid
   * Checks that references in external services point to existing entities in user-service
   */
  async verifyCrossServiceReferences(): Promise<{
    valid: boolean;
    invalidReferences: Array<{
      service: string;
      referenceType: string;
      referenceId: string;
      error: string;
    }>;
  }> {
    const invalidReferences: Array<{
      service: string;
      referenceType: string;
      referenceId: string;
      error: string;
    }> = [];

    try {
      const musicServiceUrl = getServiceUrl('music-service');
      const response = await httpClient.postWithResponse<{ invalidReferences?: Array<{ referenceType: string; referenceId: string; error: string }> }>(
        `${musicServiceUrl}/api/admin/cross-reference-check`,
        {},
        { headers: { ...signUserIdHeader('system') }, timeout: 30000 }
      );

      if (response.ok) {
        if (response.data.invalidReferences) {
          invalidReferences.push(
            ...response.data.invalidReferences.map((ref: { referenceType: string; referenceId: string; error: string }) => ({
              service: 'music-service',
              ...ref,
            }))
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to verify cross-service references with music-service', {
        error: serializeError(error),
      });
    }

    return {
      valid: invalidReferences.length === 0,
      invalidReferences,
    };
  }

  /**
   * Verify a specific user's data has been completely cleaned up
   */
  async verifyUserDataDeleted(userId: string): Promise<{
    fullyDeleted: boolean;
    remainingData: { service: string; tables: string[] }[];
  }> {
    const db = getDatabase();
    const remainingData: { service: string; tables: string[] }[] = [];

    const userIdTables = [
      'usr_accounts',
      'usr_profiles',
      'usr_insights',
      'usr_user_patterns',
      'usr_user_personas',
      'usr_subscriptions',
      'usr_usage_limits',
      'usr_user_credits',
      'usr_audit_logs',
    ];
    const libraryTables = ['lib_books'];

    const localTablesWithData: string[] = [];

    for (const tableName of userIdTables) {
      try {
        const query = sql`
          SELECT COUNT(*) as cnt 
          FROM ${sql.identifier(tableName)} 
          WHERE ${tableName === 'usr_accounts' ? sql`id` : sql`user_id`} = ${userId}
        `;
        const result = await db.execute(query);
        const count = parseInt((result[0] as Record<string, unknown>)?.cnt as string || '0', 10);
        if (count > 0) {
          localTablesWithData.push(tableName);
        }
      } catch (err) {
        logger.debug('Failed to check table for orphaned records', {
          tableName,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const tableName of libraryTables) {
      try {
        const query = sql`
          SELECT COUNT(*) as cnt 
          FROM ${sql.identifier(tableName)} 
          WHERE user_id = ${userId}
        `;
        const result = await db.execute(query);
        const count = parseInt((result[0] as Record<string, unknown>)?.cnt as string || '0', 10);
        if (count > 0) {
          localTablesWithData.push(tableName);
        }
      } catch (err) {
        logger.debug('Failed to check library table for orphaned records', {
          tableName,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (localTablesWithData.length > 0) {
      remainingData.push({ service: 'user-service', tables: localTablesWithData });
    }

    try {
      const musicServiceUrl = getServiceUrl('music-service');
      const response = await httpClient.getWithResponse<{ tablesWithData?: string[] }>(
        `${musicServiceUrl}/api/admin/verify-user-deleted/${userId}`,
        { headers: signUserIdHeader('system'), timeout: 30000 }
      );
      if (response.ok) {
        if (response.data.tablesWithData?.length > 0) {
          remainingData.push({ service: 'music-service', tables: response.data.tablesWithData });
        }
      }
    } catch (err) {
      logger.debug('Failed to verify user deletion in music-service', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const storageServiceUrl = getServiceUrl('storage-service');
      const response = await httpClient.getWithResponse<{ tablesWithData?: string[] }>(
        `${storageServiceUrl}/api/admin/verify-user-deleted/${userId}`,
        { headers: signUserIdHeader('system'), timeout: 30000 }
      );
      if (response.ok) {
        const data = response.data;
        if (data.tablesWithData?.length > 0) {
          remainingData.push({ service: 'storage-service', tables: data.tablesWithData });
        }
      }
    } catch (err) {
      logger.debug('Failed to verify user deletion in storage-service', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      fullyDeleted: remainingData.length === 0,
      remainingData,
    };
  }
}
