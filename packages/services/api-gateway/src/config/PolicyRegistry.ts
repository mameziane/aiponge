/**
 * PolicyRegistry - Centralized policy configuration for API Gateway
 *
 * Provides presets for rate limiting, authentication, and logging policies
 * that can be composed into proxy handlers via the policy layer.
 */

import { GatewayConfig } from './GatewayConfig';

export type RateLimitPreset = 'default' | 'strict' | 'lenient' | 'none';
export type RateLimitKeyType = 'per-user' | 'per-ip' | 'global';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface RateLimitPolicy {
  preset?: RateLimitPreset;
  windowMs?: number;
  maxRequests?: number;
  keyType?: RateLimitKeyType;
  segment?: string;
}

export interface AuthPolicy {
  required?: boolean;
  injectUserId?: boolean;
  scopes?: string[];
  allowGuest?: boolean;
}

export interface LoggingPolicy {
  level?: LogLevel;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  tags?: string[];
  correlationHeader?: string;
}

export interface CachePolicy {
  enabled?: boolean;
  ttlMs?: number;
  staleWhileRevalidateMs?: number;
  varyByHeaders?: string[];
}

export interface ProxyPolicies {
  rateLimit?: RateLimitPolicy | false;
  auth?: AuthPolicy | false;
  logging?: LoggingPolicy | false;
  cache?: CachePolicy | false;
}

function getRateLimitPresets(): Record<RateLimitPreset, { windowMs: number; maxRequests: number }> {
  return {
    default: GatewayConfig.rateLimit.defaults,
    strict: GatewayConfig.rateLimit.strict,
    lenient: GatewayConfig.rateLimit.lenient,
    none: { windowMs: 0, maxRequests: 0 },
  };
}

export class PolicyRegistry {
  static getRateLimitConfig(policy: RateLimitPolicy): {
    windowMs: number;
    maxRequests: number;
    keyType: RateLimitKeyType;
    segment?: string;
  } {
    const preset = policy.preset || 'default';
    const presets = getRateLimitPresets();
    const base = presets[preset];

    return {
      windowMs: policy.windowMs ?? base.windowMs,
      maxRequests: policy.maxRequests ?? base.maxRequests,
      keyType: policy.keyType ?? 'per-user',
      segment: policy.segment,
    };
  }

  static getDefaultPolicies(): ProxyPolicies {
    return {
      rateLimit: { preset: 'default', keyType: 'per-user' },
      auth: { required: true, injectUserId: true },
      logging: { level: 'info', correlationHeader: 'x-request-id' },
    };
  }

  static getPublicPolicies(): ProxyPolicies {
    return {
      rateLimit: { preset: 'lenient', keyType: 'per-ip' },
      auth: { required: false, allowGuest: true },
      logging: { level: 'info' },
    };
  }

  static getSensitivePolicies(): ProxyPolicies {
    return {
      rateLimit: { preset: 'strict', keyType: 'per-user' },
      auth: { required: true, injectUserId: true },
      logging: { level: 'info', includeRequestBody: false },
    };
  }
}

export type ServiceId =
  | 'user-service'
  | 'ai-content-service'
  | 'ai-config-service'
  | 'music-service'
  | 'system-service'
  | 'storage-service'
  | 'ai-analytics-service';

export interface ServiceManifestEntry {
  id: ServiceId;
  description: string;
  timeout: number;
  retries: number;
  defaultPolicies: ProxyPolicies;
}

const SERVICE_MANIFEST: Record<ServiceId, ServiceManifestEntry> = {
  'user-service': {
    id: 'user-service',
    description: 'User profile and preferences service',
    timeout: 15000,
    retries: 2,
    defaultPolicies: PolicyRegistry.getDefaultPolicies(),
  },
  'ai-content-service': {
    id: 'ai-content-service',
    description: 'AI-powered content generation',
    timeout: 30000,
    retries: 1,
    defaultPolicies: {
      ...PolicyRegistry.getDefaultPolicies(),
      rateLimit: { preset: 'strict', keyType: 'per-user' },
    },
  },
  'ai-config-service': {
    id: 'ai-config-service',
    description: 'AI provider configuration',
    timeout: 8000,
    retries: 2,
    defaultPolicies: PolicyRegistry.getDefaultPolicies(),
  },
  'music-service': {
    id: 'music-service',
    description: 'Music generation and streaming',
    timeout: 25000,
    retries: 1,
    defaultPolicies: PolicyRegistry.getDefaultPolicies(),
  },
  'system-service': {
    id: 'system-service',
    description: 'System health and monitoring',
    timeout: 10000,
    retries: 2,
    defaultPolicies: PolicyRegistry.getPublicPolicies(),
  },
  'storage-service': {
    id: 'storage-service',
    description: 'File and object storage',
    timeout: 15000,
    retries: 2,
    defaultPolicies: PolicyRegistry.getDefaultPolicies(),
  },
  'ai-analytics-service': {
    id: 'ai-analytics-service',
    description: 'AI analytics and insights',
    timeout: 12000,
    retries: 2,
    defaultPolicies: PolicyRegistry.getDefaultPolicies(),
  },
};

export class ServiceManifest {
  static get(serviceId: ServiceId): ServiceManifestEntry {
    return SERVICE_MANIFEST[serviceId];
  }

  static getAll(): ServiceManifestEntry[] {
    return Object.values(SERVICE_MANIFEST);
  }

  static getAllIds(): ServiceId[] {
    return Object.keys(SERVICE_MANIFEST) as ServiceId[];
  }

  static exists(serviceId: string): serviceId is ServiceId {
    return serviceId in SERVICE_MANIFEST;
  }

  static getTimeout(serviceId: ServiceId): number {
    return SERVICE_MANIFEST[serviceId].timeout;
  }

  static getDefaultPolicies(serviceId: ServiceId): ProxyPolicies {
    return SERVICE_MANIFEST[serviceId].defaultPolicies;
  }
}
