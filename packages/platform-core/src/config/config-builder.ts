/**
 * Configuration Builder Utilities
 *
 * Fluent API for building configuration objects
 */

import { getConfig } from './environment-config';

/**
 * Environment-aware configuration builder
 */
export class ConfigBuilder<T extends Record<string, unknown>> {
  private config: Partial<T> = {};

  add<K extends keyof T>(key: K, defaultValue: T[K], envKey?: string): this {
    const envKeyToUse = envKey || String(key).toUpperCase();
    this.config[key] = getConfig(envKeyToUse, defaultValue);
    return this;
  }

  build(): T {
    return this.config as T;
  }
}

/**
 * Create a configuration builder instance
 */
export function createConfig<T extends Record<string, unknown>>(): ConfigBuilder<T> {
  return new ConfigBuilder<T>();
}
