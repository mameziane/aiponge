/**
 * Centralized Configuration Client
 *
 * Consolidated from @aiponge/config-client package into platform-core.
 * Provides feature flags, configuration fetching, and runtime updates
 * for aiponge microservices.
 *
 * Features:
 * - Feature flags with percentage rollouts and user targeting
 * - Hierarchical configuration with environment overrides
 * - Local caching with TTL
 * - A/B testing support via experiments
 */

import { getLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { DomainError, errorMessage } from '../error-handling/errors.js';
import { createIntervalScheduler, type IntervalScheduler } from '../scheduling/IntervalScheduler.js';

const logger = getLogger('config-client');

export interface FeatureFlagDefinition {
  key: string;
  enabled: boolean;
  percentage?: number;
  userIds?: string[];
  environments?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExperimentDefinition {
  key: string;
  enabled: boolean;
  variants: ExperimentVariant[];
  targetingRules?: TargetingRule[];
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number;
  config?: Record<string, unknown>;
}

export interface TargetingRule {
  type: 'user' | 'percentage' | 'environment' | 'attribute';
  value: string | number | string[];
}

export interface ConfigDocument {
  key: string;
  value: unknown;
  environment?: string;
  version?: number;
  updatedAt?: number;
}

export interface ConfigClientOptions {
  serviceName: string;
  environment?: string;
  refreshIntervalMs?: number;
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
  fallbackConfig?: Record<string, unknown>;
  fallbackFlags?: Record<string, boolean>;
  configServiceUrl?: string;
  fetchTimeoutMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type ConfigChangeListener = (key: string, newValue: unknown, oldValue: unknown) => void;
type FlagChangeListener = (key: string, enabled: boolean) => void;

export interface FlagEvaluationContext {
  userId?: string;
  sessionId?: string;
  attributes?: Record<string, unknown>;
}

export interface ExperimentContext {
  userId?: string;
  sessionId?: string;
  attributes?: Record<string, unknown>;
}

export interface ConfigClientStats {
  configCacheSize: number;
  flagCacheSize: number;
  experimentCacheSize: number;
  localOverrides: number;
  flagOverrides: number;
  environment: string;
  serviceName: string;
  initialized: boolean;
}

class ConfigClientImpl {
  private options: Required<ConfigClientOptions>;
  private configCache: Map<string, CacheEntry<unknown>> = new Map();
  private flagCache: Map<string, CacheEntry<FeatureFlagDefinition>> = new Map();
  private experimentCache: Map<string, CacheEntry<ExperimentDefinition>> = new Map();
  private configChangeListeners: ConfigChangeListener[] = [];
  private flagChangeListeners: FlagChangeListener[] = [];
  private initialized: boolean = false;
  private localOverrides: Map<string, unknown> = new Map();
  private localFlagOverrides: Map<string, boolean> = new Map();
  private refreshScheduler: IntervalScheduler | null = null;

  constructor(options: ConfigClientOptions) {
    this.options = {
      serviceName: options.serviceName,
      environment: options.environment || process.env.NODE_ENV || 'development',
      refreshIntervalMs: options.refreshIntervalMs || 60000,
      cacheEnabled: options.cacheEnabled !== false,
      cacheTtlMs: options.cacheTtlMs || 300000,
      fallbackConfig: options.fallbackConfig || {},
      fallbackFlags: options.fallbackFlags || {},
      configServiceUrl: options.configServiceUrl || process.env.CONFIG_SERVICE_URL || '',
      fetchTimeoutMs: options.fetchTimeoutMs || 5000,
    };
  }

  async initialize(): Promise<void> {
    this.loadEnvironmentOverrides();

    if (this.options.configServiceUrl) {
      await this.fetchRemoteConfig();
      this.startRefreshInterval();
    }

    this.initialized = true;
  }

  private async fetchRemoteConfig(): Promise<void> {
    if (!this.options.configServiceUrl) return;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.fetchTimeoutMs);

      const response = await fetch(
        `${this.options.configServiceUrl}/api/config/batch?service=${this.options.serviceName}&env=${this.options.environment}`,
        { signal: controller.signal }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new DomainError(`Config fetch failed: ${response.status}`, response.status);
      }

      const data = (await response.json()) as {
        configs?: Array<{ key: string; value: unknown }>;
        flags?: FeatureFlagDefinition[];
        experiments?: ExperimentDefinition[];
      };

      if (data.configs) {
        for (const config of data.configs) {
          this.set(config.key, config.value);
        }
      }

      if (data.flags) {
        for (const flag of data.flags) {
          this.setFlag(flag.key, flag);
        }
      }

      if (data.experiments) {
        for (const experiment of data.experiments) {
          this.setExperiment(experiment.key, experiment);
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        logger.warn('Remote config fetch failed, using fallbacks', { error: errorMessage(error) });
      }
    }
  }

  private startRefreshInterval(): void {
    if (this.refreshScheduler) {
      this.refreshScheduler.stop();
    }

    this.refreshScheduler = createIntervalScheduler({
      name: 'config-refresh',
      serviceName: this.options.serviceName,
      intervalMs: this.options.refreshIntervalMs,
      handler: () => {
        this.fetchRemoteConfig().catch(error => {
          logger.warn('Periodic config refresh failed', { error: serializeError(error) });
        });
      },
      register: false,
    });
    this.refreshScheduler.start();
  }

  stopRefresh(): void {
    if (this.refreshScheduler) {
      this.refreshScheduler.stop();
      this.refreshScheduler = null;
    }
  }

  private loadEnvironmentOverrides(): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('CONFIG_')) {
        const configKey = key.replace('CONFIG_', '').toLowerCase().replace(/_/g, '.');
        try {
          this.localOverrides.set(configKey, JSON.parse(value!));
        } catch {
          this.localOverrides.set(configKey, value);
        }
      }
      if (key.startsWith('FLAG_')) {
        const flagKey = key.replace('FLAG_', '').toLowerCase();
        this.localFlagOverrides.set(flagKey, value === 'true' || value === '1');
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.localOverrides.has(key)) {
      return this.localOverrides.get(key) as T;
    }

    if (this.options.cacheEnabled) {
      const cached = this.configCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T;
      }
    }

    if (key in this.options.fallbackConfig) {
      return this.options.fallbackConfig[key] as T;
    }

    return defaultValue as T;
  }

  set(key: string, value: unknown): void {
    const oldValue = this.get(key);

    if (this.options.cacheEnabled) {
      this.configCache.set(key, {
        value,
        expiresAt: Date.now() + this.options.cacheTtlMs,
      });
    }

    for (const listener of this.configChangeListeners) {
      listener(key, value, oldValue);
    }
  }

  setOverride(key: string, value: unknown): void {
    this.localOverrides.set(key, value);
  }

  clearOverride(key: string): void {
    this.localOverrides.delete(key);
  }

  isEnabled(flagKey: string, context?: FlagEvaluationContext): boolean {
    if (this.localFlagOverrides.has(flagKey)) {
      return this.localFlagOverrides.get(flagKey)!;
    }

    const cached = this.flagCache.get(flagKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.evaluateFlag(cached.value, context);
    }

    if (flagKey in this.options.fallbackFlags) {
      return this.options.fallbackFlags[flagKey];
    }

    return false;
  }

  private evaluateFlag(flag: FeatureFlagDefinition, context?: FlagEvaluationContext): boolean {
    if (!flag.enabled) {
      return false;
    }

    if (flag.environments && flag.environments.length > 0) {
      if (!flag.environments.includes(this.options.environment)) {
        return false;
      }
    }

    if (context?.userId && flag.userIds && flag.userIds.length > 0) {
      if (flag.userIds.includes(context.userId)) {
        return true;
      }
    }

    if (flag.percentage !== undefined && flag.percentage < 100) {
      const hash = this.hashString(context?.userId || context?.sessionId || Math.random().toString());
      const bucket = hash % 100;
      return bucket < flag.percentage;
    }

    return true;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  setFlag(key: string, definition: FeatureFlagDefinition): void {
    const wasEnabled = this.isEnabled(key);

    this.flagCache.set(key, {
      value: definition,
      expiresAt: Date.now() + this.options.cacheTtlMs,
    });

    const isNowEnabled = this.isEnabled(key);
    if (wasEnabled !== isNowEnabled) {
      for (const listener of this.flagChangeListeners) {
        listener(key, isNowEnabled);
      }
    }
  }

  setFlagOverride(key: string, enabled: boolean): void {
    this.localFlagOverrides.set(key, enabled);
  }

  clearFlagOverride(key: string): void {
    this.localFlagOverrides.delete(key);
  }

  getVariant(experimentKey: string, context?: ExperimentContext): ExperimentVariant | null {
    const cached = this.experimentCache.get(experimentKey);
    if (!cached || cached.expiresAt <= Date.now()) {
      return null;
    }

    const experiment = cached.value;
    if (!experiment.enabled) {
      return null;
    }

    const hash = this.hashString(context?.userId || context?.sessionId || experimentKey);
    const bucket = hash % 100;

    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (bucket < cumulativeWeight) {
        return variant;
      }
    }

    return experiment.variants[0] || null;
  }

  setExperiment(key: string, definition: ExperimentDefinition): void {
    this.experimentCache.set(key, {
      value: definition,
      expiresAt: Date.now() + this.options.cacheTtlMs,
    });
  }

  onConfigChange(listener: ConfigChangeListener): () => void {
    this.configChangeListeners.push(listener);
    return () => {
      const index = this.configChangeListeners.indexOf(listener);
      if (index > -1) {
        this.configChangeListeners.splice(index, 1);
      }
    };
  }

  onFlagChange(listener: FlagChangeListener): () => void {
    this.flagChangeListeners.push(listener);
    return () => {
      const index = this.flagChangeListeners.indexOf(listener);
      if (index > -1) {
        this.flagChangeListeners.splice(index, 1);
      }
    };
  }

  getStats(): ConfigClientStats {
    return {
      configCacheSize: this.configCache.size,
      flagCacheSize: this.flagCache.size,
      experimentCacheSize: this.experimentCache.size,
      localOverrides: this.localOverrides.size,
      flagOverrides: this.localFlagOverrides.size,
      environment: this.options.environment,
      serviceName: this.options.serviceName,
      initialized: this.initialized,
    };
  }

  clear(): void {
    this.configCache.clear();
    this.flagCache.clear();
    this.experimentCache.clear();
  }
}

let defaultClient: ConfigClientImpl | null = null;

export function createConfigClient(options: ConfigClientOptions): ConfigClientImpl {
  return new ConfigClientImpl(options);
}

export function initializeConfig(options: ConfigClientOptions): Promise<void> {
  defaultClient = new ConfigClientImpl(options);
  return defaultClient.initialize();
}

export function getConfig<T>(key: string, defaultValue?: T): T {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  return defaultClient.get(key, defaultValue);
}

export function setConfig(key: string, value: unknown): void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  defaultClient.set(key, value);
}

export function isFeatureEnabled(flagKey: string, context?: FlagEvaluationContext): boolean {
  if (!defaultClient) {
    const envKey = `FLAG_${flagKey.toUpperCase().replace(/\./g, '_')}`;
    return process.env[envKey] === 'true' || process.env[envKey] === '1';
  }
  return defaultClient.isEnabled(flagKey, context);
}

export function getExperimentVariant(experimentKey: string, context?: ExperimentContext): ExperimentVariant | null {
  if (!defaultClient) {
    return null;
  }
  return defaultClient.getVariant(experimentKey, context);
}

export function setFeatureFlag(key: string, definition: FeatureFlagDefinition): void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  defaultClient.setFlag(key, definition);
}

export function setExperiment(key: string, definition: ExperimentDefinition): void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  defaultClient.setExperiment(key, definition);
}

export function setConfigOverride(key: string, value: unknown): void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  defaultClient.setOverride(key, value);
}

export function setFlagOverride(key: string, enabled: boolean): void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  defaultClient.setFlagOverride(key, enabled);
}

export function onConfigChange(listener: ConfigChangeListener): () => void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  return defaultClient.onConfigChange(listener);
}

export function onFlagChange(listener: FlagChangeListener): () => void {
  if (!defaultClient) {
    throw new DomainError('Config client not initialized. Call initializeConfig() first.', 500);
  }
  return defaultClient.onFlagChange(listener);
}

export function getConfigStats(): ConfigClientStats | null {
  return defaultClient?.getStats() || null;
}

export function clearConfigCache(): void {
  defaultClient?.clear();
}

export function stopConfigRefresh(): void {
  defaultClient?.stopRefresh();
}

export function shutdownConfig(): void {
  defaultClient?.stopRefresh();
  defaultClient?.clear();
}

export const config = {
  initialize: initializeConfig,
  get: getConfig,
  set: setConfig,
  setOverride: setConfigOverride,
  onConfigChange,
  getStats: getConfigStats,
  clear: clearConfigCache,
  stopRefresh: stopConfigRefresh,
  shutdown: shutdownConfig,
};

export const flags = {
  isEnabled: isFeatureEnabled,
  setFlag: setFeatureFlag,
  setOverride: setFlagOverride,
  onFlagChange,
};

export const experiments = {
  getVariant: getExperimentVariant,
  setExperiment,
};

export type ConfigClient = ConfigClientImpl;
