/**
 * Credentials Resolver - Simplified API key management
 * Replaces complex SecretManager with config-driven approach using database auth configuration
 */

import { ProviderAuthConfig } from '@schema/schema';
import { getLogger } from '@config/service-urls';

const logger = getLogger('ai-config-service-credentials-resolver');

export interface AuthCredentials {
  headers: Record<string, string>;
  auth: Record<string, string>; // For query parameter authentication
  isValid: boolean;
  missingCredentials?: string[];
}

export class CredentialsResolver {
  private credentialCache: Map<string, { credentials: AuthCredentials; expires: number }> = new Map();
  private readonly cacheExpiryMs = 30000; // 30 seconds - much shorter than SecretManager

  /**
   * Resolve authentication credentials from provider auth configuration
   * This is the main method that replaces SecretManager.getAuthCredentials()
   */
  resolveCredentials(providerId: string, authConfig?: ProviderAuthConfig): AuthCredentials {
    // Use cache if available and not expired
    const cacheKey = `${providerId}:${JSON.stringify(authConfig)}`;
    const cached = this.credentialCache.get(cacheKey);

    if (cached && Date.now() < cached.expires) {
      return cached.credentials;
    }

    const credentials = this.buildCredentials(providerId, authConfig);

    // Cache the result for a short time
    this.credentialCache.set(cacheKey, {
      credentials,
      expires: Date.now() + this.cacheExpiryMs,
    });

    return credentials;
  }

  /**
   * Build auth credentials from provider configuration (no hardcoded logic)
   */
  private buildCredentials(providerId: string, authConfig?: ProviderAuthConfig): AuthCredentials {
    if (!authConfig) {
      return this.buildFallbackCredentials(providerId);
    }

    return this.buildConfigDrivenCredentials(providerId, authConfig);
  }

  private buildFallbackCredentials(providerId: string): AuthCredentials {
    const headers: Record<string, string> = {};
    const auth: Record<string, string> = {};
    const missingCredentials: string[] = [];

    // Fallback: use default convention PROVIDER_API_KEY -> Authorization: Bearer
    const defaultEnvVar = `${providerId.toUpperCase()}_API_KEY`;
    const apiKey = process.env[defaultEnvVar];

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      missingCredentials.push(defaultEnvVar);
    }

    this.logDebugAuth(providerId, '🔍 [CredentialsResolver] Fallback path - headers:', {
      headerKeys: Object.keys(headers),
    });

    return {
      headers,
      auth,
      isValid: Object.keys(headers).length > 0,
      missingCredentials: missingCredentials.length > 0 ? missingCredentials : undefined,
    };
  }

  private buildConfigDrivenCredentials(providerId: string, authConfig: ProviderAuthConfig): AuthCredentials {
    const headers: Record<string, string> = {};
    const auth: Record<string, string> = {};
    const missingCredentials: string[] = [];

    // Build headers from database auth configuration
    const envVarName = authConfig.envVarName || `${providerId.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envVarName];

    this.logDebugAuth(providerId, '🔍 [CredentialsResolver] Config path - checking env var:', {
      envVarName,
      apiKeyExists: !!apiKey,
    });

    if (!apiKey) {
      missingCredentials.push(envVarName);

      this.logDebugAuth(
        providerId,
        '🔍 [CredentialsResolver] API key MISSING!',
        { envVarName, missingCredentials },
        'warn'
      );

      return {
        headers: {},
        auth: {},
        isValid: false,
        missingCredentials,
      };
    }

    // Build the auth header using config-driven approach
    const headerValue = authConfig.scheme ? `${authConfig.scheme} ${apiKey}` : apiKey;

    headers[authConfig.headerName] = headerValue;

    this.logDebugAuth(providerId, '🔍 [CredentialsResolver] Built header (structure only):', {
      headerName: authConfig.headerName,
      headerValueSet: !!headerValue,
      headerKeys: Object.keys(headers),
    });

    // Add any additional required secrets as headers
    this.resolveRequiredSecrets(authConfig, envVarName, headers, missingCredentials, providerId);

    return {
      headers,
      auth,
      isValid: missingCredentials.length === 0,
      missingCredentials: missingCredentials.length > 0 ? missingCredentials : undefined,
    };
  }

  private resolveRequiredSecrets(
    authConfig: ProviderAuthConfig,
    envVarName: string,
    headers: Record<string, string>,
    missingCredentials: string[],
    providerId: string
  ): void {
    if (!authConfig.requiredSecrets) {
      return;
    }

    for (const secretName of authConfig.requiredSecrets) {
      if (secretName !== envVarName) {
        // Don't duplicate the main API key
        const secretValue = process.env[secretName];
        if (secretValue) {
          // Convert secret name to header name (e.g., ORGANIZATION_ID -> OpenAI-Organization)
          const headerName = this.secretNameToHeaderName(secretName, providerId);
          headers[headerName] = secretValue;
        } else {
          missingCredentials.push(secretName);
        }
      }
    }
  }

  private logDebugAuth(
    providerId: string,
    message: string,
    data: Record<string, unknown>,
    level: 'info' | 'warn' = 'info'
  ): void {
    if (
      providerId === 'musicapi' &&
      process.env.DEBUG_PROVIDER_AUTH === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      if (level === 'warn') {
        logger.warn(message, data);
      } else {
        logger.info(message, data);
      }
    }
  }

  /**
   * Convert environment variable names to appropriate header names
   * This handles common patterns like ORGANIZATION_ID -> OpenAI-Organization
   */
  private secretNameToHeaderName(secretName: string, providerId: string): string {
    const upperSecretName = secretName.toUpperCase();
    const upperProviderId = providerId.toUpperCase();

    // Common header name mappings
    const headerMappings: Record<string, string> = {
      ORGANIZATION_ID: 'OpenAI-Organization',
      PROJECT_ID: 'OpenAI-Project',
      WORKSPACE_ID: 'X-Workspace-ID',
      ANTHROPIC_VERSION: 'anthropic-version',
    };

    // Check for direct mapping first
    if (headerMappings[upperSecretName]) {
      return headerMappings[upperSecretName];
    }

    // Check for provider-specific mappings
    const providerSpecificKey = `${upperProviderId}_${upperSecretName}`;
    if (headerMappings[providerSpecificKey]) {
      return headerMappings[providerSpecificKey];
    }

    // Default: convert to header format (e.g., MY_SECRET -> X-My-Secret)
    const formatted = upperSecretName
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('-');

    return `X-${formatted}`;
  }

  /**
   * Validate that required credentials are available
   * Simplified replacement for SecretManager.validateSecrets()
   */
  validateCredentials(
    providerId: string,
    authConfig?: ProviderAuthConfig
  ): {
    valid: boolean;
    missingCredentials: string[];
    availableCredentials: string[];
  } {
    const credentials = this.resolveCredentials(providerId, authConfig);

    return {
      valid: credentials.isValid,
      missingCredentials: credentials.missingCredentials || [],
      availableCredentials: Object.keys(credentials.headers),
    };
  }

  /**
   * Get masked credentials for display/logging purposes
   * Replacement for SecretManager.getMaskedSecrets()
   */
  getMaskedCredentials(providerId: string, authConfig?: ProviderAuthConfig): Record<string, string> {
    const envVarName = authConfig?.envVarName || `${providerId.toUpperCase()}_API_KEY`;
    const masked: Record<string, string> = {};

    this.maskEnvVar(envVarName, masked);

    // Add any additional required secrets
    if (authConfig?.requiredSecrets) {
      for (const secretName of authConfig.requiredSecrets) {
        if (secretName !== envVarName) {
          this.maskEnvVar(secretName, masked);
        }
      }
    }

    return masked;
  }

  private maskEnvVar(envVarName: string, masked: Record<string, string>): void {
    const value = process.env[envVarName];
    if (value && value.length > 8) {
      masked[envVarName] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    } else if (value) {
      masked[envVarName] = '***';
    } else {
      masked[envVarName] = '[NOT SET]';
    }
  }

  /**
   * Clear credentials cache for a specific provider
   */
  clearProviderCache(providerId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.credentialCache.keys()) {
      if (key.startsWith(`${providerId}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.credentialCache.delete(key);
    }
  }

  /**
   * Clear all cached credentials
   */
  clearAllCache(): void {
    this.credentialCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedCredentials: number;
    oldestCacheEntry: Date | null;
    newestCacheEntry: Date | null;
  } {
    let oldestExpiry = Number.MAX_VALUE;
    let newestExpiry = 0;

    for (const { expires } of this.credentialCache.values()) {
      if (expires < oldestExpiry) oldestExpiry = expires;
      if (expires > newestExpiry) newestExpiry = expires;
    }

    return {
      cachedCredentials: this.credentialCache.size,
      oldestCacheEntry: oldestExpiry === Number.MAX_VALUE ? null : new Date(oldestExpiry),
      newestCacheEntry: newestExpiry === 0 ? null : new Date(newestExpiry),
    };
  }
}

export const credentialsResolver = new CredentialsResolver();
