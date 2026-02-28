/**
 * Provider Configuration Repository Interface
 * Defines the contract for provider configuration persistence operations
 */

import {
  ProviderConfigFilter,
  ProviderType,
  ProviderConfiguration,
  InsertProviderConfiguration,
} from '../entities/ProviderConfiguration';

export interface IProviderConfigRepository {
  // Basic CRUD operations
  create(config: InsertProviderConfiguration): Promise<ProviderConfiguration>;
  findById(id: number): Promise<ProviderConfiguration | null>;
  findAll(filter?: ProviderConfigFilter): Promise<ProviderConfiguration[]>;
  update(id: number, updates: Partial<InsertProviderConfiguration>): Promise<ProviderConfiguration>;
  delete(id: number): Promise<boolean>;

  // Specialized queries
  findByProviderAndType(providerId: string, providerType: ProviderType): Promise<ProviderConfiguration | null>;
  findPrimaryProvider(providerType: ProviderType): Promise<ProviderConfiguration | null>;
  findActiveProviders(providerType?: ProviderType): Promise<ProviderConfiguration[]>;

  // Provider management operations
  setProviderActive(id: number, isActive: boolean): Promise<ProviderConfiguration>;
  unsetPrimaryProvider(providerType: ProviderType): Promise<void>;
  setPrimaryProvider(id: number): Promise<ProviderConfiguration>;

  // Health and monitoring
  updateHealthStatus(id: number, status: 'healthy' | 'error' | 'unknown'): Promise<ProviderConfiguration>;
  getProvidersWithHealthStatus(status: 'healthy' | 'error' | 'unknown'): Promise<ProviderConfiguration[]>;

  // Bulk operations
  bulkUpdateProviders(
    updates: Array<{ id: number; updates: Partial<InsertProviderConfiguration> }>
  ): Promise<ProviderConfiguration[]>;
  bulkSetActive(ids: number[], isActive: boolean): Promise<ProviderConfiguration[]>;
}
