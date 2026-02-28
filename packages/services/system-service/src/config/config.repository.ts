/**
 * System Config Repository
 *
 * Database operations for system configuration
 */

import { eq, sql } from 'drizzle-orm';
import { systemConfig } from '../schema/system-schema';
import { getDatabase } from '../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from './service-urls';
import * as schema from '../schema/system-schema';

const logger = getLogger('config-repository');

export interface ConfigRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, description?: string, updatedBy?: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  getAll(): Promise<Array<{ key: string; value: unknown; description?: string; updatedAt: Date }>>;
}

const repositoryInstance: ConfigRepository | null = null;

export function createConfigRepository(): ConfigRepository {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const db = getDatabase('system-service', schema);
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const result = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);

        if (result.length === 0) {
          return null;
        }

        return result[0].value as T;
      } catch (error) {
        logger.error('Failed to get config', { key, error });
        throw error;
      }
    },

    async set<T>(key: string, value: T, description?: string, updatedBy?: string): Promise<void> {
      try {
        const existing = await db
          .select({ id: systemConfig.id })
          .from(systemConfig)
          .where(eq(systemConfig.key, key))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(systemConfig)
            .set({
              value: value as Record<string, unknown>,
              description: description || undefined,
              updatedBy: updatedBy || undefined,
              updatedAt: sql`NOW()`,
            })
            .where(eq(systemConfig.key, key));
        } else {
          await db.insert(systemConfig).values({
            key,
            value: value as Record<string, unknown>,
            description: description || undefined,
            updatedBy: updatedBy || undefined,
          });
        }

        logger.info('Config saved', { key, updatedBy });
      } catch (error) {
        logger.error('Failed to set config', { key, error });
        throw error;
      }
    },

    async delete(key: string): Promise<boolean> {
      try {
        const result = await db.delete(systemConfig).where(eq(systemConfig.key, key));

        return true;
      } catch (error) {
        logger.error('Failed to delete config', { key, error });
        throw error;
      }
    },

    async getAll(): Promise<Array<{ key: string; value: unknown; description?: string; updatedAt: Date }>> {
      try {
        const results = await db.select().from(systemConfig);
        return results.map(row => ({
          key: row.key,
          value: row.value,
          description: row.description || undefined,
          updatedAt: row.updatedAt,
        }));
      } catch (error) {
        logger.error('Failed to get all configs', { error });
        throw error;
      }
    },
  };
}
