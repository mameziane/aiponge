/**
 * Provider Configuration Domain Entity
 * Core domain model for AI provider configurations
 */

export interface ProviderConfiguration {
  id: number;
  providerId: string;
  providerName: string;
  providerType: 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text';
  description: string | null;
  configuration:
    | {
        endpoint: string;
        method?: string;
        headers?: Record<string, string>;
        requestTemplate: Record<string, unknown>;
        responseMapping: Record<string, string>;
        timeout?: number;
        [key: string]: unknown;
      }
    | unknown;
  isActive: boolean;
  isPrimary: boolean;
  priority: number;
  costPerUnit: string;
  creditCost: number | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'error' | 'unknown';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface InsertProviderConfiguration {
  providerId: string;
  providerName: string;
  providerType: 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text';
  description?: string | null;
  configuration:
    | {
        endpoint: string;
        method?: string;
        headers?: Record<string, string>;
        requestTemplate: Record<string, unknown>;
        responseMapping: Record<string, string>;
        timeout?: number;
        [key: string]: unknown;
      }
    | unknown;
  isActive?: boolean;
  isPrimary?: boolean;
  priority?: number;
  costPerUnit?: string;
  creditCost?: number | null;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'error' | 'unknown';
  createdBy?: string | null;
  updatedBy?: string | null;
}

export type ProviderType = 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text';

export interface ProviderConfigFilter {
  includeInactive?: boolean;
  providerType?: ProviderType;
  isActive?: boolean;
  isPrimary?: boolean;
  providerId?: string;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'error' | 'unknown';
}
