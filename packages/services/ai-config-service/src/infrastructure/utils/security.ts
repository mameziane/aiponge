/**
 * Security Utilities for AI Providers Service
 * Re-exports from domain-level security utilities and adds infrastructure-specific extensions
 */

import { ProviderConfigurationDB as ProviderConfiguration, InsertProviderConfiguration } from '@schema/schema';

export {
  maskSecret,
  sanitizeProviderConfiguration,
  sanitizeProviderConfigurations,
  sanitizeErrorMessage,
  sanitizeForLogging,
  containsSecrets,
} from '../../domains/providers/utils/security';

interface ProviderAnalytics {
  totalRequests?: number;
  successRate?: number;
  averageLatency?: number;
  lastUsed?: Date | string;
}

interface ProviderHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck?: Date | string;
  message?: string;
}

interface ProviderQuota {
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: Date | string;
}

export interface SanitizedProviderConfigurationWithExtendedInfo {
  id: number;
  providerId: string;
  providerName: string;
  providerType: 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text';
  description?: string | null;
  configuration: Record<string, unknown>;
  isActive: boolean;
  isPrimary: boolean;
  priority: number;
  costPerUnit: string;
  healthStatus: 'healthy' | 'error' | 'unknown';
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string | null;
  updatedBy?: string | null;
  analytics?: ProviderAnalytics;
  liveHealthStatus?: ProviderHealthStatus;
  capabilities?: string[];
  quota?: ProviderQuota;
}

import { sanitizeForLogging as _sanitizeForLogging } from '../../domains/providers/utils/security';

export function sanitizeExtendedProviderConfiguration(
  config: Record<string, unknown>
): SanitizedProviderConfigurationWithExtendedInfo {
  return _sanitizeForLogging(config) as SanitizedProviderConfigurationWithExtendedInfo;
}
