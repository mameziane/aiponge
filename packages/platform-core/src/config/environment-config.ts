/**
 * Environment Configuration Utilities
 *
 * Environment variable validation and parsing with production-ready presets.
 *
 * ServiceType and per-service database env var requirements are derived from
 * ServiceLocator's manifest (source of truth: services.config.ts).
 * Domain-specific presets (AI, music, storage, etc.) remain here as they
 * encode business knowledge about which env vars each service category needs.
 */

import { getLogger } from '../logging/logger.js';
import { DomainError } from '../error-handling/errors.js';
import { ServiceLocator } from '../service-locator/service-locator.js';

const logger = getLogger('environment-config');

export interface EnvVarConfig {
  name: string;
  required: boolean;
  description: string;
  sensitive?: boolean;
}

/**
 * ServiceType — accepts any backend service name from services.config.ts,
 * plus 'full' for validating all services at once.
 */
export type ServiceType = string;

/**
 * Domain-specific environment variable presets.
 *
 * These encode business knowledge: which categories of env vars each
 * service needs beyond its database connection. The database env var
 * for each service is derived automatically from the service name.
 */
export const ProductionEnvPresets = {
  core: [
    { name: 'JWT_SECRET', required: true, description: 'JWT signing secret for authentication', sensitive: true },
    {
      name: 'INTERNAL_SERVICE_SECRET',
      required: true,
      description: 'Secret for inter-service communication',
      sensitive: true,
    },
    {
      name: 'ENTRY_ENCRYPTION_KEY',
      required: true,
      description: 'AES-256-GCM key for data encryption',
      sensitive: true,
    },
    { name: 'NODE_ENV', required: true, description: 'Node environment (production)' },
  ] as EnvVarConfig[],

  security: [
    { name: 'BCRYPT_ROUNDS', required: false, description: 'Bcrypt hashing rounds (default: 12)' },
    { name: 'ALLOWED_ORIGINS', required: false, description: 'Comma-separated list of allowed CORS origins' },
    {
      name: 'THOUGHT_ENCRYPTION_KEY',
      required: false,
      description: 'Encryption key for thought/journal entries',
      sensitive: true,
    },
  ] as EnvVarConfig[],

  caching: [
    {
      name: 'REDIS_URL',
      required: false,
      description: 'Redis connection URL for distributed caching',
      sensitive: true,
    },
    { name: 'CACHE_TTL', required: false, description: 'Default cache TTL in seconds' },
  ] as EnvVarConfig[],

  rateLimiting: [
    {
      name: 'RATE_LIMIT_MAX_REQUESTS',
      required: false,
      description: 'Max requests per window for unauthenticated users (default: 100)',
    },
    {
      name: 'RATE_LIMIT_AUTH_MAX',
      required: false,
      description: 'Max requests per window for authenticated users (default: 200)',
    },
    {
      name: 'RATE_LIMIT_FALLBACK_DIVISOR',
      required: false,
      description: 'Divisor for in-memory rate limit fallback (default: 4 in prod, 1 in dev)',
    },
  ] as EnvVarConfig[],

  payments: [
    {
      name: 'REVENUECAT_API_KEY',
      required: false,
      description: 'RevenueCat API key for in-app purchases',
      sensitive: true,
    },
  ] as EnvVarConfig[],

  storage: [
    { name: 'AWS_ACCESS_KEY_ID', required: false, description: 'AWS access key for S3', sensitive: true },
    { name: 'AWS_SECRET_ACCESS_KEY', required: false, description: 'AWS secret key for S3', sensitive: true },
    { name: 'AWS_REGION', required: false, description: 'AWS region for S3' },
    { name: 'S3_BUCKET', required: false, description: 'S3 bucket name for storage' },
    { name: 'CDN_URL', required: false, description: 'CDN base URL for asset delivery' },
  ] as EnvVarConfig[],

  ai: [
    { name: 'OPENAI_API_KEY', required: false, description: 'OpenAI API key (GPT, Whisper, DALL-E)', sensitive: true },
    { name: 'ANTHROPIC_API_KEY', required: false, description: 'Anthropic API key (Claude)', sensitive: true },
    { name: 'GOOGLE_API_KEY', required: false, description: 'Google AI API key (Gemini)', sensitive: true },
    {
      name: 'ELEVENLABS_API_KEY',
      required: false,
      description: 'ElevenLabs API key for voice synthesis',
      sensitive: true,
    },
    {
      name: 'STABILITY_AI_API_KEY',
      required: false,
      description: 'Stability AI API key for image generation',
      sensitive: true,
    },
    {
      name: 'AI_PROVIDER_API_KEY',
      required: false,
      description: 'Primary AI provider API key (legacy fallback)',
      sensitive: true,
    },
  ] as EnvVarConfig[],

  music: [
    { name: 'MUSICAPI_API_KEY', required: false, description: 'MusicAPI.ai key for music generation', sensitive: true },
    {
      name: 'MUSICAPI_BASE_URL',
      required: false,
      description: 'MusicAPI.ai base URL (default: https://api.musicapi.ai)',
    },
    {
      name: 'MUSIC_API_MAX_CONCURRENCY',
      required: false,
      description: 'Max concurrent MusicAPI requests (default: 10)',
    },
  ] as EnvVarConfig[],

  email: [
    {
      name: 'SENDGRID_API_KEY',
      required: false,
      description: 'SendGrid API key for transactional email',
      sensitive: true,
    },
    { name: 'EMAIL_FROM', required: false, description: 'Default from email address' },
  ] as EnvVarConfig[],

  monitoring: [
    { name: 'SENTRY_DSN', required: false, description: 'Sentry DSN for error tracking', sensitive: true },
    {
      name: 'ANALYTICS_SERVICE_API_KEY',
      required: false,
      description: 'API key for analytics service',
      sensitive: true,
    },
  ] as EnvVarConfig[],

  serviceUrls: [
    {
      name: 'SYSTEM_SERVICE_URL',
      required: false,
      description: 'URL for system-service (auto-resolved via service discovery in dev)',
    },
    {
      name: 'STORAGE_SERVICE_URL',
      required: false,
      description: 'URL for storage-service (auto-resolved via service discovery in dev)',
    },
    {
      name: 'AI_ANALYTICS_SERVICE_URL',
      required: false,
      description: 'URL for ai-analytics-service (auto-resolved via service discovery in dev)',
    },
  ] as EnvVarConfig[],

  expo: [
    {
      name: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
      required: false,
      description: 'RevenueCat public key for iOS',
      sensitive: true,
    },
    {
      name: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
      required: false,
      description: 'RevenueCat public key for Android',
      sensitive: true,
    },
    { name: 'EXPO_PUBLIC_SENTRY_DSN', required: false, description: 'Sentry DSN for Expo mobile app', sensitive: true },
    { name: 'EXPO_TOKEN', required: false, description: 'Expo access token for CI/CD builds', sensitive: true },
  ] as EnvVarConfig[],
};

/**
 * Derive the database env var name for a service.
 *
 * Convention: SERVICE_NAME_DATABASE_URL (e.g., MUSIC_DATABASE_URL for music-service).
 * Special case: DATABASE_URL for user-service (Replit-provisioned default).
 */
const DATABASE_ENV_VAR_OVERRIDES: Record<string, string> = {
  'user-service': 'DATABASE_URL',
};

function getDatabaseEnvVarName(serviceName: string): string {
  if (DATABASE_ENV_VAR_OVERRIDES[serviceName]) {
    return DATABASE_ENV_VAR_OVERRIDES[serviceName];
  }
  const prefix = serviceName
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/_SERVICE$/, '');
  return `${prefix}_DATABASE_URL`;
}

/**
 * Get database env var config for a service, derived from ServiceLocator resources.
 * Only returns a config if the service declares a database resource in services.config.ts.
 */
function getDatabaseConfigForService(serviceName: string): EnvVarConfig[] {
  if (!ServiceLocator.serviceRequiresResource(serviceName, 'database')) {
    return [];
  }

  const envVarName = getDatabaseEnvVarName(serviceName);
  return [
    {
      name: envVarName,
      required: true,
      description: `PostgreSQL connection string for ${serviceName}`,
      sensitive: true,
    },
  ];
}

/**
 * Service-to-domain-preset mapping.
 *
 * Maps each service to the additional domain preset categories it needs
 * beyond core + database (which are always included).
 * Services not listed here get only core + database presets.
 */
const SERVICE_DOMAIN_PRESETS: Record<string, (keyof typeof ProductionEnvPresets)[]> = {
  'api-gateway': ['security', 'rateLimiting', 'serviceUrls', 'monitoring'],
  'user-service': ['security', 'email', 'monitoring'],
  'system-service': ['caching', 'monitoring'],
  'ai-config-service': ['ai', 'caching', 'monitoring'],
  'ai-content-service': ['ai', 'caching', 'monitoring'],
  'ai-analytics-service': ['ai', 'caching', 'monitoring'],
  'storage-service': ['storage', 'monitoring'],
  'music-service': ['ai', 'music', 'storage', 'monitoring'],
};

/**
 * Validate that a serviceType is a known backend service or 'full'.
 * Prevents silent under-validation from typos or unknown service names.
 */
function validateServiceType(serviceType: ServiceType): void {
  if (serviceType === 'full') return;

  const knownServices = ServiceLocator.getBackendServiceNames();
  if (!knownServices.includes(serviceType)) {
    throw new DomainError(
      `Unknown serviceType '${serviceType}' for environment validation. ` +
        `Known backend services: ${knownServices.join(', ')}`,
      500
    );
  }
}

/**
 * Build the full env var config list for a given service type.
 * Database requirements are derived from ServiceLocator manifest,
 * domain presets are looked up from SERVICE_DOMAIN_PRESETS.
 */
function getConfigsForServiceType(serviceType: ServiceType): EnvVarConfig[] {
  validateServiceType(serviceType);

  let configs: EnvVarConfig[] = [...ProductionEnvPresets.core];

  if (serviceType === 'full') {
    const backendServices = ServiceLocator.getBackendServiceNames();
    const allDbConfigs = backendServices.flatMap(getDatabaseConfigForService);
    configs = [
      ...configs,
      ...allDbConfigs,
      ...ProductionEnvPresets.security,
      ...ProductionEnvPresets.caching,
      ...ProductionEnvPresets.rateLimiting,
      ...ProductionEnvPresets.payments,
      ...ProductionEnvPresets.storage,
      ...ProductionEnvPresets.ai,
      ...ProductionEnvPresets.music,
      ...ProductionEnvPresets.email,
      ...ProductionEnvPresets.monitoring,
      ...ProductionEnvPresets.serviceUrls,
      ...ProductionEnvPresets.expo,
    ];
    return configs;
  }

  configs = [...configs, ...getDatabaseConfigForService(serviceType)];

  const domainPresets = SERVICE_DOMAIN_PRESETS[serviceType] || ['monitoring'];
  for (const preset of domainPresets) {
    configs = [...configs, ...ProductionEnvPresets[preset]];
  }

  return configs;
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(required: string[]): void {
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new DomainError(`Missing required environment variables: ${missing.join(', ')}`, 500);
  }
}

/**
 * Validate environment using structured configuration
 */
export function validateEnvironmentConfig(configs: EnvVarConfig[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const config of configs) {
    const value = process.env[config.name];

    if (config.required && !value) {
      errors.push(`Missing required: ${config.name} - ${config.description}`);
    } else if (!config.required && !value) {
      warnings.push(`Optional not set: ${config.name} - ${config.description}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate production environment for a specific service type
 */
export function validateProductionEnvironment(
  serviceType: ServiceType,
  options: { throwOnError?: boolean; logWarnings?: boolean } = {}
): boolean {
  const { throwOnError = true, logWarnings = true } = options;

  const configs = getConfigsForServiceType(serviceType);
  const result = validateEnvironmentConfig(configs);

  if (logWarnings && result.warnings.length > 0) {
    logger.warn('Optional variables not configured', { warnings: result.warnings });
  }

  if (!result.valid) {
    const errorMessage = `Production environment validation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`;

    if (throwOnError) {
      throw new DomainError(errorMessage, 500);
    }
  }

  return result.valid;
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Fail fast validation - call at service startup.
 * In production: throws on missing required vars.
 * In development: logs warnings for missing vars (unless STRICT_ENV_VALIDATION=true).
 */
export function failFastValidation(serviceType: ServiceType): void {
  const strictMode = process.env.STRICT_ENV_VALIDATION === 'true';

  if (!isProduction() && !strictMode) {
    const result = validateProductionEnvironment(serviceType, { throwOnError: false, logWarnings: false });
    if (!result) {
      const configs = getConfigsForServiceType(serviceType);
      const { errors, warnings } = validateEnvironmentConfig(configs);
      if (errors.length > 0) {
        logger.debug('Development mode - missing env vars (would fail in production)', {
          serviceType,
          missing: errors.map((e: string) => e.replace(/^Missing required: /, '').replace(/ - .*$/, '')),
        });
      }
      if (warnings.length > 0) {
        logger.debug('Optional env vars not configured', { count: warnings.length });
      }
    }
    validateJwtSecretStrength();
    return;
  }

  logger.info('Validating production environment', { serviceType });
  validateProductionEnvironment(serviceType, { throwOnError: true, logWarnings: true });
  validateJwtSecretStrength();
  logger.info('Production environment validation passed');
}

/**
 * Validate JWT_SECRET strength in production
 */
export function validateJwtSecretStrength(): void {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return;

  const minLength = parseInt(process.env.JWT_SECRET_MIN_LENGTH || '32', 10);

  if (jwtSecret.length < minLength) {
    const message = `JWT_SECRET is too short (${jwtSecret.length} chars, minimum ${minLength}). Use a cryptographically random string.`;
    if (isProduction()) {
      throw new DomainError(message, 500);
    }
    logger.warn(message);
  }

  if (/^(.)\1+$/.test(jwtSecret) || jwtSecret === 'secret' || jwtSecret === 'jwt_secret') {
    const message = 'JWT_SECRET appears to be a weak/default value. Use a cryptographically random string.';
    if (isProduction()) {
      throw new DomainError(message, 500);
    }
    logger.warn(message);
  }
}

/**
 * Get configuration with type safety and defaults
 */
export function getConfig<T>(key: string, defaultValue: T, parser?: (value: string) => T): T {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  if (parser) {
    try {
      return parser(value);
    } catch {
      return defaultValue;
    }
  }

  if (typeof defaultValue === 'boolean') {
    return (value.toLowerCase() === 'true') as unknown as T;
  }

  if (typeof defaultValue === 'number') {
    const parsed = parseInt(value, 10);
    return (isNaN(parsed) ? defaultValue : parsed) as unknown as T;
  }

  return value as unknown as T;
}

/**
 * Get required configuration - throws if not present
 */
export function getRequiredConfig(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new DomainError(`Required environment variable not set: ${key}`, 500);
  }
  return value;
}
