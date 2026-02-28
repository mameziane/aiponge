/**
 * Dynamic CORS Configuration
 * Eliminates ALL hardcoded frontend URLs and origins
 * Supports environment-based and pattern-based origin management
 */

// Explicitly declare globals for TypeScript
declare const process: {
  env: Record<string, string | undefined>;
};

// Use globalThis.URL to avoid no-undef errors
const URLConstructor = globalThis.URL;

import type { CorsOptions } from 'cors';
import { getServicePort } from '@aiponge/platform-core';
import logger from '../utils/logger';

export interface CorsConfig {
  enabled: boolean;
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
  optionsSuccessStatus: number;
}

export class DynamicCorsConfig {
  private static instance: DynamicCorsConfig;
  private config: CorsConfig;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  static getInstance(): DynamicCorsConfig {
    if (!DynamicCorsConfig.instance) {
      DynamicCorsConfig.instance = new DynamicCorsConfig();
    }
    return DynamicCorsConfig.instance;
  }

  private loadConfiguration(): CorsConfig {
    // Load origins from environment with intelligent defaults
    const origins = this.loadOriginsFromEnvironment();

    return {
      enabled: process.env.CORS_ENABLED !== 'false',
      origins,
      credentials: process.env.CORS_ALLOW_CREDENTIALS !== 'false',
      methods: this.parseStringArray(process.env.CORS_METHODS) || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: this.parseStringArray(process.env.CORS_ALLOWED_HEADERS) || [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      exposedHeaders: this.parseStringArray(process.env.CORS_EXPOSED_HEADERS) || [],
      maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10), // 24 hours
      optionsSuccessStatus: parseInt(process.env.CORS_OPTIONS_SUCCESS_STATUS || '204', 10),
    };
  }

  private loadOriginsFromEnvironment(): string[] {
    // Try CORS_ORIGINS first (comma-separated) - standardized variable name
    if (process.env.CORS_ORIGINS) {
      return this.parseStringArray(process.env.CORS_ORIGINS) || [];
    }

    // Fallback to building from individual frontend app configs
    return this.buildOriginsFromApps();
  }

  private buildOriginsFromApps(): string[] {
    const origins: string[] = [];

    // Frontend application ports from unified configuration - all configurable
    // Uses centralized port configuration with environment variable override support
    const frontendApps = [{ name: 'aiponge', envVar: 'aiponge_APP_PORT', defaultPort: getServicePort('aiponge') }];

    const host = process.env.CORS_FRONTEND_HOST || 'localhost';
    const protocol = process.env.CORS_FRONTEND_PROTOCOL || 'http';

    for (const app of frontendApps) {
      const port = parseInt(process.env[app.envVar] || String(app.defaultPort), 10);
      origins.push(`${protocol}://${host}:${port}`);
    }

    // Add custom origins if specified
    if (process.env.CORS_CUSTOM_ORIGINS) {
      const customOrigins = this.parseStringArray(process.env.CORS_CUSTOM_ORIGINS) || [];
      origins.push(...customOrigins);
    }

    // Add wildcard patterns for development
    if (process.env.NODE_ENV === 'development' && process.env.CORS_DEV_WILDCARDS !== 'false') {
      origins.push('http://localhost:*');
      origins.push('https://localhost:*');
    }

    return origins;
  }

  private parseStringArray(value?: string): string[] | null {
    if (!value) return null;

    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  // Public API
  getConfig(): CorsConfig {
    return { ...this.config };
  }

  getOrigins(): string[] {
    return [...this.config.origins];
  }

  isOriginAllowed(origin: string): boolean {
    if (!this.config.enabled) {
      return true; // CORS disabled, allow all
    }

    // Exact match first
    if (this.config.origins.includes(origin)) {
      return true;
    }

    // Pattern matching for wildcards
    for (const allowedOrigin of this.config.origins) {
      if (this.matchesOriginPattern(origin, allowedOrigin)) {
        return true;
      }
    }

    return false;
  }

  private matchesOriginPattern(origin: string, pattern: string): boolean {
    // Convert wildcard patterns to regex
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
        .replace(/\*/g, '.*'); // Convert * to .*

      try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(origin);
      } catch (error) {
        logger.warn('Invalid CORS pattern', { pattern, error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }

    return false;
  }

  // Runtime updates
  addOrigin(origin: string): void {
    if (!this.config.origins.includes(origin)) {
      this.config.origins.push(origin);
      logger.info('CORS origin added', { origin });
    }
  }

  removeOrigin(origin: string): void {
    const index = this.config.origins.indexOf(origin);
    if (index > -1) {
      this.config.origins.splice(index, 1);
      logger.info('CORS origin removed', { origin });
    }
  }

  updateConfig(updates: Partial<CorsConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('CORS configuration updated');
  }

  // Hot reload from environment
  reloadConfiguration(): void {
    logger.info('Reloading CORS configuration');
    this.config = this.loadConfiguration();
    logger.info('CORS configuration reloaded', { originCount: this.config.origins.length });
  }

  // Express.js CORS options generator
  toCorsOptions(): CorsOptions {
    return {
      origin: (origin: string | undefined, callback: (_error: Error | null, _allow?: boolean) => void): void => {
        // Allow requests with no origin (mobile apps, postman, etc.)
        if (!origin) {
          callback(null, true);
          return;
        }

        if (this.isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS policy`));
        }
      },
      credentials: this.config.credentials,
      methods: this.config.methods,
      allowedHeaders: this.config.allowedHeaders,
      exposedHeaders: this.config.exposedHeaders,
      maxAge: this.config.maxAge,
      optionsSuccessStatus: this.config.optionsSuccessStatus,
    };
  }

  // Configuration validation
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.origins.length === 0) {
      errors.push('No CORS origins configured');
    }

    // Validate origin formats
    for (const origin of this.config.origins) {
      if (!this.isValidOriginFormat(origin)) {
        errors.push(`Invalid origin format: ${origin}`);
      }
    }

    if (this.config.maxAge < 0) {
      errors.push('maxAge must be non-negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private isValidOriginFormat(origin: string): boolean {
    // Allow wildcard patterns
    if (origin.includes('*')) {
      return true;
    }

    // Basic URL validation
    try {
      new URLConstructor(origin);
      return true;
    } catch (error) {
      logger.warn('Invalid origin URL format', {
        origin,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Configuration summary for monitoring
  getConfigSummary(): {
    enabled: boolean;
    originCount: number;
    origins: string[];
    wildcardPatterns: string[];
  } {
    const wildcardPatterns = this.config.origins.filter(origin => origin.includes('*'));

    return {
      enabled: this.config.enabled,
      originCount: this.config.origins.length,
      origins: [...this.config.origins],
      wildcardPatterns,
    };
  }
}

// Export singleton instance
export const corsConfig = DynamicCorsConfig.getInstance();
