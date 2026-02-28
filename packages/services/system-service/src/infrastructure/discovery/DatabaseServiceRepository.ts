/**
 * Database-backed Service Repository
 * Replaces in-memory storage with persistent PostgreSQL storage
 */

import { eq, and, desc, sql, lt, inArray } from 'drizzle-orm';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import * as schema from '../../schema/system-schema';
import { getHealthCheckConfig } from '../../config/ConfigurationManager';
import {
  serviceRegistry,
  serviceDependencies,
  type ServiceRegistry,
  type NewServiceDependency,
} from '../../schema/system-schema';
import { INFRASTRUCTURE, HEALTH_STATUS } from '@aiponge/shared-contracts';
import { createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';

const defaultDb = getDatabase('system-service', schema);
type DatabaseConnection = typeof defaultDb;

export type DatabaseHealthStatus = typeof HEALTH_STATUS.HEALTHY | typeof HEALTH_STATUS.UNHEALTHY;

export interface ServiceInfo {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  status: DatabaseHealthStatus;
  dependencies?: ServiceDependency[];
  metadata?: Record<string, unknown>;
}

export interface ServiceDependency {
  name: string;
  type: string;
  timeout?: number;
  healthCheck?: string;
}

export class DatabaseServiceRepository {
  private healthCheckScheduler: IntervalScheduler | null = null;
  private logger = getLogger('database-service-repository');
  private healthCheckingStarted = false;

  constructor(private db: DatabaseConnection = defaultDb) {
    // Don't start health checking immediately - let service finish starting first
    // Call startHealthChecking() manually after service is ready
  }

  /**
   * Warm up the database connection by executing a simple query
   * This ensures the connection pool is established without blocking
   * Retries up to 3 times with 500ms delay to handle connection pool initialization
   */
  async warmConnection(): Promise<void> {
    const maxRetries = INFRASTRUCTURE.MAX_RETRIES;
    const retryDelay = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.db.execute(sql`SELECT 1`);
        this.logger.debug('Database connection warmed up');
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.warn('Database connection warmup failed after retries, will retry on first query', {
            error: error instanceof Error ? error.message : String(error),
            attempts: maxRetries,
          });
        } else {
          // Silent retry - connection pool might still be initializing
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  public startHealthChecking(): void {
    if (this.healthCheckingStarted) {
      return;
    }
    this.healthCheckingStarted = true;
    const healthConfig = getHealthCheckConfig();
    const interval = process.env.REPLIT_DEPLOYMENT
      ? healthConfig.interval.production
      : healthConfig.interval.development;
    this.healthCheckScheduler = createIntervalScheduler({
      name: 'db-service-health-check',
      serviceName: 'system-service',
      intervalMs: interval,
      handler: () => this.performHealthChecks(),
    });
  }

  async updateServiceHealth(serviceId: string, status: DatabaseHealthStatus): Promise<void> {
    try {
      await this.db
        .update(serviceRegistry)
        .set({
          status,
          lastHeartbeat: new Date(),
        })
        .where(eq(serviceRegistry.id, serviceId));
    } catch (error) {
      this.logger.error('❌ Failed to update service health', {
        serviceId,
        error: error instanceof Error ? error.message : String(error),
        component: 'database_repository',
        operation: 'update_health',
      });
    }
  }

  async removeService(serviceId: string): Promise<void> {
    try {
      await this.db.update(serviceRegistry).set({ isActive: false }).where(eq(serviceRegistry.id, serviceId));
      this.logger.info('✅ Service deactivated', {
        serviceId,
        component: 'database_repository',
        operation: 'remove_service',
      });
    } catch (error) {
      this.logger.error('❌ Failed to remove service', {
        serviceId,
        error: error instanceof Error ? error.message : String(error),
        component: 'database_repository',
        operation: 'remove_service',
      });
    }
  }

  async getAllServices(): Promise<ServiceInfo[]> {
    try {
      const results = await this.db
        .select({
          service: serviceRegistry,
          dependencies: sql<NewServiceDependency[]>`
          COALESCE(
            json_agg(
              json_build_object(
                'name', ${serviceDependencies.dependencyName},
                'type', ${serviceDependencies.dependencyType},
                'timeout', ${serviceDependencies.timeout},
                'healthCheck', ${serviceDependencies.healthCheck}
              )
            ) FILTER (WHERE ${serviceDependencies.serviceId} IS NOT NULL),
            '[]'::json
          )
        `,
        })
        .from(serviceRegistry)
        .leftJoin(serviceDependencies, eq(serviceRegistry.id, serviceDependencies.serviceId))
        .where(eq(serviceRegistry.isActive, true))
        .groupBy(serviceRegistry.id)
        .orderBy(desc(serviceRegistry.lastHeartbeat));

      return results.map((row: { service: ServiceRegistry; dependencies: NewServiceDependency[] }) => this.mapToServiceInfo(row.service, row.dependencies));
    } catch (error) {
      this.logger.error('❌ Failed to get all services', {
        module: 'database_repository',
        operation: 'get_all_services',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'query_failure',
      });
      return [];
    }
  }

  async getHealthyServices(): Promise<ServiceInfo[]> {
    try {
      const results = await this.db
        .select({
          service: serviceRegistry,
          dependencies: sql<NewServiceDependency[]>`
          COALESCE(
            json_agg(
              json_build_object(
                'name', ${serviceDependencies.dependencyName},
                'type', ${serviceDependencies.dependencyType},
                'timeout', ${serviceDependencies.timeout},
                'healthCheck', ${serviceDependencies.healthCheck}
              )
            ) FILTER (WHERE ${serviceDependencies.serviceId} IS NOT NULL),
            '[]'::json
          )
        `,
        })
        .from(serviceRegistry)
        .leftJoin(serviceDependencies, eq(serviceRegistry.id, serviceDependencies.serviceId))
        .where(and(eq(serviceRegistry.isActive, true), eq(serviceRegistry.status, HEALTH_STATUS.HEALTHY)))
        .groupBy(serviceRegistry.id)
        .orderBy(desc(serviceRegistry.lastHeartbeat));

      return results.map((row: { service: ServiceRegistry; dependencies: NewServiceDependency[] }) => this.mapToServiceInfo(row.service, row.dependencies));
    } catch (error) {
      this.logger.error('❌ Failed to get healthy services', {
        module: 'database_repository',
        operation: 'get_healthy_services',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'query_failure',
      });
      return [];
    }
  }

  async registerService(service: ServiceInfo): Promise<void> {
    try {
      const now = new Date();

      // Get lease settings from environment configuration
      const { getEnvironmentSettings } = await import('../../config/environment-settings');
      const envSettings = getEnvironmentSettings();
      const leaseSettings = envSettings.leaseSettings;

      // Calculate lease expiry with grace period for new registrations
      const leaseTTL = leaseSettings.defaultLeaseTTL;
      const gracePeriod = leaseSettings.gracePeriod;
      const leaseExpiryAt = new Date(now.getTime() + leaseTTL + gracePeriod);

      this.logger.debug('🔒 Setting service lease', {
        module: 'database_repository',
        operation: 'register_service',
        serviceName: service.name,
        leaseTTL,
        gracePeriod,
        leaseExpiry: leaseExpiryAt.toISOString(),
        phase: 'lease_configuration',
      });

      // Check if service already exists
      const existingService = await this.db
        .select()
        .from(serviceRegistry)
        .where(eq(serviceRegistry.id, service.id))
        .limit(1);

      if (existingService.length > 0) {
        // Update existing service with lease renewal
        await this.db
          .update(serviceRegistry)
          .set({
            name: service.name,
            version: service.version,
            host: service.host,
            port: service.port,
            status: service.status || HEALTH_STATUS.HEALTHY,
            isActive: true,
            lastHeartbeat: now,
            leaseTTL: leaseTTL,
            leaseExpiryAt: leaseExpiryAt,
            updatedAt: now,
            metadata: JSON.stringify(service.metadata || {}),
          })
          .where(eq(serviceRegistry.id, service.id));
        this.logger.info('✅ Service updated with lease renewal', {
          module: 'database_repository',
          operation: 'register_service',
          serviceId: service.id,
          serviceName: service.name,
          version: service.version,
          phase: 'service_update',
        });
      } else {
        // Insert new service with lease
        await this.db.insert(serviceRegistry).values({
          id: service.id,
          name: service.name,
          version: service.version,
          host: service.host,
          port: service.port,
          status: service.status || HEALTH_STATUS.HEALTHY,
          isActive: true,
          lastHeartbeat: now,
          leaseTTL: leaseTTL,
          leaseExpiryAt: leaseExpiryAt,
          registeredAt: now,
          updatedAt: now,
          metadata: JSON.stringify(service.metadata || {}),
        });
        this.logger.info('✅ Service registered with lease', {
          module: 'database_repository',
          operation: 'register_service',
          serviceId: service.id,
          serviceName: service.name,
          version: service.version,
          phase: 'service_registration',
        });
        this.logger.debug('🔒 Service grace period set', {
          module: 'database_repository',
          operation: 'register_service',
          gracePeriodUntil: leaseExpiryAt.toISOString(),
          phase: 'grace_period_set',
        });
      }
    } catch (error) {
      this.logger.error('❌ Failed to register service', {
        module: 'database_repository',
        operation: 'register_service',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'registration_failure',
      });
      throw error;
    }
  }

  private mapToServiceInfo(service: ServiceRegistry, dependencies: NewServiceDependency[]): ServiceInfo {
    return {
      id: service.id,
      name: service.name,
      version: service.version || '1.0.0',
      host: service.host,
      port: service.port,
      status: service.status as DatabaseHealthStatus,
      dependencies:
        dependencies.map((dep: NewServiceDependency) => ({
          name: dep.dependencyName,
          type: dep.dependencyType,
          timeout: dep.timeout || undefined,
          healthCheck: dep.healthCheck || undefined,
        })) || [],
      metadata: typeof service.metadata === 'string' ? JSON.parse(service.metadata) : service.metadata || {},
    };
  }

  async updateHeartbeat(serviceId: string): Promise<void> {
    try {
      const now = new Date();

      // Get lease settings from environment configuration
      const { getEnvironmentSettings } = await import('../../config/environment-settings');
      const envSettings = getEnvironmentSettings();
      const leaseSettings = envSettings.leaseSettings;

      // Calculate new lease expiry with buffer
      const leaseTTL = leaseSettings.defaultLeaseTTL;
      const renewalBuffer = leaseSettings.leaseRenewalBuffer;
      const newLeaseExpiryAt = new Date(now.getTime() + leaseTTL + renewalBuffer);

      await this.db
        .update(serviceRegistry)
        .set({
          lastHeartbeat: now,
          leaseExpiryAt: newLeaseExpiryAt,
          status: HEALTH_STATUS.HEALTHY,
          updatedAt: now,
        })
        .where(eq(serviceRegistry.id, serviceId));

      this.logger.debug('💓 Heartbeat received - lease extended', {
        module: 'database_repository',
        operation: 'update_heartbeat',
        serviceId,
        leaseExtendedUntil: newLeaseExpiryAt.toISOString(),
        phase: 'lease_extension',
      });
    } catch (error) {
      this.logger.error('❌ Failed to update heartbeat', {
        module: 'database_repository',
        operation: 'update_heartbeat',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'heartbeat_update_failure',
      });
      throw error;
    }
  }

  // ENHANCED: Batch heartbeat update with lease extension for multiple services
  async updateBatchHeartbeats(serviceIds: string[], batchTimestamp: Date): Promise<void> {
    try {
      this.logger.info('📦 Updating batch heartbeats', {
        module: 'database_repository',
        operation: 'update_batch_heartbeats',
        serviceCount: serviceIds.length,
        phase: 'batch_heartbeat_start',
      });

      // Get lease settings from environment configuration
      const { getEnvironmentSettings } = await import('../../config/environment-settings');
      const envSettings = getEnvironmentSettings();
      const leaseSettings = envSettings.leaseSettings;

      // Calculate new lease expiry for all services in batch
      const leaseTTL = leaseSettings.defaultLeaseTTL;
      const renewalBuffer = leaseSettings.leaseRenewalBuffer;
      const newLeaseExpiryAt = new Date(batchTimestamp.getTime() + leaseTTL + renewalBuffer);

      // Use inArray for proper PostgreSQL array handling
      await this.db
        .update(serviceRegistry)
        .set({
          lastHeartbeat: batchTimestamp,
          leaseExpiryAt: newLeaseExpiryAt,
          status: HEALTH_STATUS.HEALTHY, // Also mark services as healthy during batch heartbeat
          updatedAt: batchTimestamp,
        })
        .where(inArray(serviceRegistry.id, serviceIds));

      this.logger.info('✅ Batch heartbeat updated successfully', {
        module: 'database_repository',
        operation: 'update_batch_heartbeats',
        phase: 'batch_update_success',
      });
      this.logger.debug('🔒 Extended service leases', {
        module: 'database_repository',
        operation: 'update_batch_heartbeats',
        serviceCount: serviceIds.length,
        leaseExtendedUntil: newLeaseExpiryAt.toISOString(),
        phase: 'lease_extension',
      });
    } catch (error) {
      this.logger.error('❌ Failed to update batch heartbeats', {
        module: 'database_repository',
        operation: 'update_batch_heartbeats',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'batch_update_failure',
      });
      throw error;
    }
  }

  private async performHealthChecks(): Promise<void> {
    // Implementation for health checks - simplified for now
    this.logger.debug('Running health checks', {
      module: 'database_repository',
      operation: 'perform_health_checks',
      phase: 'health_check_start',
    });
  }

  // ENHANCED: Lease-based cleanup with grace period to prevent registration interference
  async cleanupStaleServices(maxAge: number = 300000): Promise<number> {
    try {
      const now = new Date();
      this.logger.debug('🧹 Starting lease-based cleanup', {
        module: 'database_repository',
        operation: 'cleanup_stale_services',
        startTime: now.toISOString(),
        phase: 'cleanup_start',
      });

      // Get lease settings from environment configuration
      const { getEnvironmentSettings } = await import('../../config/environment-settings');
      const envSettings = getEnvironmentSettings();
      const leaseSettings = envSettings.leaseSettings;

      // Calculate cutoff time with grace period
      // Services are only eligible for cleanup if their lease has expired + grace period has passed
      const gracePeriodMs = leaseSettings.cleanupGracePeriod;
      const cutoffTime = new Date(Date.now() - gracePeriodMs);

      this.logger.debug('🧹 Cleanup cutoff time configured', {
        module: 'database_repository',
        operation: 'cleanup_stale_services',
        cutoffTime: cutoffTime.toISOString(),
        gracePeriodMs,
        phase: 'cutoff_configuration',
      });

      // Query services that are truly expired (lease expiry + grace period)
      const expiredServices = await this.db
        .select({
          id: serviceRegistry.id,
          name: serviceRegistry.name,
          leaseExpiryAt: serviceRegistry.leaseExpiryAt,
          lastHeartbeat: serviceRegistry.lastHeartbeat,
          registeredAt: serviceRegistry.registeredAt,
        })
        .from(serviceRegistry)
        .where(
          and(
            eq(serviceRegistry.isActive, true),
            lt(serviceRegistry.leaseExpiryAt, cutoffTime) // Only services with expired leases
          )
        );

      this.logger.debug('🧹 Found services eligible for cleanup', {
        module: 'database_repository',
        operation: 'cleanup_stale_services',
        expiredServiceCount: expiredServices.length,
        phase: 'services_identified',
      });

      if (expiredServices.length === 0) {
        this.logger.debug('✅ No services need cleanup - all leases current', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          phase: 'no_cleanup_needed',
        });
        return 0;
      }

      // Log each service being cleaned up for debugging
      for (const service of expiredServices) {
        const timeSinceHeartbeat = now.getTime() - service.lastHeartbeat.getTime();
        const timeSinceRegistration = now.getTime() - service.registeredAt.getTime();
        const timeSinceLeaseExpiry = now.getTime() - service.leaseExpiryAt.getTime();

        this.logger.info('🗑️ Cleaning up expired service', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          serviceName: service.name,
          phase: 'service_cleanup',
        });
        this.logger.debug('Service cleanup details', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          serviceId: service.id,
          phase: 'cleanup_details',
        });
        this.logger.debug('Last heartbeat timing', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          timeSinceHeartbeat,
          phase: 'heartbeat_timing',
        });
        this.logger.debug('Registration timing', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          timeSinceRegistration,
          phase: 'registration_timing',
        });
        this.logger.debug('Lease expiry timing', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          timeSinceLeaseExpiry,
          phase: 'lease_expiry_timing',
        });
        this.logger.debug('Grace period details', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          gracePeriodMs,
          phase: 'grace_period_info',
        });
      }

      // Perform the cleanup - mark as inactive rather than delete for audit trail
      const expiredServiceIds = expiredServices.map(s => s.id);

      const updatedServices = await this.db
        .update(serviceRegistry)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(inArray(serviceRegistry.id, expiredServiceIds))
        .returning({ id: serviceRegistry.id, name: serviceRegistry.name });

      // Also deactivate dependencies for cleaned services
      if (updatedServices.length > 0) {
        await this.db.delete(serviceDependencies).where(inArray(serviceDependencies.serviceId, expiredServiceIds));

        this.logger.info('🧹 Deactivated expired services and dependencies', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          deactivatedCount: updatedServices.length,
          phase: 'services_deactivated',
        });
        this.logger.info('🧹 Cleaned services list', {
          module: 'database_repository',
          operation: 'cleanup_stale_services',
          cleanedServices: updatedServices.map(s => s.name),
          phase: 'cleanup_summary',
        });
      }

      return updatedServices.length;
    } catch (error) {
      this.logger.error('❌ Failed to cleanup stale services', {
        module: 'database_repository',
        operation: 'cleanup_stale_services',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'cleanup_failure',
      });
      return 0;
    }
  }
}
