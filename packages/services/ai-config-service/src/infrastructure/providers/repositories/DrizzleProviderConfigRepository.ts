/**
 * Drizzle Provider Configuration Repository
 * Implements provider configuration persistence using Drizzle ORM with singleton connection
 */

import { eq, and, desc } from 'drizzle-orm';
import { IProviderConfigRepository } from '@domains/providers/domain/repositories/IProviderConfigRepository';
import {
  ProviderConfigFilter,
  ProviderConfiguration,
  ProviderType,
  InsertProviderConfiguration,
} from '@domains/providers/domain/entities/ProviderConfiguration';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { providerConfigurations, providerHealthCheckLog, InsertProviderHealthCheckLog } from '@schema/schema';
import { getLogger } from '@config/service-urls';
import { errorMessage, errorStack } from '@aiponge/platform-core';
import { ConfigError } from '../../../application/errors';

const logger = getLogger('drizzle-provider-config-repository');

export class DrizzleProviderConfigRepository implements IProviderConfigRepository {
  constructor(private readonly db: DatabaseConnection) {
    logger.debug('🏗️ Repository initialized', {
      module: 'postgresql_provider_config_repository',
      operation: 'constructor',
      phase: 'repository_initialized',
    });
  }

  /**
   * Create a new provider configuration
   */
  async create(config: InsertProviderConfiguration): Promise<ProviderConfiguration> {
    try {
      const result = await this.db
        .insert(providerConfigurations)
        .values({
          ...config,
          updatedAt: new Date(),
        })
        .returning();

      const created = result[0];
      logger.info('Created provider configuration', {
        module: 'postgresql_provider_config_repository',
        operation: 'create',
        providerId: created.providerId,
        phase: 'provider_configuration_created',
      });

      return created;
    } catch (error) {
      logger.error('Failed to create provider configuration', {
        module: 'postgresql_provider_config_repository',
        operation: 'create',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_configuration_creation_failed',
      });
      throw ConfigError.internalError(
        `Failed to create provider configuration: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find provider configuration by ID
   */
  async findById(id: number): Promise<ProviderConfiguration | null> {
    try {
      const result = await this.db
        .select()
        .from(providerConfigurations)
        .where(eq(providerConfigurations.id, id))
        .limit(1);

      const provider = result[0];
      if (!provider) {
        return null;
      }

      return provider;
    } catch (error) {
      logger.error('Failed to find provider by ID', {
        module: 'postgresql_provider_config_repository',
        operation: 'findById',
        providerId: id,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_lookup_failed',
      });
      throw ConfigError.internalError(
        `Failed to find provider by ID: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find all provider configurations with optional filtering
   */
  async findAll(filter?: ProviderConfigFilter): Promise<ProviderConfiguration[]> {
    try {
      // Build conditions array
      const conditions = [];

      // Apply filters
      if (filter) {
        if (filter.providerId) {
          conditions.push(eq(providerConfigurations.providerId, filter.providerId));
        }

        if (filter.providerType) {
          conditions.push(eq(providerConfigurations.providerType, filter.providerType));
        }

        if (filter.isActive !== undefined) {
          conditions.push(eq(providerConfigurations.isActive, filter.isActive));
        } else if (!filter.includeInactive) {
          // Only add isActive=true if not explicitly set via filter.isActive
          conditions.push(eq(providerConfigurations.isActive, true));
        }

        if (filter.isPrimary !== undefined) {
          conditions.push(eq(providerConfigurations.isPrimary, filter.isPrimary));
        }

        if (filter.healthStatus) {
          conditions.push(eq(providerConfigurations.healthStatus, filter.healthStatus));
        }
      }

      // Build and execute query with conditions and ordering in a single chain
      const results =
        conditions.length > 0
          ? await this.db
              .select()
              .from(providerConfigurations)
              .where(and(...conditions))
              .orderBy(providerConfigurations.priority, desc(providerConfigurations.createdAt))
          : await this.db
              .select()
              .from(providerConfigurations)
              .orderBy(providerConfigurations.priority, desc(providerConfigurations.createdAt));

      logger.info('Found provider configurations', {
        module: 'postgresql_provider_config_repository',
        operation: 'findAll',
        configurationCount: results.length,
        phase: 'provider_configurations_found',
      });

      return results;
    } catch (error) {
      logger.error('Failed to find all providers', {
        module: 'postgresql_provider_config_repository',
        operation: 'findAll',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_configurations_lookup_failed',
      });
      throw ConfigError.internalError(
        `Failed to find all providers: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update provider configuration
   */
  async update(id: number, updates: Partial<InsertProviderConfiguration>): Promise<ProviderConfiguration> {
    try {
      const result = await this.db
        .update(providerConfigurations)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(providerConfigurations.id, id))
        .returning();

      if (result.length === 0) {
        throw ConfigError.providerNotFound(String(id));
      }

      const updated = result[0];
      logger.info('Updated provider configuration', {
        module: 'postgresql_provider_config_repository',
        operation: 'update',
        providerId: updated.providerId,
        phase: 'provider_configuration_updated',
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update provider configuration', {
        module: 'postgresql_provider_config_repository',
        operation: 'update',
        providerId: id,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_configuration_update_failed',
      });
      throw ConfigError.internalError(
        `Failed to update provider configuration: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete provider configuration
   */
  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.db.delete(providerConfigurations).where(eq(providerConfigurations.id, id)).returning();

      const success = result.length > 0;
      if (success) {
        logger.info('Deleted provider configuration', {
          module: 'postgresql_provider_config_repository',
          operation: 'delete',
          providerId: id,
          phase: 'provider_configuration_deleted',
        });
      }

      return success;
    } catch (error) {
      logger.error('Failed to delete provider configuration', {
        module: 'postgresql_provider_config_repository',
        operation: 'delete',
        providerId: id,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_configuration_deletion_failed',
      });
      throw ConfigError.internalError(
        `Failed to delete provider configuration: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find provider by provider ID and type
   */
  async findByProviderAndType(providerId: string, providerType: ProviderType): Promise<ProviderConfiguration | null> {
    try {
      const result = await this.db
        .select()
        .from(providerConfigurations)
        .where(
          and(eq(providerConfigurations.providerId, providerId), eq(providerConfigurations.providerType, providerType))
        )
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Failed to find provider by type', {
        module: 'postgresql_provider_config_repository',
        operation: 'findByProviderIdAndType',
        providerId,
        providerType,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'provider_lookup_by_type_failed',
      });
      throw ConfigError.internalError(
        `Failed to find provider: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find primary provider for a given type
   */
  async findPrimaryProvider(providerType: ProviderType): Promise<ProviderConfiguration | null> {
    try {
      const result = await this.db
        .select()
        .from(providerConfigurations)
        .where(
          and(
            eq(providerConfigurations.providerType, providerType),
            eq(providerConfigurations.isPrimary, true),
            eq(providerConfigurations.isActive, true)
          )
        )
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Failed to find primary provider', {
        module: 'postgresql_provider_config_repository',
        operation: 'findPrimaryByType',
        providerType,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'primary_provider_lookup_failed',
      });
      throw ConfigError.internalError(
        `Failed to find primary provider: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find active providers, optionally filtered by type
   */
  async findActiveProviders(providerType?: ProviderType): Promise<ProviderConfiguration[]> {
    return this.findAll({
      isActive: true,
      providerType,
    });
  }

  /**
   * Set provider active/inactive status
   */
  async setProviderActive(id: number, isActive: boolean): Promise<ProviderConfiguration> {
    return this.update(id, { isActive });
  }

  /**
   * Unset primary provider for a given type (set isPrimary = false)
   */
  async unsetPrimaryProvider(providerType: ProviderType): Promise<void> {
    try {
      await this.db
        .update(providerConfigurations)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(and(eq(providerConfigurations.providerType, providerType), eq(providerConfigurations.isPrimary, true)));

      logger.info('Unset primary provider for type', {
        module: 'postgresql_provider_config_repository',
        operation: 'unsetPrimaryProvider',
        providerType,
        phase: 'primary_provider_unset',
      });
    } catch (error) {
      logger.error('Failed to unset primary provider', {
        module: 'postgresql_provider_config_repository',
        operation: 'unsetPrimaryProvider',
        providerType,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'primary_provider_unset_failed',
      });
      throw ConfigError.internalError(
        `Failed to unset primary provider: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Set provider as primary (and unset others of the same type)
   */
  async setPrimaryProvider(id: number): Promise<ProviderConfiguration> {
    try {
      // First get the provider to know its type
      const provider = await this.findById(id);
      if (!provider) {
        throw ConfigError.providerNotFound(String(id));
      }

      // Unset primary for all providers of this type
      await this.unsetPrimaryProvider(provider.providerType);

      // Set this provider as primary
      return this.update(id, { isPrimary: true });
    } catch (error) {
      logger.error('Failed to set primary provider', {
        module: 'postgresql_provider_config_repository',
        operation: 'setPrimaryProvider',
        providerId: id,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'primary_provider_set_failed',
      });
      throw ConfigError.internalError(
        `Failed to set primary provider: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update health status of a provider
   */
  async updateHealthStatus(id: number, status: 'healthy' | 'error' | 'unknown'): Promise<ProviderConfiguration> {
    return this.update(id, { healthStatus: status });
  }

  /**
   * Get providers with specific health status
   */
  async getProvidersWithHealthStatus(status: 'healthy' | 'error' | 'unknown'): Promise<ProviderConfiguration[]> {
    return this.findAll({ healthStatus: status });
  }

  /**
   * Bulk update multiple providers
   */
  async bulkUpdateProviders(
    updates: Array<{ id: number; updates: Partial<InsertProviderConfiguration> }>
  ): Promise<ProviderConfiguration[]> {
    const results: ProviderConfiguration[] = [];

    // For now, we'll do individual updates. In a real implementation,
    // we might use a transaction or batch update
    for (const update of updates) {
      try {
        const result = await this.update(update.id, update.updates);
        results.push(result);
      } catch (error) {
        logger.error('Failed to bulk update provider', {
          module: 'postgresql_provider_config_repository',
          operation: 'bulkUpdate',
          providerId: update.id,
          error: { message: errorMessage(error), stack: errorStack(error) },
          phase: 'bulk_update_provider_failed',
        });
        // Continue with other updates
      }
    }

    logger.info('Bulk update completed', {
      module: 'postgresql_provider_config_repository',
      operation: 'bulkUpdate',
      successCount: results.length,
      totalCount: updates.length,
      phase: 'bulk_update_completed',
    });
    return results;
  }

  /**
   * Bulk set active status for multiple providers
   */
  async bulkSetActive(ids: number[], isActive: boolean): Promise<ProviderConfiguration[]> {
    const updates = ids.map(id => ({ id, updates: { isActive } }));
    return this.bulkUpdateProviders(updates);
  }

  /**
   * Close database connections for graceful shutdown
   * Note: With DI pattern, connection lifecycle is managed by DatabaseConnectionFactory
   */
  async close(): Promise<void> {
    logger.info('Repository close called - connection managed by DatabaseConnectionFactory', {
      module: 'postgresql_provider_config_repository',
      operation: 'close',
      phase: 'repository_close_called',
    });
  }

  /**
   * Log health check result
   */
  async logHealthCheck(log: InsertProviderHealthCheckLog): Promise<void> {
    try {
      await this.db.insert(providerHealthCheckLog).values(log);
    } catch (error) {
      logger.error('Failed to log health check', {
        module: 'postgresql_provider_config_repository',
        operation: 'logHealthCheck',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'health_check_logging_failed',
      });
    }
  }
}
